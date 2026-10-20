// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOSTILE, anItem } from './__fixtures__/contract'
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
