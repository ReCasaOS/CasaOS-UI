// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, actUrl, cardUrl, getCard, getCards } from './moduleCards.js'
import { instance as shared } from './service.js'

const replace = vi.fn()
vi.mock('@/router', () => ({ default: { replace: (...args) => replace(...args) } }))
vi.mock('@/store', () => ({ default: { commit() {} } }))

const ROUTE = '/v1/wake_on_lan'
const ok = '{"success":200,"message":"ok","data":{"modules":[]}}'
const answer = (body, status = 200) => () => Promise.resolve(new Response(body, { status }))
const redirect = () => Promise.reject(new TypeError('Failed to fetch: redirect mode is set to error'))

let fetchMock
beforeEach(() => {
	replace.mockClear()
	localStorage.clear()
	fetchMock = vi.fn(answer(ok))
	vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllGlobals()
})

const sent = (index = 0) => ({ url: fetchMock.mock.calls[index][0], init: fetchMock.mock.calls[index][1] })

describe('the address of a card or of an action', () => {
	it('is the route and the path, joined once, exactly', () => {
		expect(cardUrl(ROUTE, '/card')).toBe('/v1/wake_on_lan/card')
		expect(cardUrl(ROUTE, '/wake')).toBe('/v1/wake_on_lan/wake')
		expect(cardUrl('/v2/a1', '/')).toBe('/v2/a1/')
	})

	it.each(['//evil.example/x', '/../sys/reboot', '/a/../b', '/a//b', '/a?x=1', '/a#x', '/a\\b', '/a\nb', '/a\u0000', '/a%2e%2e/b', '/a%2F', 'wake', 'https://evil.example/x', '', undefined, 5, `/${'a'.repeat(200)}`])('refuses the path %j', (path) => {
		expect(() => cardUrl(ROUTE, path)).toThrow()
	})

	it.each(['v1/wake', '/v1/', '/v1/Wake', '/v1/wake/x', 'https://evil.example/v1/wake', '//evil.example/v1/wake', '/v1/wake?x', '/x/wake', `/v1/${'a'.repeat(41)}`, undefined, null, 5])('refuses the route %j', (route) => {
		expect(() => cardUrl(route, '/card')).toThrow()
	})
})

describe('the client of the cards', () => {
	it('asks the list of the cards from the core, with the token as the dashboard sends it, read when the call is made', async () => {
		localStorage.setItem('access_token', 'tok-1')
		expect(await getCards()).toEqual({ data: { success: 200, message: 'ok', data: { modules: [] } } })
		expect(sent().url).toBe('/v1/sys/modules/cards')
		expect(sent().init.method).toBe('GET')
		expect(sent().init.headers.Authorization).toBe('tok-1')

		localStorage.setItem('access_token', 'tok-2')
		await getCards()
		expect(sent(1).init.headers.Authorization).toBe('tok-2')
	})

	it('sends no Authorization header when there is no token', async () => {
		await getCards()
		expect(sent().init.headers).not.toHaveProperty('Authorization')
	})

	it('asks the card of a module under its route, and only there', async () => {
		await getCard(ROUTE)
		expect(sent().url).toBe('/v1/wake_on_lan/card')
		expect(() => getCard('https://evil.example')).toThrow()
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})

	it('does not follow a redirect, nor send a cookie of another origin', async () => {
		await getCard(ROUTE)
		expect(sent().init).toMatchObject({ redirect: 'error', credentials: 'same-origin' })
	})

	it('posts an action under the route, with its body or an empty object', async () => {
		await act(ROUTE, '/wake', { mac: 'aa:bb' })
		expect(sent().init.method).toBe('POST')
		expect(sent().url).toBe('/v1/wake_on_lan/wake')
		expect(JSON.parse(sent().init.body)).toEqual({ mac: 'aa:bb' })
		await act(ROUTE, '/wake-all')
		expect(JSON.parse(sent(1).init.body)).toEqual({})
		expect(() => act(ROUTE, '/../sys/reboot', {})).toThrow()
		expect(fetchMock).toHaveBeenCalledTimes(2)
	})

	it('keeps a __proto__ key of a body as data', async () => {
		await act(ROUTE, '/wake', JSON.parse('{"__proto__":{"admin":true},"a":1}'))
		expect(sent().init.body).toBe('{"__proto__":{"admin":true},"a":1}')
		expect(({}).admin).toBeUndefined()
	})

	it('is not a failure when an action answers with nothing at all', async () => {
		for (const [body, status] of [['', 204], ['', 200], ['  \n', 200]]) {
			fetchMock.mockImplementation(answer(body, status))
			await expect(act(ROUTE, '/wake')).resolves.toEqual({ data: null })
		}
	})

	it('keeps the status of an error whatever its body is: JSON, a text, an HTML page, nothing', async () => {
		for (const [body, status] of [['404 page not found', 404], ['<html>Unauthorized</html>', 401], ['{"message":"no"}', 403], ['', 500]]) {
			fetchMock.mockImplementation(answer(body, status))
			await expect(getCard(ROUTE)).rejects.toMatchObject({ status })
		}
		fetchMock.mockImplementation(answer('{"message":"No such machine"}', 500))
		await expect(act(ROUTE, '/wake')).rejects.toMatchObject({ status: 500, data: { message: 'No such machine' } })
		fetchMock.mockImplementation(answer('nope', 500))
		await expect(act(ROUTE, '/wake')).rejects.toMatchObject({ status: 500, data: null })
	})

	it('refuses a 2xx that is not JSON, with no status', async () => {
		fetchMock.mockImplementation(answer('<html>not json</html>'))
		const error = await getCard(ROUTE).catch(e => e)
		expect(error).toBeInstanceOf(Error)
		expect(error.status).toBeUndefined()
	})

	// the browser's fetch with redirect: 'error' rejects on a 302 and on a 307, before anything is sent to where they point
	it('treats a redirect as a failure, and asks once', async () => {
		fetchMock.mockImplementation(redirect)
		expect((await getCard(ROUTE).catch(e => e)).status).toBeUndefined()
		await expect(act(ROUTE, '/wake', { a: 1 })).rejects.toBeInstanceOf(Error)
		expect(fetchMock).toHaveBeenCalledTimes(2)
		for (const call of fetchMock.mock.calls)
			expect(call[1].redirect).toBe('error')
	})

	it('reads at most 16 KiB, counted in bytes', async () => {
		fetchMock.mockImplementation(answer(JSON.stringify({ pad: 'x'.repeat(16000) })))
		await expect(getCard(ROUTE)).resolves.toMatchObject({ data: { pad: expect.any(String) } })
		fetchMock.mockImplementation(answer(JSON.stringify({ pad: 'x'.repeat(16384) })))
		await expect(getCard(ROUTE)).rejects.toBeTruthy()
		// 9000 characters of 2 bytes each are 18000 bytes, and under 16384 characters
		fetchMock.mockImplementation(answer(JSON.stringify({ pad: 'é'.repeat(9000) })))
		await expect(getCard(ROUTE)).rejects.toThrow('too long')
		// and the end of the answer is not waited for
		const cancel = vi.fn(() => Promise.resolve())
		const chunk = new Uint8Array(10000)
		const reader = { read: vi.fn(() => Promise.resolve({ done: false, value: chunk })), cancel }
		fetchMock.mockImplementation(() => Promise.resolve({ ok: true, status: 200, body: { getReader: () => reader } }))
		await expect(getCard(ROUTE)).rejects.toThrow('too long')
		expect(reader.read).toHaveBeenCalledTimes(2)
		expect(cancel).toHaveBeenCalled()
	})

	it('gives up after five seconds, on an answer that does not come and on one that stops half way', async () => {
		vi.useFakeTimers()
		const aborted = signal => new Promise((resolve, reject) => {
			signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
		})
		fetchMock.mockImplementation((url, init) => aborted(init.signal))
		const stalled = getCard(ROUTE).catch(e => e)
		await vi.advanceTimersByTimeAsync(4999)
		expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false)
		await vi.advanceTimersByTimeAsync(1)
		expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
		expect(await stalled).toMatchObject({ name: 'AbortError' })

		fetchMock.mockImplementation((url, init) => Promise.resolve({
			ok: true,
			status: 200,
			body: { getReader: () => ({ read: () => aborted(init.signal), cancel: () => Promise.resolve() }) },
		}))
		const slow = getCard(ROUTE).catch(e => e)
		await vi.advanceTimersByTimeAsync(5000)
		expect(await slow).toMatchObject({ name: 'AbortError' })
	})

	it('has none of the interceptors of the shared client: a 401 neither refreshes the token nor signs out, a 403 says nothing', async () => {
		localStorage.setItem('access_token', 'old')
		localStorage.setItem('refresh_token', 'r0')
		const common = vi.fn(() => Promise.resolve({ data: {}, status: 200, statusText: 'x', headers: {}, config: {} }))
		shared.defaults.adapter = common
		for (const status of [401, 403, 404]) {
			fetchMock.mockImplementation(answer('', status))
			await expect(getCard(ROUTE)).rejects.toMatchObject({ status })
		}
		expect(common).not.toHaveBeenCalled()
		expect(replace).not.toHaveBeenCalled()
		expect(localStorage.getItem('access_token')).toBe('old')
		expect(localStorage.getItem('refresh_token')).toBe('r0')
		expect(fetchMock).toHaveBeenCalledTimes(3)
	})
})

describe('a body over 16 KiB', () => {
	it('is refused before anything is sent, in bytes', () => {
		expect(() => act(ROUTE, '/wake', { pad: 'x'.repeat(16384) })).toThrow()
		expect(() => act(ROUTE, '/wake', { pad: 'é'.repeat(9000) })).toThrow()
		expect(fetchMock).not.toHaveBeenCalled()
	})
})

describe('the time that a call may take', () => {
	const stalled = () => fetchMock.mockImplementation((url, init) => new Promise((resolve, reject) => {
		init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
	}))

	it('is 35 s for the list of the cards, which is the core\'s, and 5 s for a card and an action', async () => {
		vi.useFakeTimers()
		stalled()
		const list = getCards().catch(e => e)
		const one = getCard(ROUTE).catch(e => e)
		const post = act(ROUTE, '/wake').catch(e => e)
		await vi.advanceTimersByTimeAsync(5000)
		expect(fetchMock.mock.calls.map(call => call[1].signal.aborted)).toEqual([false, true, true])
		await vi.advanceTimersByTimeAsync(30000)
		expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
		expect(await list).toMatchObject({ name: 'AbortError' })
		expect(await one).toMatchObject({ name: 'AbortError' })
		expect(await post).toMatchObject({ name: 'AbortError' })
	})
})

describe('an action at the address that its description gave', () => {
	it('is sent to that address, when it is under the route', async () => {
		await actUrl(ROUTE, `${ROUTE}/wake`, { a: 1 })
		expect(sent().url).toBe('/v1/wake_on_lan/wake')
		expect(JSON.parse(sent().init.body)).toEqual({ a: 1 })
	})

	it.each(['/v1/other/wake', '/v1/wake_on_lan', '/v1/wake_on_lanx/wake', 'https://evil.example/v1/wake_on_lan/x', '/v1/wake_on_lan/../x', '/v1/wake_on_lan//x', '', undefined])('refuses %j, which is not under the route', (url) => {
		expect(() => actUrl(ROUTE, url)).toThrow()
		expect(fetchMock).not.toHaveBeenCalled()
	})
})
