// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { seedMockSession, clearMockSession } from './session.js'

function memoryStorage(initial = {}) {
	const data = { ...initial }
	return {
		getItem: key => (Object.hasOwn(data, key) ? data[key] : null),
		setItem: (key, value) => { data[key] = String(value) },
		removeItem: key => { delete data[key] },
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

describe('clearMockSession', () => {
	it('removes the four keys when access_token is mock-access', () => {
		const storage = memoryStorage()
		seedMockSession(storage)
		clearMockSession(storage)
		expect(storage.getItem('access_token')).toBeNull()
		expect(storage.getItem('refresh_token')).toBeNull()
		expect(storage.getItem('expires_at')).toBeNull()
		expect(storage.getItem('user')).toBeNull()
	})

	it('removes the four keys when refresh_token is mock-refresh', () => {
		const storage = memoryStorage({
			access_token: 'other',
			refresh_token: 'mock-refresh',
			expires_at: '1',
			user: '{}',
		})
		clearMockSession(storage)
		expect(storage.getItem('access_token')).toBeNull()
		expect(storage.getItem('refresh_token')).toBeNull()
		expect(storage.getItem('expires_at')).toBeNull()
		expect(storage.getItem('user')).toBeNull()
	})

	it('leaves a real JWT alone', () => {
		const storage = memoryStorage({
			access_token: 'eyJhbGciOiJIUzI1NiJ9.e30.x',
			refresh_token: 'real-refresh',
			expires_at: '9',
			user: '{"id":1}',
		})
		clearMockSession(storage)
		expect(storage.getItem('access_token')).toBe('eyJhbGciOiJIUzI1NiJ9.e30.x')
		expect(storage.getItem('refresh_token')).toBe('real-refresh')
		expect(storage.getItem('expires_at')).toBe('9')
		expect(storage.getItem('user')).toBe('{"id":1}')
	})
})
