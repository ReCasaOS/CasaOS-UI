import { describe, expect, it, vi } from 'vitest'
import { apiErrorMessage, emptyCloudOnError } from './apiError.js'

describe('apiErrorMessage', () => {
	it('does not throw on {} and reads response.message', () => {
		expect(() => apiErrorMessage({})).not.toThrow()
		expect(apiErrorMessage({})).toEqual({})
		expect(apiErrorMessage({ response: { message: 'x' } })).toBe('x')
	})
})

describe('emptyCloudOnError', () => {
	it('returns [] and does not throw', () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {})
		expect(emptyCloudOnError({})).toEqual([])
		expect(emptyCloudOnError({ response: { message: 'down' } })).toEqual([])
		log.mockRestore()
	})
})
