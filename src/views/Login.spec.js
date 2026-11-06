// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/plugins/i18n'
import '@/plugins/vee-validate'
import Login from '@/views/Login.vue'

// require.context has no Vite equivalent; an empty table makes $t return its key.
vi.mock('@/assets/lang', () => ({ default: { en_us: {} } }))

/**
 * A real mount with the real $t. The smoke test in __tests__/mount.spec.js
 * stubs <VeeField> and mocks $t as identity, so it kept passing while the
 * served bundle rendered the Username field alone: `$t(errors)` handed an
 * array to vue-i18n 9, which throws where vue-i18n 8 translated it, and Vue
 * replaced the throwing Field with a comment node.
 */
describe('login', () => {
	it('renders the username and password inputs', () => {
		const wrapper = mount(Login, { global: { plugins: [Buefy, i18n] } })
		expect(wrapper.findAll('input')).toHaveLength(2)
		wrapper.unmount()
	})
})

const session = {
	token: { access_token: 'a', refresh_token: 'r', expires_at: 1 },
	user: { id: 1, username: 'root', totp_enabled: true },
}

function mountWithApi(login, verify2FA, query = {}) {
	const $api = {
		users: { login, verify2FA },
		// Every other service is down, which is what the minute after an update looks
		// like: the user service is back -- that is what the update dialog waited for --
		// and the core is still restarting. Signing in must not depend on any of it.
		sys: { getVersion: () => Promise.reject(new Error('502 Bad Gateway')) },
	}
	const $router = { push: vi.fn() }
	const wrapper = mount(Login, { global: { plugins: [Buefy, i18n], mocks: { $api, $router, $route: { query }, $store: { commit: vi.fn() } } } })
	return { wrapper, $router }
}

async function submitPassword(wrapper) {
	const [username, password] = wrapper.findAll('input')
	await username.setValue('root')
	await password.setValue('secret')
	await wrapper.find('button.is-primary').trigger('click')
	await flushPromises()
}

// The session is written to localStorage and then the router is told to go. Between
// those two the code used to await the system version, for a router-guard cache that
// nothing else read: when that call failed the await threw, the navigation never ran,
// and the person was left on the login page holding a valid session and an error
// message. Signing in again once the core answered is what made an update cost two
// logins.
describe('a login that lands', () => {
	beforeEach(() => localStorage.clear())

	it('reaches the dashboard while the rest of the box is still coming back', async () => {
		const noSecondFactor = () => Promise.resolve({ data: { success: 200, data: { ...session, user: { ...session.user, totp_enabled: false } } } })
		const { wrapper, $router } = mountWithApi(noSecondFactor)

		await submitPassword(wrapper)

		expect($router.push).toHaveBeenCalledWith('/')
		expect(localStorage.getItem('access_token')).toBe('a')
		expect(localStorage.getItem('refresh_token')).toBe('r')
		wrapper.unmount()
	})
})

describe('login with two-factor authentication', () => {
	const preAuth = () => Promise.resolve({ data: { success: 10014, data: { pre_auth_token: 't', expires_at: Date.now() / 1000 + 300 } } })

	beforeEach(() => localStorage.clear())

	it('switches to the code step without opening a session', async () => {
		const { wrapper, $router } = mountWithApi(preAuth)
		await submitPassword(wrapper)
		const inputs = wrapper.findAll('input')
		expect(inputs).toHaveLength(1)
		expect(inputs[0].attributes('inputmode')).toBe('numeric')
		expect(inputs[0].attributes('autocomplete')).toBe('one-time-code')
		expect(localStorage.getItem('access_token')).toBeNull()
		expect($router.push).not.toHaveBeenCalled()
		wrapper.unmount()
	})

	it('verifies the code and finishes the login', async () => {
		const verify2FA = vi.fn(() => Promise.resolve({ data: { success: 200, data: session } }))
		const { wrapper, $router } = mountWithApi(preAuth, verify2FA)
		await submitPassword(wrapper)
		await wrapper.find('input').setValue('123456')
		await wrapper.find('input').trigger('keyup', { key: 'Enter' })
		await flushPromises()
		expect(verify2FA).toHaveBeenCalledWith({ pre_auth_token: 't', code: '123456' })
		expect(localStorage.getItem('access_token')).toBe('a')
		expect(localStorage.getItem('refresh_token')).toBe('r')
		expect(localStorage.getItem('expires_at')).toBe('1')
		expect(JSON.parse(localStorage.getItem('user')).username).toBe('root')
		expect($router.push).toHaveBeenCalledWith('/')
		wrapper.unmount()
	})

	it('returns to the password step when the pre-auth token is rejected', async () => {
		const verify2FA = () => Promise.reject(Object.assign(new Error('expired'), { response: { status: 400, data: { success: 20006, message: 'expired' } } }))
		const { wrapper, $router } = mountWithApi(preAuth, verify2FA)
		await submitPassword(wrapper)
		await wrapper.find('input').setValue('123456')
		await wrapper.find('button.is-primary').trigger('click')
		await flushPromises()
		expect(wrapper.findAll('input')).toHaveLength(2)
		expect(wrapper.find('.notification').text()).toContain('expired')
		expect($router.push).not.toHaveBeenCalled()
		wrapper.unmount()
	})

	it('sends a recovery code after the toggle', async () => {
		const verify2FA = vi.fn(() => Promise.resolve({ data: { success: 200, data: session } }))
		const { wrapper } = mountWithApi(preAuth, verify2FA)
		await submitPassword(wrapper)
		await wrapper.find('a').trigger('click')
		const input = wrapper.find('input')
		expect(input.attributes('inputmode')).toBeUndefined()
		await input.setValue('abcde-fghij')
		await wrapper.find('button.is-primary').trigger('click')
		await flushPromises()
		expect(verify2FA).toHaveBeenCalledWith({ pre_auth_token: 't', recovery_code: 'abcde-fghij' })
		wrapper.unmount()
	})
})

// A link opened signed out (#/terminal, #/files) ends where it pointed.
describe('a login from a link', () => {
	beforeEach(() => localStorage.clear())

	it('goes back to the page the link opened', async () => {
		const noSecondFactor = () => Promise.resolve({ data: { success: 200, data: { ...session, user: { ...session.user, totp_enabled: false } } } })
		const { wrapper, $router } = mountWithApi(noSecondFactor, undefined, { redirect: '/terminal' })

		await submitPassword(wrapper)

		expect($router.push).toHaveBeenCalledWith('/terminal')
	})

	it('goes back there after the second factor too', async () => {
		const verify2FA = vi.fn(() => Promise.resolve({ data: { success: 200, data: session } }))
		const preAuth = () => Promise.resolve({ data: { success: 10014, data: { pre_auth_token: 't', expires_at: Date.now() / 1000 + 300 } } })
		const { wrapper, $router } = mountWithApi(preAuth, verify2FA, { redirect: '/files?path=%2FDATA' })

		await submitPassword(wrapper)
		await wrapper.find('input').setValue('123456')
		await wrapper.find('input').trigger('keyup', { key: 'Enter' })
		await flushPromises()

		expect($router.push).toHaveBeenCalledWith('/files?path=%2FDATA')
		wrapper.unmount()
	})

	it.each(['//evil.example', '/\\evil.example', 'https://evil.example', '/%2F%2Fevil.example', '/%5Cevil.example', '/\t/evil.example'])('ends on the dashboard for %j', async (redirect) => {
		const noSecondFactor = () => Promise.resolve({ data: { success: 200, data: { ...session, user: { ...session.user, totp_enabled: false } } } })
		const { wrapper, $router } = mountWithApi(noSecondFactor, undefined, { redirect })

		await submitPassword(wrapper)

		expect($router.push).toHaveBeenCalledWith('/')
		wrapper.unmount()
	})
})

// The new login page (beta): the router asked the box which page to be before
// this page opened, and put it in the store. The sign-in and the second factor
// are the classic page's own.
describe('the new login page', () => {
	const preAuth = () => Promise.resolve({ data: { success: 10014, data: { pre_auth_token: 't', expires_at: Date.now() / 1000 + 300 } } })

	function mountStyled(loginStyle, login, verify2FA) {
		// no getUserStatus: the page asks nothing of its own
		const $api = { users: { login, verify2FA } }
		const $router = { push: vi.fn() }
		const $store = { state: { loginStyle }, commit: vi.fn() }
		const wrapper = mount(Login, { global: { plugins: [Buefy, i18n], mocks: { $api, $router, $store, $route: { query: {} } } } })
		return { wrapper, $router }
	}

	async function signIn(wrapper) {
		const [username, password] = wrapper.findAll('input')
		await username.setValue('root')
		await password.setValue('secret')
		await wrapper.find('button.login-go').trigger('click')
		await flushPromises()
	}

	beforeEach(() => localStorage.clear())

	it('is the classic page on a box that never chose', () => {
		for (const style of ['classic', undefined]) {
			const { wrapper } = mountStyled(style)
			expect(wrapper.find('.login-beta').exists()).toBe(false)
			expect(wrapper.find('.login-panel').exists()).toBe(true)
			wrapper.unmount()
		}
	})

	it('is the card when the box says beta', () => {
		const { wrapper } = mountStyled('beta')
		expect(wrapper.find('.login-beta .login-card').exists()).toBe(true)
		expect(wrapper.find('.login-greeting').text()).toBe('Welcome back to ReCasaOS')
		expect(wrapper.find('.login-logo img').attributes('alt')).toBe('ReCasaOS')
		expect(wrapper.findAll('input')).toHaveLength(2)
		wrapper.unmount()
	})

	it('signs in with the arrow, which waits for both fields', async () => {
		const login = vi.fn(() => Promise.resolve({ data: { success: 200, data: { ...session, user: { ...session.user, totp_enabled: false } } } }))
		const { wrapper, $router } = mountStyled('beta', login)
		await flushPromises()
		expect(wrapper.find('button.login-go').attributes('disabled')).toBeDefined()
		await signIn(wrapper)
		expect(login).toHaveBeenCalledWith('root', 'secret')
		expect($router.push).toHaveBeenCalledWith('/')
		expect(localStorage.getItem('access_token')).toBe('a')
		wrapper.unmount()
	})

	it('says so under a field left empty', async () => {
		const { wrapper } = mountStyled('beta')
		await flushPromises()
		await wrapper.findAll('input')[0].trigger('blur')
		expect(wrapper.find('.help').text()).toBe('Enter the username')
		wrapper.unmount()
	})

	it('asks for the second factor, and a recovery code after the toggle', async () => {
		const verify2FA = vi.fn(() => Promise.resolve({ data: { success: 200, data: session } }))
		const { wrapper, $router } = mountStyled('beta', preAuth, verify2FA)
		await flushPromises()
		await signIn(wrapper)

		const code = wrapper.find('input')
		expect(wrapper.findAll('input')).toHaveLength(1)
		expect(code.attributes('autocomplete')).toBe('one-time-code')
		expect(localStorage.getItem('access_token')).toBeNull()

		await wrapper.find('a.login-link').trigger('click')
		await wrapper.find('input').setValue('abcde-fghij')
		await wrapper.find('button.login-go').trigger('click')
		await flushPromises()
		expect(verify2FA).toHaveBeenCalledWith({ pre_auth_token: 't', recovery_code: 'abcde-fghij' })
		expect($router.push).toHaveBeenCalledWith('/')
		wrapper.unmount()
	})

	it('shows a refused password and stays', async () => {
		const login = () => Promise.reject(Object.assign(new Error('x'), { response: { status: 400, data: { success: 10013, message: 'Invalid password' } } }))
		const { wrapper, $router } = mountStyled('beta', login)
		await flushPromises()
		await signIn(wrapper)
		expect(wrapper.find('.notification').text()).toContain('Invalid password')
		expect(wrapper.find('button.login-go').classes()).not.toContain('is-loading')
		expect($router.push).not.toHaveBeenCalled()
		wrapper.unmount()
	})
})
