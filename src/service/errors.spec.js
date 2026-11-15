// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The interceptor keeps what it has told in the module: each test loads service.js anew, with a fake adapter that sees the
// requests as XHR would.
const { replace, open } = vi.hoisted(() => ({ replace: vi.fn(), open: vi.fn() }))
vi.mock('@/router', () => ({ default: { replace } }))
vi.mock('@/store', () => ({ default: { commit() {} } }))
vi.mock('buefy', () => ({ ToastProgrammatic: class {
	open(...args) {
		return open(...args)
	}
} }))

const reply = (status, data) => config => Promise.reject(Object.assign(new Error(String(status)), { config, response: { status, data, config } }))
const forbidden = reply(403, { success: 10011, message: 'Insufficient permissions' })
const gateway503 = reply(503, { success: 500, message: 'Fail' })
const fine = config => Promise.resolve({ data: 'ok', status: 200, statusText: 'OK', headers: {}, config })

let instance
let adapter
let i18n

beforeEach(async () => {
	vi.resetModules()
	vi.useFakeTimers()
	replace.mockClear()
	open.mockClear()
	localStorage.setItem('access_token', 'old')
	localStorage.setItem('refresh_token', 'r0')
	instance = (await import('./service.js')).instance
	i18n = (await import('@/plugins/i18n')).default
	i18n.global.locale = 'en_us'
	adapter = vi.fn(fine)
	instance.defaults.adapter = adapter
})

afterEach(() => vi.useRealTimers())

describe('a refusal of the Gateway on account of the role', () => {
	it.each([['en_us', 'You do not have the right to do this.'], ['fr_fr', 'Vous n\'avez pas le droit de faire cela.']])('is one translated toast in %s', async (locale, sentence) => {
		i18n.global.locale = locale
		adapter.mockImplementationOnce(forbidden)

		await expect(instance.get('/v1/sys/hardware')).rejects.toBeTruthy()

		expect(open).toHaveBeenCalledTimes(1)
		expect(open.mock.calls[0][0].message).toBe(sentence)
	})

	it('gives one toast for two refusals less than 3 s apart, and another once 3 s have passed', async () => {
		adapter.mockImplementation(forbidden)
		await instance.get('/v1/a').catch(() => {})
		vi.advanceTimersByTime(2000)
		await instance.get('/v1/b').catch(() => {})
		expect(open).toHaveBeenCalledTimes(1)

		vi.advanceTimersByTime(1500)
		await instance.get('/v1/c').catch(() => {})
		expect(open).toHaveBeenCalledTimes(2)
	})

	it('leaves the callers a sentence to show, not an empty one', async () => {
		adapter.mockImplementationOnce(forbidden)
		const error = await instance.get('/v1/sys/hardware').catch(e => e)

		expect(error.response.status).toBe(403)
		expect(error.response.data.data).toBe('You do not have the right to do this.')
		expect(error.response.data.message).toBe('You do not have the right to do this.')
	})

	it('is not said for a 403 that is not the role\'s', async () => {
		adapter.mockImplementationOnce(reply(403, { success: 10002, message: 'something else' }))
		await instance.get('/v1/x').catch(() => {})

		expect(open).not.toHaveBeenCalled()
	})

	it('shows no toast for an error that has no answer at all', async () => {
		adapter.mockImplementationOnce(config => Promise.reject(Object.assign(new Error('Network Error'), { config })))
		await expect(instance.get('/v1/x')).rejects.toThrow('Network Error')

		expect(open).not.toHaveBeenCalled()
	})

	it('shows no toast for an error that has neither a config nor an answer', async () => {
		adapter.mockImplementationOnce(() => Promise.reject(new Error('boom')))
		await expect(instance.get('/v1/x')).rejects.toThrow('boom')

		expect(open).not.toHaveBeenCalled()
	})
})

describe('a 503 of the Gateway', () => {
	it('is one translated toast, and the user stays signed in', async () => {
		adapter.mockImplementation(gateway503)
		await instance.get('/v1/a').catch(() => {})
		await instance.get('/v1/b').catch(() => {})

		expect(open).toHaveBeenCalledTimes(1)
		expect(open.mock.calls[0][0].message).toBe('The service is temporarily unavailable.')
		expect(replace).not.toHaveBeenCalled()
	})

	it('is told in French', async () => {
		i18n.global.locale = 'fr_fr'
		adapter.mockImplementationOnce(gateway503)
		await instance.get('/v1/a').catch(() => {})

		expect(open.mock.calls[0][0].message).toBe('Le service est momentanément indisponible.')
	})

	it('does not sign the user out when the box cannot answer the refresh either', async () => {
		adapter
			.mockImplementationOnce(reply(401, {})) // the call
			.mockImplementationOnce(gateway503) // the refresh
		await instance.get('/v1/a').catch(() => {})

		expect(replace).not.toHaveBeenCalled()
		expect(open).toHaveBeenCalledTimes(1)
	})
})

describe('a 503 with a reason of a service', () => {
	it('is left to its callers, with no toast of its own', async () => {
		adapter.mockImplementationOnce(reply(503, { message: 'stats_unavailable' }))
		const error = await instance.get('/v1/a').catch(e => e)

		expect(open).not.toHaveBeenCalled()
		expect(error.response.data.message).toBe('stats_unavailable')
	})
})

describe('a 401', () => {
	it('still signs the user out when the refresh is refused', async () => {
		adapter
			.mockImplementationOnce(reply(401, {}))
			.mockImplementationOnce(reply(401, {}))
		await instance.get('/v1/a').catch(() => {})

		expect(replace).toHaveBeenCalledWith({ path: '/logout' })
		expect(open).not.toHaveBeenCalled()
	})
})
