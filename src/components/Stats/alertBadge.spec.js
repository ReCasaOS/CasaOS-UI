// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAlertBadge } from './alertBadge'

const page = { loaded: 0, apex: 0 }
vi.mock('./StatsPage.vue', () => {
	page.loaded++
	return { default: {} }
})
vi.mock('vue3-apexcharts', () => {
	page.apex++
	return { default: {} }
})

const items = (...alerts) => ({ items: alerts.map((n, i) => ({ id: `i${i}`, alerts: n })) })
const gone = () => Object.assign(new Error('gone'), { response: { status: 404 } })

function make(over = {}) {
	const answers = { app_management: items(1, 2), virt_management: items(4), core: items(0) }
	const list = vi.fn(source => (answers[source] instanceof Error ? Promise.reject(answers[source]) : Promise.resolve(answers[source])))
	const state = { hidden: false }
	const badge = createAlertBadge({ list, hasVm: () => Promise.resolve(true), delayMs: 2000, isHidden: () => state.hidden, ...over })
	return { badge, list, answers, state }
}

const sourcesAsked = list => list.mock.calls.map(c => c[0]).sort()

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('alertBadge.load', () => {
	it('asks app_management and core, and virt only when the module is present', async () => {
		const there = make()
		await there.badge.load()
		expect(sourcesAsked(there.list)).toEqual(['app_management', 'core', 'virt_management'])

		const absent = make({ hasVm: () => Promise.resolve(false) })
		await absent.badge.load()
		expect(sourcesAsked(absent.list)).toEqual(['app_management', 'core'])
		expect(absent.badge.counts.virt_management).toBe(0)
	})

	it('counts the alerts of the items and ignores junk', async () => {
		const { badge, answers } = make()
		answers.app_management = items(-1, Number.NaN, '3', 2, Infinity, null, undefined, 1.5)
		answers.virt_management = { items: [{ alerts: 4 }, 'junk', null, { id: 'x' }] }
		answers.core = { items: Array.from({ length: 600 }, () => ({ alerts: 1 })) }

		await badge.load()

		expect(badge.counts).toEqual({ app_management: 3.5, virt_management: 4, core: 500 })
		expect(badge.total()).toBe(507.5)
	})

	it('caps the sum at 999', async () => {
		const { badge, answers } = make()
		answers.app_management = items(900, 900)
		await badge.load()
		expect(badge.counts.app_management).toBe(999)
	})

	it.each([
		['a failing source', new Error('boom')],
		['a 404', gone()],
		['an answer that is not a list', null],
		['an answer with a hostile items', { items: 'x' }],
	])('%s counts 0 and does not throw', async (_, answer) => {
		const { badge, answers } = make()
		answers.app_management = answer
		answers.virt_management = items(2)
		await expect(badge.load()).resolves.toBeUndefined()
		expect(badge.counts).toEqual({ app_management: 0, virt_management: 2, core: 0 })
	})

	it('a failing module probe counts virt as 0', async () => {
		const { badge, list } = make({ hasVm: () => Promise.reject(new Error('x')) })
		await badge.load()
		expect(sourcesAsked(list)).toEqual(['app_management', 'core'])
	})

	it('a source that fails later with a non-404 error keeps its previous count', async () => {
		const { badge, answers } = make()
		await badge.load()
		expect(badge.counts.app_management).toBe(3)
		answers.app_management = new Error('down')
		answers.virt_management = Object.assign(new Error('busy'), { response: { status: 503 } })
		await badge.load()
		expect(badge.counts.app_management).toBe(3)
		expect(badge.counts.virt_management).toBe(4)
	})

	it('a source that answers 404 later goes back to 0', async () => {
		const { badge, answers } = make()
		await badge.load()
		answers.app_management = gone()
		await badge.load()
		expect(badge.counts.app_management).toBe(0)
	})
})

describe('alertBadge.refreshSoon', () => {
	it('debounces: ten calls in 100 ms make one load after delayMs', async () => {
		const { badge, list } = make()
		for (let i = 0; i < 10; i++) {
			badge.refreshSoon()
			await vi.advanceTimersByTimeAsync(10)
		}
		expect(list).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(2000)
		expect(list.mock.calls.filter(c => c[0] === 'core')).toHaveLength(1)
		await vi.advanceTimersByTimeAsync(10000)
		expect(list.mock.calls.filter(c => c[0] === 'core')).toHaveLength(1)
	})

	it('calls during a flight make exactly one more load after it', async () => {
		const gate = { release: null }
		const { badge, list } = make()
		list.mockImplementation(source => source === 'core'
			? new Promise((resolve) => {
				gate.release = () => resolve(items(0))
			})
			: Promise.resolve(items(1)))
		const first = badge.load()
		await vi.advanceTimersByTimeAsync(0)
		badge.refreshSoon()
		badge.refreshSoon()
		await vi.advanceTimersByTimeAsync(2000)
		badge.refreshSoon()
		await vi.advanceTimersByTimeAsync(2000)
		expect(list.mock.calls.filter(c => c[0] === 'core')).toHaveLength(1)

		list.mockImplementation(() => Promise.resolve(items(1)))
		gate.release()
		await first
		await vi.advanceTimersByTimeAsync(0)

		expect(list.mock.calls.filter(c => c[0] === 'core')).toHaveLength(2)
		await vi.advanceTimersByTimeAsync(10000)
		expect(list.mock.calls.filter(c => c[0] === 'core')).toHaveLength(2)
	})

	it('asks nothing while hidden, and once when shown again', async () => {
		const { badge, list, state } = make()
		state.hidden = true
		badge.refreshSoon()
		badge.refreshSoon()
		await vi.advanceTimersByTimeAsync(10000)
		expect(list).not.toHaveBeenCalled()

		state.hidden = false
		document.dispatchEvent(new Event('visibilitychange'))
		await vi.advanceTimersByTimeAsync(0)
		expect(list.mock.calls.filter(c => c[0] === 'core')).toHaveLength(1)

		document.dispatchEvent(new Event('visibilitychange'))
		await vi.advanceTimersByTimeAsync(10000)
		expect(list.mock.calls.filter(c => c[0] === 'core')).toHaveLength(1)
	})

	it('a timer that fires while hidden asks nothing, and the show asks once', async () => {
		const { badge, list, state } = make()
		badge.refreshSoon()
		state.hidden = true
		await vi.advanceTimersByTimeAsync(2000)
		expect(list).not.toHaveBeenCalled()
		state.hidden = false
		document.dispatchEvent(new Event('visibilitychange'))
		await vi.advanceTimersByTimeAsync(0)
		expect(list.mock.calls.filter(c => c[0] === 'core')).toHaveLength(1)
	})
})

describe('alertBadge after the tab was hidden', () => {
	const coreCalls = list => list.mock.calls.filter(c => c[0] === 'core').length
	const show = async (state, awayMs) => {
		state.hidden = true
		document.dispatchEvent(new Event('visibilitychange'))
		await vi.advanceTimersByTimeAsync(awayMs)
		state.hidden = false
		document.dispatchEvent(new Event('visibilitychange'))
		await vi.advanceTimersByTimeAsync(0)
	}

	it('is read again when the tab shows after more than 60 s hidden', async () => {
		const { badge, list, state } = make()
		await badge.load()
		expect(coreCalls(list)).toBe(1)
		await show(state, 61000)
		expect(coreCalls(list)).toBe(2)
		badge.stop()
	})

	it('is not read again after a short absence', async () => {
		const { badge, list, state } = make()
		await badge.load()
		await show(state, 30000)
		expect(coreCalls(list)).toBe(1)
		badge.stop()
	})

	it('is read once, not twice, when an event was waiting for the tab to show', async () => {
		const { badge, list, state } = make()
		await badge.load()
		state.hidden = true
		document.dispatchEvent(new Event('visibilitychange'))
		badge.refreshSoon()
		await vi.advanceTimersByTimeAsync(61000)
		state.hidden = false
		document.dispatchEvent(new Event('visibilitychange'))
		await vi.advanceTimersByTimeAsync(0)
		expect(coreCalls(list)).toBe(2)
		badge.stop()
	})

	it('stops listening with stop()', async () => {
		const { badge, list, state } = make()
		await badge.load()
		badge.stop()
		await show(state, 61000)
		expect(coreCalls(list)).toBe(1)
	})
})

describe('alertBadge.stop', () => {
	it('clears the timer and the listener', async () => {
		const { badge, list, state } = make()
		badge.refreshSoon()
		expect(vi.getTimerCount()).toBe(1)
		badge.stop()
		expect(vi.getTimerCount()).toBe(0)

		state.hidden = true
		badge.refreshSoon()
		badge.stop()
		state.hidden = false
		document.dispatchEvent(new Event('visibilitychange'))
		await vi.advanceTimersByTimeAsync(10000)
		expect(list).not.toHaveBeenCalled()
	})

	it('ignores an answer that arrives late', async () => {
		const { badge, list } = make()
		const releases = []
		list.mockImplementation(() => new Promise((resolve) => {
			releases.push(() => resolve(items(5)))
		}))
		const load = badge.load()
		await vi.advanceTimersByTimeAsync(0)
		badge.stop()
		releases.forEach(release => release())
		await load
		expect(badge.total()).toBe(0)
	})
})

describe('importing alertBadge.js', () => {
	it('does not load the Statistics page or apexcharts', async () => {
		vi.resetModules()
		page.loaded = 0
		page.apex = 0
		const mod = await import('./alertBadge')
		expect(typeof mod.alertBadge.load).toBe('function')
		expect(page).toEqual({ loaded: 0, apex: 0 })
	})

	it('imports only vue and the module probe, and loads the statistics client on the first ask', () => {
		const source = readFileSync(join(__dirname, 'alertBadge.js'), 'utf8')
		const imports = [...source.matchAll(/^import .* from '(.+)'$/gm)].map(m => m[1])
		expect(imports.sort()).toEqual(['@/components/VirtualMachines/entry', 'vue'])
		expect([...source.matchAll(/import\('(.+?)'\)/g)].map(m => m[1])).toEqual(['@/service/stats'])
	})
})
