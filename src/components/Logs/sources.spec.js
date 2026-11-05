import { describe, expect, it, vi } from 'vitest'
import { createLocalStream, createRelayPoller } from './sources'

class FakeSocket {
	static all = []
	constructor(url) {
		this.url = url
		this.close = vi.fn()
		FakeSocket.all.push(this)
	}
}
// a setTimeout that records its delays; run() fires what is pending
function timers() {
	const pending = new Map()
	const delays = []
	let id = 0
	return {
		delays,
		pending,
		setTimeout: (fn, ms) => {
			delays.push(ms)
			pending.set(++id, fn)
			return id
		},
		clearTimeout: t => pending.delete(t),
		run() {
			const fns = [...pending.values()]
			pending.clear()
			fns.forEach(f => f())
		},
	}
}
const line = { at: '2026-11-05T10:00:00Z', app: 'a', service: 's', container: 'c', stream: 'o', text: 'hi' }

describe('createLocalStream', () => {
	function open(now = () => 0) {
		FakeSocket.all = []
		const t = timers()
		const h = { onRows: vi.fn(), onLag: vi.fn(), onState: vi.fn() }
		const s = createLocalStream({ url: () => 'ws://x', WebSocket: FakeSocket, ...h, setTimeout: t.setTimeout, clearTimeout: t.clearTimeout, now })
		s.start()
		return { s, t, h }
	}

	it('hands rows and lag over', () => {
		const { h } = open()
		const ws = FakeSocket.all[0]
		expect(ws.url).toBe('ws://x')
		ws.onopen()
		expect(h.onState).toHaveBeenCalledWith('open')
		ws.onmessage({ data: JSON.stringify({ t: 'line', line }) })
		expect(h.onRows).toHaveBeenCalledTimes(1)
		expect(h.onRows.mock.calls[0][0]).toHaveLength(1)
		expect(h.onRows.mock.calls[0][0][0].kind).toBe('line')
		ws.onmessage({ data: JSON.stringify({ t: 'event', event: { ...line, kind: 'started' } }) })
		expect(h.onRows.mock.calls[1][0][0].kind).toBe('event')
		ws.onmessage({ data: '{"t":"lag","dropped":5}' })
		expect(h.onLag).toHaveBeenCalledWith(5)
		ws.onmessage({ data: 'not json' })
		expect(h.onRows).toHaveBeenCalledTimes(2)
	})

	it('reconnects after 1000, 2000, 4000 … capped at 30000 ms', () => {
		const { t, h } = open()
		for (let i = 0; i < 7; i++) {
			const ws = FakeSocket.all.at(-1)
			ws.onerror()
			ws.onclose() // the second signal for the same socket schedules nothing more
			t.run()
		}
		expect(t.delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000])
		expect(FakeSocket.all).toHaveLength(8)
		expect(h.onState).toHaveBeenCalledWith('retrying')
	})

	it('resets the delay after an open that lasted 5 s', () => {
		let clock = 0
		const { t } = open(() => clock)
		FakeSocket.all.at(-1).onclose()
		t.run()
		FakeSocket.all.at(-1).onopen()
		clock = 4999
		FakeSocket.all.at(-1).onclose()
		t.run()
		FakeSocket.all.at(-1).onopen()
		clock += 5000
		FakeSocket.all.at(-1).onclose()
		expect(t.delays).toEqual([1000, 2000, 1000])
	})

	it('stops for good', () => {
		const { s, t, h } = open()
		const ws = FakeSocket.all[0]
		ws.onclose()
		s.stop()
		expect(t.pending.size).toBe(0)
		ws.onclose()
		t.run()
		expect(FakeSocket.all).toHaveLength(1)
		expect(h.onState).toHaveBeenLastCalledWith('closed')
	})

	it('closes the socket on stop, and a late close does not reconnect', () => {
		const { s, t } = open()
		s.stop()
		expect(FakeSocket.all[0].close).toHaveBeenCalled()
		FakeSocket.all[0].onclose?.()
		expect(t.delays).toEqual([])
	})
})

describe('createRelayPoller', () => {
	const page = (next, text = 'x') => ({ ok: true, data: { lines: [{ ...line, text }], events: [], next } })
	function poll(answers) {
		const t = timers()
		const ask = vi.fn(() => Promise.resolve(answers.shift() ?? page('')))
		const h = { onRows: vi.fn(), onSkipped: vi.fn(), onState: vi.fn() }
		const p = createRelayPoller({ ask, ...h, since: 'c0', setTimeout: t.setTimeout, clearTimeout: t.clearTimeout })
		return { p, t, ask, h }
	}

	it('follows next up to maxPages, then marks the view as behind', async () => {
		const { p, t, ask, h } = poll([1, 2, 3, 4, 5, 6].map(i => page(`c${i}`, `l${i}`)))
		p.start()
		await vi.waitFor(() => expect(t.delays).toEqual([3000]))
		expect(ask).toHaveBeenCalledTimes(5)
		expect(ask.mock.calls.map(c => c[0])).toEqual(['c0', 'c1', 'c2', 'c3', 'c4'].map(since => ({ since, limit: 500 })))
		expect(h.onSkipped).toHaveBeenCalledTimes(1)
		expect(h.onRows).toHaveBeenCalledTimes(5)
		t.run()
		await vi.waitFor(() => expect(ask).toHaveBeenCalledTimes(6))
		expect(ask.mock.calls[5][0].since).toBe('c5')
	})

	it('keeps the last non-empty cursor when a page has no next', async () => {
		const { p, t, ask, h } = poll([page('c1'), page('')])
		p.start()
		await vi.waitFor(() => expect(t.delays).toHaveLength(1))
		expect(ask).toHaveBeenCalledTimes(2)
		expect(h.onSkipped).not.toHaveBeenCalled()
		t.run()
		await vi.waitFor(() => expect(ask).toHaveBeenCalledTimes(3))
		expect(ask.mock.calls[2][0]).toEqual({ since: 'c1', limit: 500 })
	})

	it('keeps ticking when the box does not answer', async () => {
		const { p, t, h } = poll([{ ok: false, status: 0 }])
		p.start()
		await vi.waitFor(() => expect(t.delays).toHaveLength(1))
		expect(h.onState).toHaveBeenCalledWith('retrying')
		t.run()
		await vi.waitFor(() => expect(h.onState).toHaveBeenCalledWith('open'))
	})

	it('asks nothing more after stop, and ignores the answer in flight', async () => {
		let resolve
		const { p, t, ask, h } = poll([])
		ask.mockImplementationOnce(() => new Promise((r) => {
			resolve = r
		}))
		p.start()
		p.stop()
		resolve(page('c1'))
		await new Promise(r => setTimeout(r, 0))
		expect(h.onRows).not.toHaveBeenCalled()
		expect(t.delays).toEqual([])
		expect(ask).toHaveBeenCalledTimes(1)
	})

	it('cancels a pending tick on stop', async () => {
		const { p, t, ask } = poll([])
		p.start()
		await vi.waitFor(() => expect(t.delays).toHaveLength(1))
		p.stop()
		expect(t.pending.size).toBe(0)
		expect(ask).toHaveBeenCalledTimes(1)
	})
})
