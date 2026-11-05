// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import router from '@/router'
import store from '@/store'
import api from '@/service/api'

// The real store pulls webpack-only asset requires in with its state; its
// mutations are all the guard touches.
vi.mock('@/store', async () => {
	const { createStore } = await import('vuex')
	const { default: mutations } = await import('@/store/mutations')
	return { default: createStore({ state: { access_token: '', refresh_token: '', needInitialization: false, loginStyle: 'classic' }, mutations }) }
})
vi.mock('@/service/api', () => ({
	default: { users: { getUserStatus: vi.fn() } },
}))
vi.mock('@/views/Login.vue', () => ({ default: { render: () => null } }))
vi.mock('@/views/Welcome.vue', () => ({ default: { render: () => null } }))

function signedIn() {
	localStorage.setItem('access_token', 'jwt')
	localStorage.setItem('refresh_token', 'refresh')
	store.commit('SET_ACCESS_TOKEN', 'jwt')
	store.commit('SET_REFRESH_TOKEN', 'refresh')
}

// The message bus socket follows the store's token, so forgetting it in
// localStorage alone would leave the socket connected after a logout.
describe('forgetting the session', () => {
	beforeEach(() => {
		store.commit('SET_NEED_INITIALIZATION', false)
		api.users.getUserStatus.mockResolvedValue({ data: { success: 200, data: { initialized: true } } })
	})

	it('clears the store too on logout', async () => {
		signedIn()

		await router.push('/logout')

		expect(router.currentRoute.value.path).toBe('/login')
		expect(localStorage.getItem('access_token')).toBeNull()
		expect(store.state.access_token).toBe('')
		expect(store.state.refresh_token).toBe('')
	})

	it('clears the store too when the system asks to be set up again', async () => {
		signedIn()
		api.users.getUserStatus.mockResolvedValue({ data: { success: 200, data: { initialized: false, key: 'k' } } })

		await router.push('/')

		expect(router.currentRoute.value.path).toBe('/welcome')
		expect(localStorage.getItem('access_token')).toBeNull()
		expect(store.state.access_token).toBe('')
	})
})

// A core that creates the first account only on the machine says so (first_admin:
// local) and hands out no key: the welcome page says where, and offers no form.
describe('a first account made on the machine', () => {
	it('keeps where the core says it is made', async () => {
		store.commit('SET_NEED_INITIALIZATION', false)
		localStorage.clear()
		api.users.getUserStatus.mockResolvedValue({ data: { success: 200, data: { initialized: false, key: '', first_admin: 'local' } } })

		await router.push('/login')

		expect(router.currentRoute.value.path).toBe('/welcome')
		expect(store.state.firstAdmin).toBe('local')
		expect(store.state.initKey).toBe('')
	})

	// an older core (no first_admin) or one that says web: the dashboard's own form, as today
	it.each([
		['an older core', { initialized: false, key: 'k1' }],
		['a core that says web', { initialized: false, key: 'k1', first_admin: 'web' }],
	])('%s: the welcome page with its form and the key', async (_, status) => {
		store.commit('SET_NEED_INITIALIZATION', false)
		store.commit('SET_FIRST_ADMIN', 'local')
		localStorage.clear()
		api.users.getUserStatus.mockResolvedValue({ data: { success: 200, data: status } })

		await router.push('/login')

		expect(router.currentRoute.value.path).toBe('/welcome')
		expect(store.state.firstAdmin).toBe('web')
		expect(store.state.initKey).toBe('k1')
	})

	it('is the dashboard\'s own form against a core that does not say', () => {
		store.commit('SET_FIRST_ADMIN', undefined)
		expect(store.state.firstAdmin).toBe('web')
	})
})

// A link to a page of the dashboard, opened signed out, ends on that page once
// signed in: the login is told where it was going.
describe('a link opened signed out', () => {
	beforeEach(() => {
		store.commit('SET_NEED_INITIALIZATION', false)
		api.users.getUserStatus.mockResolvedValue({ data: { success: 200, data: { initialized: true } } })
		localStorage.removeItem('access_token')
		store.commit('SET_ACCESS_TOKEN', '')
	})

	it('keeps where it was going for after the login', async () => {
		vi.doMock('@/views/TerminalTab.vue', () => ({ default: { render: () => null } }))
		await router.push('/terminal')

		expect(router.currentRoute.value.path).toBe('/login')
		expect(router.currentRoute.value.query.redirect).toBe('/terminal')
	})

	it('adds nothing for the dashboard itself', async () => {
		await router.push('/logout')
		await router.push('/')

		expect(router.currentRoute.value.fullPath).toBe('/login')
	})
})

// The login page asks the box nothing of its own: the guard's status call says
// which page to show, and the store (and this browser) keep it.
describe('the login style', () => {
	beforeEach(() => {
		localStorage.clear()
		store.commit('SET_NEED_INITIALIZATION', false)
	})

	it('comes from the status the guard asks anyway', async () => {
		api.users.getUserStatus.mockResolvedValue({ data: { success: 200, data: { initialized: true, login_style: 'beta' } } })
		await router.push('/login?x=1')
		expect(store.state.loginStyle).toBe('beta')
		expect(localStorage.getItem('login-style')).toBe('beta')

		api.users.getUserStatus.mockResolvedValue({ data: { success: 200, data: { initialized: true } } })
		await router.push('/login?x=2')
		expect(store.state.loginStyle).toBe('classic')
	})

	it('stays what it was when the box does not answer', async () => {
		store.commit('SET_LOGIN_STYLE', 'beta')
		api.users.getUserStatus.mockRejectedValue(new Error('502'))
		await router.push('/login?x=3')
		expect(store.state.loginStyle).toBe('beta')
	})
})
