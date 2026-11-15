// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AccountPanel from '@/components/account/AccountPanel.vue'

vi.mock('@/assets/lang', () => ({ default: { en_us: {} } }))

// The method on its own: the panel around it (the cropper, the form) has no part in it.
function panel(changePassword) {
	const commits = []
	const ctx = {
		$api: { users: { changePassword } },
		$store: { commit: (name, value) => commits.push([name, value]) },
		goto: vi.fn(),
		oriPassword: 'old one',
		password: 'new one',
		confirmation: 'new one',
		isLoading: false,
		notificationShow: false,
		message: '',
	}
	return { ctx, commits, save: () => AccountPanel.methods.savePassword.call(ctx) }
}

// A password change ends every session of the account, the one that made it too: the user
// service answers with the tokens that session goes on with.
describe('changing the password', () => {
	beforeEach(() => {
		localStorage.setItem('access_token', 'a1')
		localStorage.setItem('refresh_token', 'r1')
		localStorage.setItem('expires_at', '1')
	})

	it('keeps the tokens the change answers with, where the requests and the message bus read them', async () => {
		const token = { access_token: 'a2', refresh_token: 'r2', expires_at: 2 }
		const { ctx, commits, save } = panel(vi.fn(() => Promise.resolve({ data: { success: 200, data: { token, user: { id: 1 } } } })))

		await save()

		expect(localStorage.getItem('access_token')).toBe('a2')
		expect(localStorage.getItem('refresh_token')).toBe('r2')
		expect(localStorage.getItem('expires_at')).toBe('2')
		expect(commits).toEqual([['SET_ACCESS_TOKEN', 'a2'], ['SET_REFRESH_TOKEN', 'r2']])
		expect(ctx.goto).toHaveBeenCalledWith(1)
		expect(ctx.password).toBe('')
	})

	it('leaves the session as it is when an older user service answers with the user alone', async () => {
		const { ctx, commits, save } = panel(vi.fn(() => Promise.resolve({ data: { success: 200, data: { id: 1, username: 'root' } } })))

		await save()

		expect(localStorage.getItem('access_token')).toBe('a1')
		expect(localStorage.getItem('refresh_token')).toBe('r1')
		expect(commits).toEqual([])
		expect(ctx.goto).toHaveBeenCalledWith(1)
	})
})

// The login name of an account is the owner's to choose: the server refuses a user's change of it.
describe('the login name', () => {
	it.each([['admin', true], ['user', false]])('is editable by the %s: %s', async (role, editable) => {
		const { shallowMount } = await import('@vue/test-utils')
		const user = { id: 2, username: 'ann', role }
		const wrapper = shallowMount(AccountPanel, {
			global: {
				stubs: { VeeForm: { template: '<span><slot :handle-submit="() => {}" /></span>' } },
				mocks: { $t: key => key, $store: { state: { user }, getters: { canWrite: role === 'admin' } } },
			},
		})

		expect(wrapper.text()).toContain('ann')
		expect(wrapper.findAll('.edit-button').length).toBe(editable ? 3 : 2)
		wrapper.unmount()
	})
})
