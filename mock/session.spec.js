// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { seedMockSession } from './session.js'

function memoryStorage(initial = {}) {
	const data = { ...initial }
	return {
		getItem: key => (Object.hasOwn(data, key) ? data[key] : null),
		setItem: (key, value) => { data[key] = String(value) },
		data,
	}
}

describe('seedMockSession', () => {
	it('writes the four keys when storage is empty', () => {
		const storage = memoryStorage()
		seedMockSession(storage)
		expect(storage.getItem('access_token')).toBe('mock-access')
		expect(storage.getItem('refresh_token')).toBe('mock-refresh')
		expect(storage.getItem('expires_at')).toBe('2000000000')
		expect(JSON.parse(storage.getItem('user'))).toEqual({
			id: 1,
			username: 'casaos',
			nickname: 'casaos',
			role: 'admin',
			avatar: '',
			description: '',
		})
	})

	it('leaves storage alone when access_token is already set', () => {
		const storage = memoryStorage({ access_token: 'keep-me', user: 'old' })
		seedMockSession(storage)
		expect(storage.getItem('access_token')).toBe('keep-me')
		expect(storage.getItem('user')).toBe('old')
		expect(storage.getItem('refresh_token')).toBeNull()
	})
})
