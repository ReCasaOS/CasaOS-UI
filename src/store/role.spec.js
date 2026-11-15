// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

// the first import of the real store is slow when the whole suite runs at once
vi.setConfig({ testTimeout: 30000 })

async function freshStore() {
	vi.resetModules()
	return (await import('@/store')).default
}

beforeEach(() => localStorage.clear())

describe('the role at the first render', () => {
	it.each([['admin', true], ['user', false]])('starts from the account stored at sign-in (%s)', async (role, writes) => {
		localStorage.setItem('user', JSON.stringify({ id: 4, username: 'x', role }))
		const store = await freshStore()

		expect(store.state.user.role).toBe(role)
		expect(store.state.user.id).toBe(4)
		expect(store.getters.canWrite).toBe(writes)
		expect(store.getters.canReadModule('files')).toBe(writes)
		// the stored role is not yet the server's word
		expect(store.state.roleConfirmed).toBe(false)
	})

	it.each([[undefined], ['not json'], ['null'], ['[1]'], ['{"id":3}']])('has no write control and no module when what is stored is %j', async (stored) => {
		if (stored !== undefined)
			localStorage.setItem('user', stored)
		const store = await freshStore()

		expect(store.getters.isAdmin).toBe(false)
		expect(store.getters.canWrite).toBe(false)
		expect(store.getters.canReadModule('storage')).toBe(false)
	})

	it('is confirmed by the server\'s answer, and forgotten at sign-out', async () => {
		localStorage.setItem('user', JSON.stringify({ id: 4, role: 'admin' }))
		const store = await freshStore()

		store.commit('SET_USER', { id: 4, role: 'user' })
		expect(store.state.roleConfirmed).toBe(true)
		expect(store.getters.canWrite).toBe(false)

		store.commit('CLEAR_USER')
		expect(store.state.user.role).toBe('')
		expect(store.state.roleConfirmed).toBe(false)
		expect(store.getters.canWrite).toBe(false)
	})

	it('keeps the rights of the account through an answer that does not list them, and takes those of an answer that does', async () => {
		localStorage.setItem('user', JSON.stringify({ id: 4, role: 'user', rights: ['vm'] }))
		const store = await freshStore()
		expect(store.getters.canReadModule('vm')).toBe(true)

		// PUT /v1/users/current answers the account without its rights
		store.commit('SET_USER', { id: 4, role: 'user', nickname: 'x' })
		expect(store.getters.canReadModule('vm')).toBe(true)

		store.commit('SET_USER', { id: 4, role: 'user', rights: [] })
		expect(store.getters.canReadModule('vm')).toBe(false)

		// another account never inherits them
		store.commit('SET_USER', { id: 4, role: 'user', rights: ['vm'] })
		store.commit('SET_USER', { id: 5, role: 'user' })
		expect(store.getters.canReadModule('vm')).toBe(false)
	})

	it('takes a change made here (2FA on or off) without calling the role confirmed', async () => {
		localStorage.setItem('user', JSON.stringify({ id: 4, role: 'admin' }))
		const store = await freshStore()

		store.commit('SET_TOTP_ENABLED', true)
		expect(store.state.user.totp_enabled).toBe(true)
		expect(store.state.user.role).toBe('admin')
		expect(store.state.roleConfirmed).toBe(false)
	})

	it('says when the server could not confirm the role, until it does', async () => {
		localStorage.setItem('user', JSON.stringify({ id: 4, role: 'admin' }))
		const store = await freshStore()

		store.commit('SET_ROLE_UNCONFIRMED')
		expect(store.state.roleFailed).toBe(true)
		store.commit('SET_USER', { id: 4, role: 'admin' })
		expect(store.state.roleFailed).toBe(false)
	})
})
