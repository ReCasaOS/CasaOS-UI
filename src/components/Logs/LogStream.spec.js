// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LogStream from './LogStream.vue'
import { logsApi } from '@/service/logs'
import i18n from '@/plugins/i18n'

// The English strings, so that what a spec reads is what a person reads.
vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('@/service/service.js', () => ({ instance: { request: vi.fn() } }))
vi.mock('@/service/logs', () => ({ logsApi: { query: vi.fn(), apps: vi.fn(), exportUrl: vi.fn(), streamUrl: vi.fn(() => 'ws://box/logs/stream') } }))

class FakeSocket {
	static all = []
	constructor(url) {
		this.url = url
		FakeSocket.all.push(this)
	}

	close() {
		this.closed = true
	}

	send(m) {
		this.onmessage({ data: JSON.stringify(m) })
	}
}

const line = (n, app = 'plex') => ({ at: `2026-11-06T10:00:0${n}Z`, app, service: app, container: app, stream: 'o', text: `line ${n}` })
const page = (lines, next = '') => Promise.resolve({ ok: true, status: 200, data: { lines, events: [], next } })
const LINES = [line(1), line(2), line(3)]

let wrapper
async function mountStream(props = {}) {
	wrapper = mount(LogStream, {
		attachTo: document.body,
		props: { apps: ['plex'], wsFactory: FakeSocket, ...props },
		global: {
			plugins: [Buefy, i18n],
			mocks: { $store: { state: { access_token: 't' } }, $wsProtocol: 'ws:', $baseURL: 'localhost' },
		},
	})
	await flushPromises()
	return wrapper
}
const rows = () => wrapper.findAll('.log-row')
const socket = () => FakeSocket.all.at(-1)
async function tick(ms = 150) {
	vi.advanceTimersByTime(ms)
	await flushPromises()
}

describe('the log stream', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
		vi.clearAllMocks()
		FakeSocket.all = []
		document.body.innerHTML = ''
		// backwards: newest first; forwards from its oldest cursor: oldest first
		logsApi.query.mockImplementation((box, p) => (p.since ? page(LINES, 'c3') : page([...LINES].reverse(), 'c1')))
	})
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
		vi.useRealTimers()
	})

	it('reads the newest page, then the newest cursor, then opens the stream', async () => {
		await mountStream()
		expect(logsApi.query).toHaveBeenNthCalledWith(1, null, { app: ['plex'], limit: 500 })
		expect(logsApi.query).toHaveBeenNthCalledWith(2, null, { app: ['plex'], since: 'c1', limit: 1000 })
		expect(logsApi.query).toHaveBeenCalledTimes(2)
		expect(rows()).toHaveLength(3)
		expect(rows().map(r => r.find('.log-text').text())).toEqual(['line 1', 'line 2', 'line 3'])
		expect(socket().url).toBe('ws://box/logs/stream')
	})

	it('shows a lag as a skipped marker and says so', async () => {
		await mountStream()
		socket().onopen()
		socket().send({ t: 'lag', dropped: 7 })
		await tick()
		expect(wrapper.emitted('lag')).toEqual([[7]])
		expect(wrapper.find('.log-row.is-marker').text()).toBe('7 lines skipped')
	})

	it('holds new lines while scrolled up, behind a banner', async () => {
		await mountStream()
		const el = wrapper.find('.log-scroller').element
		Object.defineProperty(el, 'scrollHeight', { value: 1000, configurable: true })
		Object.defineProperty(el, 'clientHeight', { value: 200, configurable: true })
		Object.defineProperty(el, 'scrollTop', { value: 100, writable: true, configurable: true })
		el.dispatchEvent(new Event('scroll'))
		socket().onopen()
		socket().send({ t: 'line', line: line(4) })
		await tick()
		expect(wrapper.find('.log-banner').text()).toBe('1 new lines')
		expect(rows()).toHaveLength(3)
		await wrapper.find('.log-banner').trigger('click')
		await flushPromises()
		expect(rows()).toHaveLength(4)
		expect(wrapper.find('.log-banner').exists()).toBe(false)
	})

	it('batches live lines every 100 ms', async () => {
		await mountStream()
		socket().onopen()
		socket().send({ t: 'line', line: line(4) })
		socket().send({ t: 'line', line: line(5) })
		await tick(50)
		expect(rows()).toHaveLength(3)
		await tick(100)
		expect(rows()).toHaveLength(5)
	})

	it('fills the gap from the newest cursor after a reconnect', async () => {
		await mountStream()
		socket().onopen()
		socket().onclose()
		await tick(1000)
		socket().onopen()
		await flushPromises()
		expect(logsApi.query).toHaveBeenLastCalledWith(null, { app: ['plex'], since: 'c3', limit: 1000 })
	})

	it('says to update a box without the logs routes', async () => {
		logsApi.query.mockResolvedValue({ ok: false, status: 404, error: 'Not Found' })
		await mountStream()
		expect(wrapper.text()).toContain('Update this box to read its logs')
		expect(FakeSocket.all).toHaveLength(0)
	})

	it('polls a fleet box from the newest cursor instead of a socket', async () => {
		await mountStream({ box: 'b1' })
		expect(FakeSocket.all).toHaveLength(0)
		expect(logsApi.query).toHaveBeenLastCalledWith('b1', { app: ['plex'], since: 'c3', limit: 500 })
	})

	it('stops the stream and the batching on unmount', async () => {
		await mountStream()
		socket().onopen()
		socket().send({ t: 'line', line: line(4) })
		const ws = socket()
		wrapper.unmount()
		wrapper = null
		expect(ws.closed).toBe(true)
		expect(vi.getTimerCount()).toBe(0)
	})
})
