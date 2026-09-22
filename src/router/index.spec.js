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
	return { default: createStore({ state: { access_token: '', refresh_token: '', needInitialization: false }, mutations }) }
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
