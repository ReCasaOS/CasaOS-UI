import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPoller } from './poller'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

// a run that answers when told to
function deferred() {
	const calls = []
	const run = vi.fn(() => new Promise((resolve, reject) => calls.push({ resolve, reject })))
	return { run, calls }
}
const settle = () => vi.advanceTimersByTimeAsync(0)

describe('createPoller', () => {
	it('keeps one request in flight', async () => {
		const { run } = deferred()
		const p = createPoller({ run, isHidden: () => false })
		p.start()
		await vi.advanceTimersByTimeAsync(60000)
		expect(run).toHaveBeenCalledTimes(1)
	})

	it('asks again 5000 ms after the answer, not after the start', async () => {
		const { run, calls } = deferred()
		const p = createPoller({ run, isHidden: () => false })
		p.start()
		await vi.advanceTimersByTimeAsync(3000)
		calls[0].resolve()
		await settle()
		await vi.advanceTimersByTimeAsync(4999)
		expect(run).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(1)
		expect(run).toHaveBeenCalledTimes(2)
	})

	it('re-arms after a failure', async () => {
		const { run, calls } = deferred()
		const p = createPoller({ run, isHidden: () => false })
		p.start()
		calls[0].reject(new Error('down'))
		await settle()
		await vi.advanceTimersByTimeAsync(5000)
		expect(run).toHaveBeenCalledTimes(2)
	})

	it('asks nothing while hidden, and once when shown again', async () => {
		let hidden = true
		const run = vi.fn(() => Promise.resolve())
		const p = createPoller({ run, isHidden: () => hidden })
		p.start()
		await vi.advanceTimersByTimeAsync(3600000)
		expect(run).not.toHaveBeenCalled()
		hidden = false
		p.visibilityChanged()
		await settle()
		expect(run).toHaveBeenCalledTimes(1)
	})

	it('stops the timer when hidden', async () => {
		let hidden = false
		const run = vi.fn(() => Promise.resolve())
		const p = createPoller({ run, isHidden: () => hidden })
		p.start()
		await settle()
		hidden = true
		p.visibilityChanged()
		await vi.advanceTimersByTimeAsync(60000)
		expect(run).toHaveBeenCalledTimes(1)
	})

	it('now() during a flight gives one extra call after it ends', async () => {
		const { run, calls } = deferred()
		const p = createPoller({ run, isHidden: () => false })
		p.start()
		p.now()
		p.now()
		expect(run).toHaveBeenCalledTimes(1)
		calls[0].resolve()
		await settle()
		expect(run).toHaveBeenCalledTimes(2)
	})

	it('now() without a flight asks at once and re-arms the chain', async () => {
		const run = vi.fn(() => Promise.resolve())
		const p = createPoller({ run, isHidden: () => false })
		p.start()
		await settle()
		await vi.advanceTimersByTimeAsync(4000)
		p.now()
		await settle()
		expect(run).toHaveBeenCalledTimes(2)
		await vi.advanceTimersByTimeAsync(4999)
		expect(run).toHaveBeenCalledTimes(2)
		await vi.advanceTimersByTimeAsync(1)
		expect(run).toHaveBeenCalledTimes(3)
	})

	it('stop() clears the timer and makes a late answer inert', async () => {
		const { run, calls } = deferred()
		const p = createPoller({ run, isHidden: () => false })
		p.start()
		p.stop()
		calls[0].resolve()
		await vi.advanceTimersByTimeAsync(60000)
		expect(run).toHaveBeenCalledTimes(1)
		const q = vi.fn(() => Promise.resolve())
		const p2 = createPoller({ run: q, isHidden: () => false })
		p2.start()
		await settle()
		p2.stop()
		await vi.advanceTimersByTimeAsync(60000)
		expect(q).toHaveBeenCalledTimes(1)
		expect(vi.getTimerCount()).toBe(0)
	})

	it('start() twice does not double the chain', async () => {
		const run = vi.fn(() => Promise.resolve())
		const p = createPoller({ run, isHidden: () => false })
		p.start()
		p.start()
		await settle()
		expect(run).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(5000)
		expect(run).toHaveBeenCalledTimes(2)
	})
})
