// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOSTILE, aSeries, anAlerts, anItem, makePoints } from './__fixtures__/contract'
import { openStatistics } from './entry'
import StatsPage from './StatsPage.vue'
import { hasVirtualMachines } from '@/components/VirtualMachines/entry'
import { statsApi } from '@/service/stats'
import i18n from '@/plugins/i18n'

// The English strings, so that what a spec reads is what a person reads.
vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('@/service/stats', () => ({
	STATS_SOURCES: ['app_management', 'virt_management', 'core'],
	statsApi: { list: vi.fn(), series: vi.fn(), alerts: vi.fn(), setAlerts: vi.fn() },
}))
vi.mock('@/components/VirtualMachines/entry', () => ({ hasVirtualMachines: vi.fn() }))
vi.mock('vue3-apexcharts', () => ({ __esModule: true, default: { name: 'ApexStub', props: ['options', 'series', 'type', 'height'], render: () => null } }))

const jelly = anItem()
const plex = anItem({ id: 'app:plex:web:1', name: 'Plex' })
const other = anItem({ id: 'ctr:db', name: 'Postgres', kind: 'container' })
const vm = anItem({ id: 'vm-1', name: 'Debian', kind: 'vm' })
const host = anItem({ id: 'host', name: 'This machine', kind: 'host', cpu_percent: 38 })

const body = (items, notes = []) => ({ items, notes })
const failure = status => Object.assign(new Error('failed'), { response: { status } })
function deferred() {
	let resolve, reject
	const promise = new Promise((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

// what each source answers: a body, an error to reject with, or a promise of the test's own
function serve(answers) {
	statsApi.list.mockImplementation((source) => {
		const answer = answers[source]
		if (answer instanceof Error) {
			return Promise.reject(answer)
		}
		return answer && typeof answer.then === 'function' ? answer : Promise.resolve(answer)
	})
}
const defaults = () => ({ app_management: body([jelly, plex]), virt_management: body([vm]), core: body([host]) })

let wrapper
async function mountPage(props = {}) {
	wrapper = mount(StatsPage, { props, attachTo: document.body, global: { plugins: [Buefy, i18n] } })
	await flushPromises()
	return wrapper
}

const names = () => [...document.querySelectorAll('.stats-list .stats-item-name')].map(el => el.textContent)
const groupTitles = () => [...document.querySelectorAll('.stats-list .stats-group-title')].map(el => el.textContent)
const pressed = () => [...document.querySelectorAll('.stats-list button[aria-pressed="true"]')].map(b => b.querySelector('.stats-item-name').textContent)
const listCalls = source => statsApi.list.mock.calls.filter(c => c[0] === source).length

describe('the list of the Statistics page', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
		hasVirtualMachines.mockResolvedValue(true)
		statsApi.series.mockReturnValue(new Promise(() => {}))
		serve(defaults())
	})
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
	})

	it('asks the three sources in parallel', async () => {
		const pending = { app_management: deferred(), virt_management: deferred(), core: deferred() }
		serve(Object.fromEntries(Object.entries(pending).map(([k, d]) => [k, d.promise])))
		await mountPage()
		expect(statsApi.list.mock.calls.map(c => c[0]).sort()).toEqual(['app_management', 'core', 'virt_management'])
	})

	it('with the virt module absent, makes no call to it and shows no VM column', async () => {
		hasVirtualMachines.mockResolvedValue(false)
		await mountPage()
		expect(listCalls('virt_management')).toBe(0)
		expect(groupTitles()).not.toContain('Virtual Machines')
		expect(names()).toContain('Jellyfin')
	})

	it('does not blank the others when one source fails, and retries only that one', async () => {
		serve({ ...defaults(), app_management: failure(502) })
		await mountPage()
		expect(names()).toEqual(['Debian', 'This machine'])
		const row = document.querySelector('.stats-column-error')
		expect(row.textContent).toContain('Containers did not answer.')
		serve(defaults())
		statsApi.list.mockClear()
		row.querySelector('button').click()
		await flushPromises()
		expect(statsApi.list.mock.calls).toEqual([['app_management']])
		expect(names()).toContain('Jellyfin')
		expect(document.querySelector('.stats-column-error')).toBeNull()
	})

	it('takes a 404 for a source that is not there, not for an error', async () => {
		serve({ ...defaults(), virt_management: failure(404) })
		await mountPage()
		expect(document.querySelector('.stats-column-error')).toBeNull()
		expect(groupTitles()).not.toContain('Virtual Machines')
	})

	it('treats an answer that is not a list as a failed column', async () => {
		serve({ ...defaults(), core: null })
		await mountPage()
		expect(document.querySelector('.stats-column-error').textContent).toContain('Machine could not be read.')
	})

	it('shows the note of a list as text', async () => {
		serve({ ...defaults(), app_management: body([jelly], ['stats_capacity', '<b>x</b>']) })
		await mountPage()
		const notes = [...document.querySelectorAll('.stats-note')].map(n => n.textContent)
		expect(notes[0]).toBe('Too many items: some of them are not measured.')
		expect(notes[1]).toBe('Note from the service: <b>x</b>')
		expect(document.querySelector('.stats-note b')).toBeNull()
	})

	it('groups by kind, in the order Containers, Other containers, Virtual Machines, Machine, with no empty group', async () => {
		serve({ app_management: body([jelly, other]), virt_management: body([vm]), core: body([host]) })
		await mountPage()
		expect(groupTitles()).toEqual(['Containers', 'Other containers', 'Virtual Machines', 'Machine'])
		serve({ ...defaults(), core: body([]) })
		await wrapper.vm.loadAll()
		await flushPromises()
		expect(groupTitles()).toEqual(['Containers', 'Virtual Machines'])
	})

	it('shows the state word, the processor and the alerts of an item', async () => {
		serve({ ...defaults(), core: body([{ ...host, alerts: 2, state: 'stopped' }]) })
		await mountPage()
		const row = [...document.querySelectorAll('.stats-list button')].find(b => b.textContent.includes('This machine'))
		expect(row.textContent).toContain('Stopped')
		expect(row.textContent).toContain('38%')
		expect(row.textContent).toContain('2 alerts')
	})

	it('renders names as text', async () => {
		serve({ ...defaults(), app_management: body([anItem({ name: HOSTILE })]) })
		await mountPage()
		expect(document.querySelector('.stats-list img')).toBeNull()
		expect(document.querySelector('.stats-select img')).toBeNull()
		expect(document.querySelector('.stats-list .stats-item-name').textContent).toBe(HOSTILE)
	})

	it('selects the initial item, else the first one', async () => {
		await mountPage({ initialItem: 'vm-1' })
		expect(pressed()).toEqual(['Debian'])
		wrapper.unmount()
		document.body.innerHTML = ''
		await mountPage({ initialItem: 'nothing-like-it' })
		expect(pressed()).toEqual(['Jellyfin'])
	})

	it('keeps the selection across a refresh and falls back when its item goes', async () => {
		await mountPage()
		document.querySelectorAll('.stats-list button')[1].click()
		await flushPromises()
		expect(pressed()).toEqual(['Plex'])
		await wrapper.vm.loadAll()
		await flushPromises()
		expect(pressed()).toEqual(['Plex'])
		serve({ ...defaults(), app_management: body([jelly]) })
		await wrapper.vm.loadAll()
		await flushPromises()
		expect(pressed()).toEqual(['Jellyfin'])
		expect(document.querySelector('.stats-column-error')).toBeNull()
	})

	it('ignores an answer older than the one it already has', async () => {
		serve({ ...defaults(), app_management: failure(500) })
		await mountPage()
		const older = deferred()
		serve({ ...defaults(), app_management: older.promise })
		document.querySelector('.stats-column-error button').click()
		await flushPromises()
		serve({ ...defaults(), app_management: body([plex]) })
		await wrapper.vm.loadAll()
		await flushPromises()
		expect(names()).toContain('Plex')
		older.resolve(body([jelly]))
		await flushPromises()
		expect(names()).toContain('Plex')
		expect(names()).not.toContain('Jellyfin')
	})

	it('offers the same items to a select, and both select the same item', async () => {
		await mountPage()
		const select = document.querySelector('.stats-select')
		expect([...select.querySelectorAll('optgroup')].map(g => g.label)).toEqual(['Containers', 'Virtual Machines', 'Machine'])
		select.value = 'virt_management|vm-1'
		select.dispatchEvent(new Event('change'))
		await flushPromises()
		expect(pressed()).toEqual(['Debian'])
		document.querySelectorAll('.stats-list button')[0].click()
		await flushPromises()
		expect(select.value).toBe('app_management|app:jellyfin:web:1')
	})

	it('says so from the second failed refresh in a row, keeps the last items, and clears it on a success', async () => {
		await mountPage()
		serve({ ...defaults(), app_management: failure(401) })
		await wrapper.vm.loadAll()
		await flushPromises()
		expect(document.querySelector('.stats-column-error')).toBeNull()
		serve({ ...defaults(), app_management: failure(502) })
		await wrapper.vm.loadAll()
		await flushPromises()
		expect(document.querySelector('.stats-column-error').textContent).toContain('Containers did not answer.')
		expect(document.querySelector('.stats-column-error button').textContent).toBe('Retry')
		expect(names()).toContain('Jellyfin')
		expect(document.querySelector('.stats-list .stats-item.is-stale')).not.toBeNull()
		serve(defaults())
		await wrapper.vm.loadAll()
		await flushPromises()
		expect(document.querySelector('.stats-column-error')).toBeNull()
		expect(document.querySelector('.stats-item.is-stale')).toBeNull()
	})

	it('restarts the count of failures after a success', async () => {
		await mountPage()
		for (const answer of [failure(502), defaults().app_management, failure(502)]) {
			serve({ ...defaults(), app_management: answer })
			await wrapper.vm.loadAll()
			await flushPromises()
		}
		expect(document.querySelector('.stats-column-error')).toBeNull()
	})

	it('selects the initial item as soon as its column is there, and by source|id too', async () => {
		const slow = deferred()
		serve({ ...defaults(), virt_management: slow.promise })
		await mountPage({ initialItem: 'virt_management|vm-1' })
		expect(pressed()).toEqual(['Jellyfin'])
		slow.resolve(body([vm]))
		await flushPromises()
		expect(pressed()).toEqual(['Debian'])
	})

	it('does not take the selection back from a person who chose while the column was loading', async () => {
		const slow = deferred()
		serve({ ...defaults(), virt_management: slow.promise })
		await mountPage({ initialItem: 'vm-1' })
		document.querySelectorAll('.stats-list button')[1].click()
		slow.resolve(body([vm]))
		await flushPromises()
		expect(pressed()).toEqual(['Plex'])
	})

	it('says 1 alert in the singular', async () => {
		serve({ ...defaults(), app_management: body([{ ...jelly, alerts: 1 }, { ...plex, alerts: 3 }]) })
		await mountPage()
		const badges = [...document.querySelectorAll('.stats-item-alerts')].map(b => b.textContent)
		expect(badges).toEqual(['1 alert', '3 alerts'])
	})

	it('says so in the main pane when there is nothing to show', async () => {
		serve({ app_management: body([]), virt_management: body([]), core: body([]) })
		await mountPage()
		expect(document.querySelector('.stats-empty').textContent).toBe('No containers or virtual machines to show')
	})

	it('cuts the detail at 200 code points, not 200 UTF-16 units', async () => {
		serve({ ...defaults(), app_management: body([anItem({ detail: '😀'.repeat(300) })]) })
		await mountPage()
		const text = document.querySelector('.stats-detail').textContent
		expect(Array.from(text)).toHaveLength(200)
		expect(text).toBe('😀'.repeat(200))
	})

	it('leaves the focus ring of the period buttons visible', () => {
		const source = readFileSync(join(import.meta.dirname, 'StatsPage.vue'), 'utf8')
		const block = source.slice(source.indexOf('.stats-ranges {'), source.indexOf('.stats-series-error,'))
		expect(block).not.toContain('overflow')
		expect(block).toContain('focus-visible')
	})

	it('takes the focus on the heading', async () => {
		await mountPage()
		expect(document.activeElement).toBe(wrapper.vm.$refs.title)
		expect(document.activeElement.tagName).toBe('H3')
	})

	it('closes through its button', async () => {
		await mountPage()
		document.querySelector('button[aria-label="Close"]').click()
		expect(wrapper.emitted('close')).toHaveLength(1)
	})
})

describe('the refresh of the list', () => {
	let hidden
	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
		hidden = false
		Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
		hasVirtualMachines.mockResolvedValue(true)
		statsApi.series.mockReturnValue(new Promise(() => {}))
		serve(defaults())
	})
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
		delete document.hidden
		vi.useRealTimers()
	})

	const tick = ms => vi.advanceTimersByTimeAsync(ms)

	it('goes every 5 s, once at a time, and pauses while hidden', async () => {
		const slow = deferred()
		serve({ ...defaults(), core: slow.promise })
		wrapper = mount(StatsPage, { attachTo: document.body, global: { plugins: [Buefy, i18n] } })
		await tick(0)
		expect(statsApi.list).toHaveBeenCalledTimes(3)
		await tick(60000)
		expect(statsApi.list).toHaveBeenCalledTimes(3)
		slow.resolve(body([host]))
		await tick(4999)
		expect(statsApi.list).toHaveBeenCalledTimes(3)
		await tick(1)
		expect(statsApi.list).toHaveBeenCalledTimes(6)

		hidden = true
		document.dispatchEvent(new Event('visibilitychange'))
		await tick(60000)
		expect(statsApi.list).toHaveBeenCalledTimes(6)
		hidden = false
		document.dispatchEvent(new Event('visibilitychange'))
		await tick(0)
		expect(statsApi.list).toHaveBeenCalledTimes(9)
	})

	it('clears its timer on unmount', async () => {
		wrapper = mount(StatsPage, { attachTo: document.body, global: { plugins: [Buefy, i18n] } })
		await tick(0)
		expect(vi.getTimerCount()).toBeGreaterThan(0)
		wrapper.unmount()
		wrapper = null
		expect(vi.getTimerCount()).toBe(0)
	})
})

// a series answer whose points are the same value all along; null is a gap
function seriesWith(values, over = {}) {
	return aSeries({
		series: Object.entries(values).map(([key, value]) => {
			const slash = key.indexOf('/')
			return { chart: key.slice(0, slash), name: key.slice(slash + 1), unit: 'percent', points: makePoints({ fn: () => value }) }
		}),
		...over,
	})
}

describe('the header, the periods and the figures', () => {
	let hidden
	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
		hidden = false
		Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
		hasVirtualMachines.mockResolvedValue(true)
		statsApi.series.mockResolvedValue(seriesWith({ 'cpu/total': 38 }))
		serve(defaults())
	})
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
		delete document.hidden
		vi.useRealTimers()
	})

	const tick = ms => vi.advanceTimersByTimeAsync(ms)
	async function open(props = {}) {
		wrapper = mount(StatsPage, { props, attachTo: document.body, global: { plugins: [Buefy, i18n] } })
		await tick(0)
		return wrapper
	}
	const seriesCalls = () => statsApi.series.mock.calls.map(c => c.join('|'))
	const rangeButton = label => [...document.querySelectorAll('[aria-label="Period"] button')].find(b => b.textContent.trim() === label)
	const figureTexts = () => [...document.querySelectorAll('.stats-figures dd')].map(dd => dd.textContent)
	const figureLabels = () => [...document.querySelectorAll('.stats-figures dt')].map(dt => dt.textContent)
	const JELLY = 'app_management|app:jellyfin:web:1'

	it('asks the live series of the selected item first, and says so', async () => {
		await open()
		expect(seriesCalls()).toEqual([`${JELLY}|live`])
		expect(rangeButton('Live').getAttribute('aria-pressed')).toBe('true')
		expect(rangeButton('7 days').getAttribute('aria-pressed')).toBe('false')
		expect(document.querySelector('[role="group"][aria-label="Period"]')).not.toBeNull()
	})

	it('asks once for another period, starts no polling, and asks again on Refresh', async () => {
		await open()
		rangeButton('7 days').click()
		await tick(0)
		expect(seriesCalls()).toEqual([`${JELLY}|live`, `${JELLY}|7d`])
		await tick(60000)
		expect(statsApi.series).toHaveBeenCalledTimes(2)
		;[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Refresh').click()
		await tick(0)
		expect(statsApi.series).toHaveBeenCalledTimes(3)
	})

	it('polls the live series every 5 s, one request at a time', async () => {
		statsApi.series.mockReturnValue(new Promise(() => {}))
		await open()
		await tick(60000)
		expect(statsApi.series).toHaveBeenCalledTimes(1)
	})

	it('polls every 5 s once answered, pauses while hidden, asks once when shown', async () => {
		await open()
		await tick(5000)
		expect(statsApi.series).toHaveBeenCalledTimes(2)
		hidden = true
		document.dispatchEvent(new Event('visibilitychange'))
		await tick(3600000)
		expect(statsApi.series).toHaveBeenCalledTimes(2)
		hidden = false
		document.dispatchEvent(new Event('visibilitychange'))
		await tick(0)
		expect(statsApi.series).toHaveBeenCalledTimes(3)
	})

	it('ignores the late answer of the old item, and never shows its curves under the new name', async () => {
		const first = deferred()
		const second = deferred()
		statsApi.series.mockImplementation((source, id) => id === 'app:jellyfin:web:1' ? first.promise : second.promise)
		await open()
		document.querySelectorAll('.stats-list button')[1].click()
		await tick(0)
		expect(document.querySelector('.stats-name').textContent).toBe('Plex')
		first.resolve(seriesWith({ 'cpu/total': 11 }))
		await tick(0)
		expect(document.querySelector('.stats-figures')).toBeNull()
		second.resolve(seriesWith({ 'cpu/total': 22 }))
		await tick(0)
		expect(figureTexts()[0]).toBe('22%')
	})

	it('clears the curves of the old item at once, but keeps them while the period of the same item changes', async () => {
		await open()
		expect(figureTexts()[0]).toBe('38%')
		statsApi.series.mockReturnValue(new Promise(() => {}))
		rangeButton('1 h').click()
		await tick(0)
		expect(figureTexts()[0]).toBe('38%')
		document.querySelectorAll('.stats-list button')[1].click()
		await tick(0)
		expect(document.querySelector('.stats-figures')).toBeNull()
	})

	it('ignores the late answer of the old period', async () => {
		const live = deferred()
		const hour = deferred()
		statsApi.series.mockImplementation((source, id, range) => range === 'live' ? live.promise : hour.promise)
		await open()
		rangeButton('1 h').click()
		await tick(0)
		live.resolve(seriesWith({ 'cpu/total': 11 }))
		await tick(0)
		expect(document.querySelector('.stats-figures')).toBeNull()
		hour.resolve(seriesWith({ 'cpu/total': 22 }))
		await tick(0)
		expect(figureTexts()[0]).toBe('22%')
	})

	it('falls back to the first item when the series says the item is gone', async () => {
		statsApi.series.mockImplementation((source, id) => {
			if (id === 'app:jellyfin:web:1') {
				serve({ ...defaults(), app_management: body([plex]) })
				return Promise.reject(failure(404))
			}
			return Promise.resolve(seriesWith({ 'cpu/total': 38 }))
		})
		await open()
		await tick(0)
		expect(seriesCalls()).toContain('app_management|app:plex:web:1|live')
		expect(document.querySelector('.stats-name').textContent).toBe('Plex')
	})

	it('forces at most one list refresh per 30 s for an item the series reports gone while the list still has it', async () => {
		let now = 1000000
		vi.spyOn(Date, 'now').mockImplementation(() => now)
		statsApi.series.mockRejectedValue(failure(404))
		await open()
		const forced = vi.spyOn(wrapper.vm.listPoller, 'now')
		for (let i = 0; i < 5; i++) {
			now += 5000
			await tick(5000)
		}
		expect(forced).not.toHaveBeenCalled()
		expect(document.querySelector('.stats-no-data').textContent).toBe('No data for this period')
		now += 30000
		await tick(5000)
		expect(forced).toHaveBeenCalledTimes(1)
		Date.now.mockRestore()
	})

	it('shows a retryable error and keeps the shell', async () => {
		statsApi.series.mockRejectedValue(failure(500))
		await open()
		expect(document.querySelector('.stats-series-error').textContent).toContain('The measurements could not be read.')
		expect(document.querySelector('.stats-name').textContent).toBe('Jellyfin')
		expect(names()).toContain('Plex')
		statsApi.series.mockClear()
		statsApi.series.mockResolvedValue(seriesWith({ 'cpu/total': 38 }))
		document.querySelector('.stats-series-error button').click()
		await tick(0)
		expect(statsApi.series).toHaveBeenCalledTimes(1)
		expect(document.querySelector('.stats-series-error')).toBeNull()
	})

	it('shows six figures, and a dash, not NaN, for a missing value', async () => {
		await open()
		expect(figureLabels()).toEqual(['Processor', 'Memory', 'Received', 'Sent', 'Disk', 'Processes'])
		expect(figureTexts()).toEqual(['38%', '-', '-', '-', '-', '-'])
		expect(document.querySelector('.stats-figures').textContent).not.toContain('NaN')
	})

	it('shows virtual processors for a virtual machine in place of processes', async () => {
		await open({ initialItem: 'vm-1' })
		expect(figureLabels()).toContain('Virtual CPUs')
		expect(figureLabels()).not.toContain('Processes')
	})

	it('shows the notes of the series as text', async () => {
		statsApi.series.mockResolvedValue(seriesWith({ 'cpu/total': 38 }, { notes: ['vm_memory_used_unavailable', '<b>x</b>'] }))
		await open()
		const notes = [...document.querySelectorAll('.stats-series-note')].map(n => n.textContent)
		expect(notes).toEqual(['The memory used inside the virtual machine is not reported.', 'Note from the service: <b>x</b>'])
		expect(document.querySelector('.stats-series-note b')).toBeNull()
	})

	it('says there is no data for a period that is all gaps, and draws no chart', async () => {
		statsApi.series.mockResolvedValue(seriesWith({ 'cpu/total': null, 'memory/rss': null }))
		await open()
		expect(document.querySelector('.stats-no-data').textContent).toBe('No data for this period')
		expect(document.querySelector('.stats-chart')).toBeNull()
	})

	it('shows since when an item runs, only for a running or paused item that has a start', async () => {
		serve({ ...defaults(), app_management: body([anItem({ id: 'a', name: 'A' }), anItem({ id: 'b', name: 'B', state: 'stopped' }), anItem({ id: 'c', name: 'C', started_at: null }), anItem({ id: 'd', name: 'D', state: 'paused' })]) })
		await open()
		const since = () => document.querySelector('.stats-since')?.textContent
		expect(since()).toContain('Running since')
		document.querySelectorAll('.stats-list button')[1].click()
		await tick(0)
		expect(document.querySelector('.stats-name').textContent).toBe('B')
		expect(since()).toBeUndefined()
		document.querySelectorAll('.stats-list button')[2].click()
		await tick(0)
		expect(document.querySelector('.stats-name').textContent).toBe('C')
		expect(since()).toBeUndefined()
		document.querySelectorAll('.stats-list button')[3].click()
		await tick(0)
		expect(since()).toContain('Running since')
	})

	it('shows the detail as one line of text, cut at 200 characters, the same in its title', async () => {
		serve({ ...defaults(), app_management: body([anItem({ detail: HOSTILE })]) })
		await open()
		expect(document.querySelector('.stats-detail img')).toBeNull()
		expect(document.querySelector('.stats-detail').textContent).toBe(HOSTILE)
		expect(document.querySelector('.stats-detail').getAttribute('title')).toBe(HOSTILE)
		wrapper.unmount()
		document.body.innerHTML = ''
		serve({ ...defaults(), app_management: body([anItem({ detail: 'x'.repeat(300) })]) })
		await open()
		expect(document.querySelector('.stats-detail').textContent).toHaveLength(200)
		expect(document.querySelector('.stats-detail').getAttribute('title')).toHaveLength(200)
	})

	it('shows the name, the kind and the state of the item as text', async () => {
		serve({ ...defaults(), app_management: body([anItem({ name: HOSTILE })]) })
		await open()
		expect(document.querySelector('.stats-name img')).toBeNull()
		expect(document.querySelector('.stats-name').textContent).toBe(HOSTILE)
		expect(document.querySelector('.stats-kind').textContent).toBe('Container')
		expect(document.querySelector('.stats-state').textContent).toBe('Running')
	})
})

describe('the chart cards of the page', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
		hasVirtualMachines.mockResolvedValue(true)
		statsApi.series.mockResolvedValue(seriesWith({ 'cpu/total': 38, 'memory/rss': 1000 }))
		serve(defaults())
	})
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
	})
	const apexes = () => wrapper.findAllComponents({ name: 'ApexStub' })
	const legendButton = label => [...document.querySelectorAll('.stats-legend button')].find(b => b.textContent.includes(label))
	const pageButton = label => [...document.querySelectorAll('.stats-toolbar button')].find(b => b.textContent.trim() === label)

	it('draws one card per chart, the processor across the whole width, all in one group', async () => {
		await mountPage()
		expect([...document.querySelectorAll('.stats-chart h4')].map(h => h.textContent)).toEqual(['Processor', 'Memory'])
		expect(document.querySelector('.stats-chart.is-wide h4').textContent).toBe('Processor')
		expect(apexes().map(a => a.props('options').chart.group)).toEqual(['stats', 'stats'])
	})

	it('hides a line when its legend entry is pressed and shows it again at the next press', async () => {
		await mountPage()
		const resident = () => apexes()[1]?.props('series').map(s => s.name)
		expect(resident()).toEqual(['Resident'])
		legendButton('Resident').click()
		await flushPromises()
		expect(legendButton('Resident').getAttribute('aria-pressed')).toBe('false')
		expect(apexes()).toHaveLength(1)
		legendButton('Resident').click()
		await flushPromises()
		expect(resident()).toEqual(['Resident'])
	})

	it('puts the same window on every card after a zoom, never asks again, and lets it go', async () => {
		await mountPage()
		const calls = statsApi.series.mock.calls.length
		expect(pageButton('Reset zoom')).toBeUndefined()
		apexes()[0].props('options').chart.events.zoomed({}, { xaxis: { min: 1760000100000, max: 1760000200000 } })
		await flushPromises()
		expect(apexes().map(a => a.props('options').xaxis.min)).toEqual([1760000100000, 1760000100000])
		expect(apexes().map(a => a.props('options').xaxis.max)).toEqual([1760000200000, 1760000200000])
		pageButton('Reset zoom').click()
		await flushPromises()
		expect(apexes().map(a => a.props('options').xaxis.min)).toEqual([null, null])
		expect(pageButton('Reset zoom')).toBeUndefined()
		expect(statsApi.series.mock.calls.length).toBe(calls)
	})

	it('zooms in by halving the window around the middle, as a button', async () => {
		await mountPage()
		const { from, to } = aSeries()
		pageButton('Zoom in').click()
		await flushPromises()
		const { min, max } = apexes()[0].props('options').xaxis
		const middle = (from + to) / 2 * 1000
		expect(max - min).toBe((to - from) * 1000 / 2)
		expect((min + max) / 2).toBe(middle)
	})
})

describe('the alerts of the page', () => {
	const since = '2026-10-20T08:00:00Z'
	const active = [{ key: 'cpu_high', since, value: 93.4 }, { key: 'mem_high', since, value: 95 }]
	let hidden
	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
		hidden = false
		Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
		hasVirtualMachines.mockResolvedValue(true)
		statsApi.series.mockResolvedValue(seriesWith({ 'cpu/total': 38 }))
		statsApi.alerts.mockResolvedValue(anAlerts({ active }))
		serve(defaults())
	})
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
		delete document.hidden
		vi.useRealTimers()
	})

	const tick = ms => vi.advanceTimersByTimeAsync(ms)
	async function open(props = {}) {
		wrapper = mount(StatsPage, { props, attachTo: document.body, global: { plugins: [Buefy, i18n] } })
		await tick(0)
		return wrapper
	}
	const lines = () => [...document.querySelectorAll('.stats-alerts p')].map(p => p.textContent)
	async function openDialog() {
		const button = [...document.querySelectorAll('.stats-head button')].find(b => b.textContent.trim() === 'Alert settings')
		button.focus()
		button.click()
		await tick(0)
		return button
	}

	it('lists the active alerts of the item as text, with a date', async () => {
		await open()
		expect(statsApi.alerts).toHaveBeenCalledWith('app_management', 'app:jellyfin:web:1')
		expect(document.querySelector('.stats-alerts').getAttribute('role')).toBe('status')
		expect(lines()).toHaveLength(2)
		expect(lines()[0]).toMatch(/^Processor at 93 % since .*2026/)
		expect(lines()[1]).toMatch(/^Memory at 95 % since /)
	})

	it('shows nothing when no alert is active', async () => {
		statsApi.alerts.mockResolvedValue(anAlerts())
		await open()
		expect(document.querySelector('.stats-alerts')).toBeNull()
		expect(document.querySelector('.stats-alerts-error')).toBeNull()
	})

	it('says what it can of an alert without a usable value, the crash of a VM, and one it does not know', async () => {
		statsApi.alerts.mockResolvedValue(anAlerts({ active: [
			{ key: 'cpu_high', since, value: 'NaN' },
			{ key: 'mem_high', since },
			{ key: 'vm_crashed', since },
			{ key: HOSTILE, since, value: 1 },
		] }))
		await open()
		expect(lines()[0]).toMatch(/^Processor high since /)
		expect(lines()[1]).toMatch(/^Memory high since /)
		expect(lines()[2]).toMatch(/^The virtual machine crashed since /)
		expect(lines()[3]).toContain(HOSTILE)
		expect(document.querySelector('.stats-alerts img')).toBeNull()
	})

	it('reads the alerts again when the count of the list changes, and not otherwise', async () => {
		await open()
		expect(statsApi.alerts).toHaveBeenCalledTimes(1)
		await tick(5000)
		expect(statsApi.alerts).toHaveBeenCalledTimes(1)
		serve({ ...defaults(), app_management: body([anItem({ alerts: 2 }), plex]) })
		await tick(5000)
		expect(statsApi.alerts).toHaveBeenCalledTimes(2)
	})

	it('reads them for the new item, and keeps the answer of the old one out', async () => {
		const first = deferred()
		statsApi.alerts.mockImplementation((source, id) => id === 'app:jellyfin:web:1' ? first.promise : Promise.resolve(anAlerts()))
		await open()
		document.querySelectorAll('.stats-list button')[1].click()
		await tick(0)
		first.resolve(anAlerts({ active }))
		await tick(0)
		expect(document.querySelector('.stats-name').textContent).toBe('Plex')
		expect(document.querySelector('.stats-alerts')).toBeNull()
	})

	it('only says the alerts could not be read, with a Retry that reads them again', async () => {
		statsApi.alerts.mockRejectedValueOnce(failure(500))
		await open()
		expect(document.querySelector('.stats-alerts-error span').textContent).toBe('Alerts could not be read.')
		expect(document.querySelector('.stats-series-error')).toBeNull()
		document.querySelector('.stats-alerts-error button').click()
		await tick(0)
		expect(document.querySelector('.stats-alerts-error')).toBeNull()
		expect(lines()).toHaveLength(2)
	})

	it('shows the alerts the save answered', async () => {
		statsApi.setAlerts.mockResolvedValue(anAlerts({ active: [{ key: 'mem_high', since, value: 91 }] }))
		await open()
		await openDialog()
		document.querySelector('.stats-dialog-actions .is-primary').click()
		await tick(0)
		expect(document.querySelector('.stats-dialog')).toBeNull()
		expect(lines()).toHaveLength(1)
		expect(lines()[0]).toMatch(/^Memory at 91 %/)
	})

	it('opens the settings from a button of the header, with the focus on the dialog heading', async () => {
		await open()
		await openDialog()
		expect(document.querySelector('.stats-dialog[role="dialog"]')).not.toBeNull()
		expect(document.activeElement).toBe(document.querySelector('.stats-dialog-title'))
	})

	it('gives the focus back to the button when the dialog closes', async () => {
		await open()
		const button = await openDialog()
		document.querySelector('.stats-dialog-actions button').click()
		await tick(0)
		expect(document.querySelector('.stats-dialog')).toBeNull()
		expect(document.activeElement).toBe(button)
	})

	it('gives the focus to the page heading when the button is gone', async () => {
		await open()
		await openDialog()
		document.querySelector('.stats-head button').remove()
		document.querySelector('.stats-dialog-actions button').click()
		await tick(0)
		expect(document.activeElement).toBe(document.querySelector('.stats-page h3'))
	})

	describe('opened the way the app grid opens it', () => {
		let host
		const isShown = (selector) => {
			const modal = document.querySelector(selector)?.closest('.modal')
			return Boolean(modal) && modal.style.display !== 'none'
		}
		const escape = () => document.activeElement.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
		afterEach(() => host?.unmount())

		it('closes the dialog at the first Escape and the page at the second', async () => {
			vi.useRealTimers()
			host = mount({ render: () => null }, { attachTo: document.body, global: { plugins: [Buefy, i18n] } })
			openStatistics(host.vm.$buefy, { appLaunchInIframe: true, appLaunchExceptions: [] })
			await vi.waitFor(() => expect(isShown('.stats-page')).toBe(true))
			await flushPromises()
			await vi.waitFor(() => expect(document.querySelector('.stats-head')).not.toBeNull())
			const button = [...document.querySelectorAll('.stats-head button')].find(b => b.textContent.trim() === 'Alert settings')
			button.click()
			await vi.waitFor(() => expect(document.querySelector('.stats-dialog')).not.toBeNull())
			escape()
			await flushPromises()
			expect(document.querySelector('.stats-dialog')).toBeNull()
			expect(isShown('.stats-page')).toBe(true)
			escape()
			await vi.waitFor(() => expect(isShown('.stats-page')).toBe(false))
		})
	})
})
