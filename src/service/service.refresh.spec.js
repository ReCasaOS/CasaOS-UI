// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The 401 interceptor keeps its state in the module (one refresh at a time, the
// calls that wait for it): each test loads service.js anew, with a fake adapter
// that sees the requests as XHR would.
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('@/router', () => ({ default: { replace } }))
vi.mock('@/store', () => ({ default: { commit() {} } }))

const answer = (config, data) => Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config })
const fine = config => answer(config, 'ok')
const refused = config => Promise.reject(Object.assign(new Error('401'), { config, response: { status: 401, data: '{}', config } }))
const newToken = config => answer(config, { success: 200, data: { access_token: 'new', refresh_token: 'r1', expires_at: 1 } })

let instance
let adapter

// A call the interceptor parks and never answers is the fault looked for here:
// say so, rather than let the test time out.
function outcome(call) {
	return Promise.race([
		call.then(() => 'answered', () => 'failed'),
		new Promise(resolve => setTimeout(() => resolve('left waiting'), 100)),
	])
}

const urls = () => adapter.mock.calls.map(c => c[0].url)

beforeEach(async () => {
	vi.resetModules()
	replace.mockClear()
	localStorage.setItem('access_token', 'old')
	localStorage.setItem('refresh_token', 'r0')
	instance = (await import('./service.js')).instance
	adapter = vi.fn(fine)
	instance.defaults.adapter = adapter
})

describe('a session whose refresh token is refused', () => {
	it('fails the call that needed a new token and signs the user out', async () => {
		adapter.mockImplementationOnce(refused).mockImplementationOnce(refused)

		expect(await outcome(instance.get('/v1/sys/hardware'))).toBe('failed')
		expect(urls()).toEqual(['/v1/sys/hardware', '/v1/users/refresh'])
		expect(replace).toHaveBeenCalledWith({ path: '/logout' })
	})

	it('lets the session that follows, on the same page, refresh its own token', async () => {
		adapter.mockImplementationOnce(refused).mockImplementationOnce(refused)
		await outcome(instance.get('/v1/sys/hardware'))

		// signed in again without reloading the page; later, the new access token runs out
		adapter.mockImplementationOnce(refused).mockImplementationOnce(newToken)

		expect(await outcome(instance.get('/v1/sys/utilization'))).toBe('answered')
		expect(urls().slice(2)).toEqual(['/v1/sys/utilization', '/v1/users/refresh', '/v1/sys/utilization'])
	})
})

// A token the refresh hands out and the box then refuses (the account is gone,
// for one) is a session that cannot go on: no third try, and back to the sign-in.
describe('a call the server refuses again with the new token', () => {
	it('fails once, without asking for another token, and signs the user out', async () => {
		adapter
			.mockImplementationOnce(refused) // the call
			.mockImplementationOnce(newToken) // the refresh
			.mockImplementationOnce(refused) // the call again, with the new token
			.mockImplementationOnce(newToken) // a second refresh, if one is asked for

		expect(await outcome(instance.get('/v1/sys/hardware'))).toBe('failed')
		expect(urls()).toEqual(['/v1/sys/hardware', '/v1/users/refresh', '/v1/sys/hardware'])
		expect(replace).toHaveBeenCalledWith({ path: '/logout' })
	})
})

// The refresh that fails turns away every call that waited for it, not only the first.
describe('several calls waiting for a refresh that is refused', () => {
	it('fails each of them', async () => {
		const held = []
		adapter.mockImplementation(config => config.url === '/v1/users/refresh'
			? new Promise((resolve, reject) => held.push(() => refused(config).catch(reject)))
			: refused(config))

		const calls = [instance.get('/v1/a'), instance.get('/v1/b'), instance.get('/v1/c')].map(outcome)
		await vi.waitFor(() => expect(held).toHaveLength(1)) // one refresh for the three
		held[0]()

		expect(await Promise.all(calls)).toEqual(['failed', 'failed', 'failed'])
		expect(urls().filter(url => url === '/v1/users/refresh')).toHaveLength(1)
	})
})
