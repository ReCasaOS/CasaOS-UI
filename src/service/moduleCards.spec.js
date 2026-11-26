// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, card, cardUrl, getCard, getCards } from './moduleCards.js'
import { instance as shared } from './service.js'

const replace = vi.fn()
vi.mock('@/router', () => ({ default: { replace: (...args) => replace(...args) } }))
vi.mock('@/store', () => ({ default: { commit() {} } }))

// a fake adapter sees the request after the transforms of the request, and answers a text, as the browser's XHR would
function answer(status, data = '{}') {
	return config => status >= 200 && status < 300
		? Promise.resolve({ data, status, statusText: 'x', headers: {}, config })
		: Promise.reject(Object.assign(new Error(`status ${status}`), { config, response: { status, data, config, headers: {} } }))
}

let adapter
beforeEach(() => {
	replace.mockClear()
	localStorage.clear()
	adapter = vi.fn(answer(200, '{"success":200,"message":"ok","data":{"modules":[]}}'))
	card.defaults.adapter = adapter
})

describe('the address of a card or of an action', () => {
	it('is the route and the path, joined once, exactly', () => {
		expect(cardUrl('/v1/wake_on_lan', '/card')).toBe('/v1/wake_on_lan/card')
		expect(cardUrl('/v1/wake_on_lan', '/wake')).toBe('/v1/wake_on_lan/wake')
		expect(cardUrl('/v2/a1', '/')).toBe('/v2/a1/')
	})

	it.each(['//evil.example/x', '/../sys/reboot', '/a/../b', '/a//b', '/a?x=1', '/a#x', '/a\\b', '/a\nb', '/a\u0000', '/a%2e%2e/b', '/a%2F', 'wake', 'https://evil.example/x', '', undefined, 5, `/${'a'.repeat(200)}`])('refuses the path %j', (path) => {
		expect(() => cardUrl('/v1/wake_on_lan', path)).toThrow()
	})

	it.each(['v1/wake', '/v1/', '/v1/Wake', '/v1/wake/x', 'https://evil.example/v1/wake', '//evil.example/v1/wake', '/v1/wake?x', '/x/wake', `/v1/${'a'.repeat(41)}`, undefined, null, 5])('refuses the route %j', (route) => {
		expect(() => cardUrl(route, '/card')).toThrow()
	})
})

describe('the client of the cards', () => {
	it('asks the list of the cards from the core, with the token as the dashboard sends it, read when the call is made', async () => {
		localStorage.setItem('access_token', 'tok-1')
		await getCards()
		expect(adapter.mock.calls[0][0].url).toBe('/v1/sys/modules/cards')
		expect(adapter.mock.calls[0][0].method).toBe('get')
		expect(adapter.mock.calls[0][0].headers.Authorization).toBe('tok-1')

		localStorage.setItem('access_token', 'tok-2')
		await getCards()
		expect(adapter.mock.calls[1][0].headers.Authorization).toBe('tok-2')
	})

	it('asks the card of a module under its route, and only there', async () => {
		await getCard('/v1/wake_on_lan')
		expect(adapter.mock.calls[0][0].url).toBe('/v1/wake_on_lan/card')
		expect(() => getCard('https://evil.example')).toThrow()
		expect(adapter).toHaveBeenCalledTimes(1)
	})

	it('posts an action under the route, with its body or an empty object', async () => {
		await act('/v1/wake_on_lan', '/wake', { mac: 'aa:bb' })
		expect(adapter.mock.calls[0][0].method).toBe('post')
		expect(adapter.mock.calls[0][0].url).toBe('/v1/wake_on_lan/wake')
		expect(JSON.parse(adapter.mock.calls[0][0].data)).toEqual({ mac: 'aa:bb' })
		await act('/v1/wake_on_lan', '/wake-all')
		expect(JSON.parse(adapter.mock.calls[1][0].data)).toEqual({})
		expect(() => act('/v1/wake_on_lan', '/../sys/reboot', {})).toThrow()
		expect(adapter).toHaveBeenCalledTimes(2)
	})

	it('waits five seconds at most, and sends no cookie', () => {
		expect(card.defaults.timeout).toBe(5000)
		expect(card.defaults.withCredentials).toBe(false)
	})

	it('reads at most 16 KiB, and refuses a body that is longer or that is not JSON', async () => {
		adapter.mockImplementation(answer(200, JSON.stringify({ pad: 'x'.repeat(16384) })))
		await expect(getCard('/v1/wake_on_lan')).rejects.toBeTruthy()
		adapter.mockImplementation(answer(200, JSON.stringify({ pad: 'x'.repeat(16000) })))
		await expect(getCard('/v1/wake_on_lan')).resolves.toMatchObject({ data: { pad: expect.any(String) } })
		adapter.mockImplementation(answer(200, '<html>not json</html>'))
		await expect(getCard('/v1/wake_on_lan')).rejects.toBeTruthy()
	})

	it('has none of the interceptors of the shared client: a 401 neither refreshes the token nor signs out, a 403 says nothing', async () => {
		expect(card.interceptors.response.handlers.filter(Boolean)).toHaveLength(0)
		expect(shared.interceptors.response.handlers.filter(Boolean).length).toBeGreaterThan(0)
		localStorage.setItem('access_token', 'old')
		localStorage.setItem('refresh_token', 'r0')
		const common = vi.fn(answer(200))
		shared.defaults.adapter = common
		for (const status of [401, 403, 404]) {
			adapter.mockImplementation(answer(status))
			await expect(getCard('/v1/wake_on_lan')).rejects.toMatchObject({ response: { status } })
		}
		expect(common).not.toHaveBeenCalled()
		expect(replace).not.toHaveBeenCalled()
		expect(localStorage.getItem('access_token')).toBe('old')
		expect(localStorage.getItem('refresh_token')).toBe('r0')
		expect(document.body.textContent).not.toContain('You do not have the right')
	})
})

describe('a body over 16 KiB', () => {
	it('is refused before anything is sent', () => {
		expect(() => act('/v1/wake_on_lan', '/wake', { pad: 'x'.repeat(16384) })).toThrow()
		expect(adapter).not.toHaveBeenCalled()
	})
})
