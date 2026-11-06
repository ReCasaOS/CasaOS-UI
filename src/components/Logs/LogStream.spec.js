// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FileSaver from 'file-saver'
import LogStream from './LogStream.vue'
import { logsApi } from '@/service/logs'
import { instance } from '@/service/service.js'
import i18n from '@/plugins/i18n'

// The English strings, so that what a spec reads is what a person reads.
vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('@/service/service.js', () => ({ instance: { request: vi.fn() } }))
vi.mock('file-saver', () => ({ default: { saveAs: vi.fn() } }))
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

const line = (n, app = 'plex', service = app) => ({ at: `2026-11-06T10:00:${String(n).padStart(2, '0')}Z`, app, service, container: `${app}-${service}`, stream: 'o', text: `line ${n}` })
// cursorAt(line(4).at)
const AFTER_4 = '1793959203999999999:0:_'
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

	it('reads again from the load cursor 1.5 s after the socket opens, past the second history holds back', async () => {
		await mountStream()
		socket().onopen()
		await tick(1400)
		expect(logsApi.query).toHaveBeenCalledTimes(2)
		await tick(100)
		expect(logsApi.query).toHaveBeenNthCalledWith(3, null, { app: ['plex'], since: 'c3', limit: 1000 })
	})

	it('fills a reconnect from the last live row when the socket dropped, not from rows that come after', async () => {
		await mountStream()
		socket().onopen()
		socket().send({ t: 'line', line: line(4) })
		await tick(1500)
		expect(logsApi.query).toHaveBeenCalledTimes(3)
		socket().onclose()
		await tick(1000)
		socket().onopen()
		socket().send({ t: 'line', line: line(9) })
		await tick()
		expect(logsApi.query).toHaveBeenCalledTimes(3)
		await tick(1400)
		expect(logsApi.query).toHaveBeenNthCalledWith(4, null, { app: ['plex'], since: AFTER_4, limit: 1000 })
	})

	it('does not count again, while scrolled up, the rows a reconnect reads again', async () => {
		await mountStream()
		const el = wrapper.find('.log-scroller').element
		Object.defineProperty(el, 'scrollHeight', { value: 1000, configurable: true })
		Object.defineProperty(el, 'clientHeight', { value: 200, configurable: true })
		Object.defineProperty(el, 'scrollTop', { value: 100, writable: true, configurable: true })
		el.dispatchEvent(new Event('scroll'))
		socket().onopen()
		await tick(1500)
		socket().send({ t: 'line', line: line(4) })
		await tick()
		logsApi.query.mockImplementation((box, p) => (p.since === AFTER_4 ? page([...LINES, line(4), line(5)], 'c5') : page([], '')))
		socket().onclose()
		await tick(1000)
		socket().onopen()
		await tick(1500)
		await tick()
		expect(wrapper.find('.log-banner').text()).toBe('2 new lines')
	})

	it('pages a fleet box download past pages cut short, to the empty one', async () => {
		await mountStream({ box: 'b1', range: { since: null, until: '2026-11-06T11:00:00Z' } })
		const forty = from => Array.from({ length: 40 }, (_, i) => line(from + i))
		logsApi.query.mockImplementation((box, p) => page(...({ '0:0:_': [forty(0), 'p1'], 'p1': [forty(40), 'p2'] }[p.since] ?? [[], ''])))
		await wrapper.vm.download()
		const blob = FileSaver.saveAs.mock.calls[0][0]
		expect((await blob.text()).trim().split(/\n/)).toHaveLength(80)
		expect(logsApi.query.mock.calls.slice(-3).map(c => c[1].since)).toEqual(['0:0:_', 'p1', 'p2'])
	})

	it('says when a fleet box download stops at the page bound', async () => {
		await mountStream({ box: 'b1', range: { since: null, until: '2026-11-06T11:00:00Z' } })
		let n = 0
		logsApi.query.mockImplementation(() => page([line(1)], `p${++n}`))
		await wrapper.vm.download()
		await flushPromises()
		expect(FileSaver.saveAs).toHaveBeenCalledTimes(1)
		expect(document.body.textContent).toContain('Download stopped at 100 lines')
	})

	it('exports this box without the request timeout', async () => {
		await mountStream()
		instance.request.mockResolvedValue({ data: new Blob(['x']), headers: {} })
		await wrapper.vm.download()
		expect(instance.request).toHaveBeenCalledWith(expect.objectContaining({ responseType: 'blob', timeout: 0 }))
	})

	it('marks a relay that is behind as catching up, at the time of the last row', async () => {
		let n = 0
		logsApi.query.mockImplementation((box, p) => (p.since ? page([line(10 + n++)], `n${n}`) : page([...LINES].reverse(), 'c1')))
		await mountStream({ box: 'b1' })
		await tick()
		const marker = wrapper.vm.buffer.find(r => r.kind === 'marker')
		expect(marker.at).toEqual(new Date(line(15).at))
		expect(wrapper.find('.log-row.is-marker').text()).toBe('Catching up…')
	})

	it('opens a line on a click, but not on the click that ends a text selection', async () => {
		await mountStream()
		const selection = vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'line 1' })
		await rows()[0].trigger('click')
		expect(wrapper.find('.log-expanded').exists()).toBe(false)
		selection.mockReturnValue({ toString: () => '' })
		await rows()[0].trigger('click')
		expect(wrapper.find('.log-expanded').exists()).toBe(true)
		selection.mockRestore()
	})

	it('asks by app only, a whole app beside the services of another, and filters here', async () => {
		const mixed = [line(1, 'a', 'web'), line(2, 'a', 'db'), line(3, 'b', 'web'), line(4, 'b', 'db')]
		logsApi.query.mockImplementation((box, p) => (p.since ? page(mixed, 'c4') : page([...mixed].reverse(), 'c1')))
		await mountStream({ apps: ['a', 'b'], services: ['a/web'] })
		expect(logsApi.query).toHaveBeenNthCalledWith(1, null, { app: ['a', 'b'], limit: 500 })
		expect(rows().map(r => r.find('.log-text').text())).toEqual(['line 1', 'line 3', 'line 4'])
	})

	it('asks by app and keeps the pairs here when services of several apps are ticked', async () => {
		const mixed = [line(1, 'a', 'web'), line(2, 'a', 'db'), line(3, 'b', 'web')]
		logsApi.query.mockImplementation((box, p) => (p.since ? page(mixed, 'c3') : page([...mixed].reverse(), 'c1')))
		await mountStream({ apps: ['a', 'b'], services: ['a/web', 'b/web'] })
		expect(logsApi.query).toHaveBeenNthCalledWith(1, null, { app: ['a', 'b'], limit: 500 })
		expect(rows().map(r => r.find('.log-text').text())).toEqual(['line 1', 'line 3'])
	})

	it('sends the service names when the ticked services are of one app', async () => {
		await mountStream({ services: ['plex/web', 'plex/db'] })
		expect(logsApi.query).toHaveBeenNthCalledWith(1, null, { app: ['plex'], service: ['web', 'db'], limit: 500 })
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
