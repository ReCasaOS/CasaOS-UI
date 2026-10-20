// @vitest-environment happy-dom
// The page, the real client (src/service/stats.js) and the real axios instance, whose adapter is the stub of the contract.
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handle } from '../../../mock/stats-stub/handlers.js'
import { createAlertBadge } from './alertBadge'
import StatsPage from './StatsPage.vue'
import { hasVirtualMachines } from '@/components/VirtualMachines/entry'
import i18n from '@/plugins/i18n'
import { instance } from '@/service/service'
import { statsApi } from '@/service/stats'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
// the session store and the router are not under test; the real client and axios instance are
vi.mock('@/store', () => ({ default: { commit: vi.fn(), state: {} } }))
vi.mock('@/router', () => ({ default: { replace: vi.fn() } }))
vi.mock('@/components/VirtualMachines/entry', () => ({ hasVirtualMachines: vi.fn() }))
vi.mock('vue3-apexcharts', () => ({ __esModule: true, default: { name: 'ApexStub', props: ['options', 'series', 'type', 'height'], render: () => null } }))

const NOW = 1760000000
const original = instance.defaults.adapter
let stub
let asked
let tamper

// The adapter: what axios would send over the network goes to the stub instead.
function adapter(config) {
	const url = new URL(config.url, 'http://stub.test')
	const body = typeof config.data === 'string' && config.data ? JSON.parse(config.data) : null
	asked.push(`${(config.method || 'get').toUpperCase()} ${url.pathname}`)
	const { status, body: data } = handle({ method: config.method || 'get', path: url.pathname, query: config.params || {}, body: tamper ? tamper(body) : body }, stub)
	const response = { data, status, statusText: String(status), headers: {}, config, request: {} }
	if (status >= 200 && status < 300) {
		return Promise.resolve(response)
	}
	return Promise.reject(Object.assign(new Error(`Request failed with status code ${status}`), { isAxiosError: true, config, response }))
}

let wrapper
async function mountPage() {
	wrapper = mount(StatsPage, { attachTo: document.body, global: { plugins: [Buefy, i18n] } })
	await flushPromises()
	await flushPromises()
	return wrapper
}

const names = () => [...document.querySelectorAll('.stats-list .stats-item-name')].map(el => el.textContent)
const apexes = () => wrapper.findAllComponents({ name: 'ApexStub' })
const seriesNames = () => apexes().flatMap(a => a.props('series').map(s => s.name))
function choose(name) {
	[...document.querySelectorAll('.stats-list .stats-item')].find(b => b.querySelector('.stats-item-name').textContent === name).click()
}
const button = (selector, label) => [...document.querySelectorAll(selector)].find(b => b.textContent.trim() === label)
const askedFor = prefix => asked.filter(line => line.includes(prefix))

beforeEach(() => {
	document.body.innerHTML = ''
	vi.clearAllMocks()
	stub = { envelope: 'real', now: NOW, alerts: false, down: [], rules: new Map() }
	asked = []
	tamper = null
	instance.defaults.adapter = adapter
	hasVirtualMachines.mockResolvedValue(true)
})
afterEach(() => {
	wrapper?.unmount()
	wrapper = null
	instance.defaults.adapter = original
})

describe('the page against the stub of the contract', () => {
	it('lists the containers, the virtual machines and the machine, in the real envelopes', async () => {
		await mountPage()
		expect(names().sort()).toEqual(['Debian', 'Immich / server', 'Jellyfin / web', 'Plex / web', 'Windows', 'postgres', 'stagevet-box'])
		expect([...document.querySelectorAll('.stats-group-title')].map(el => el.textContent)).toEqual(['Containers', 'Other containers', 'Virtual Machines', 'Machine'])
		expect(document.querySelector('.stats-column-error')).toBeNull()
	})

	it('with the core bare, shows the core column as failed with Retry, and the two others work', async () => {
		stub.envelope = 'bare'
		await mountPage()
		expect(document.querySelector('.stats-column-error').textContent).toContain('Machine could not be read.')
		expect(button('.stats-column-error button', 'Retry')).toBeDefined()
		expect(names()).toContain('Jellyfin / web')
		expect(names()).toContain('Debian')
		expect(names()).not.toContain('stagevet-box')
	})

	it('with one source answering 503, shows that column failing and the others working, then recovers on Retry', async () => {
		stub.down = ['virt_management']
		await mountPage()
		expect(document.querySelector('.stats-column-error').textContent).toContain('Virtual Machines did not answer.')
		expect(names()).toContain('Jellyfin / web')
		expect(names()).toContain('stagevet-box')
		expect(names()).not.toContain('Debian')

		stub.down = []
		button('.stats-column-error button', 'Retry').click()
		await flushPromises()
		expect(names()).toContain('Debian')
		expect(document.querySelector('.stats-column-error')).toBeNull()
	})

	it('answers 503 stats_unavailable for the item named broken, through the real client', async () => {
		await expect(statsApi.series('app_management', 'broken', 'live')).rejects.toMatchObject({ response: { status: 503, data: { message: 'stats_unavailable' } } })
	})
})

describe('the badge of the Statistics icon against the stub', () => {
	it('counts the item that has 2 alerts, and asks nothing of the virt module when it is absent', async () => {
		stub.alerts = true
		const badge = createAlertBadge({ hasVm: () => Promise.resolve(false) })
		await badge.load()
		expect(badge.total()).toBe(2)
		expect(askedFor('/v2/virt_management')).toEqual([])
		expect(askedFor('/v2/app_management/stats')).toHaveLength(1)
		expect(askedFor('/v1/sys/stats')).toHaveLength(1)
		badge.stop()
	})

	it('asks the virt module when it is there', async () => {
		stub.alerts = true
		const badge = createAlertBadge({ hasVm: () => Promise.resolve(true) })
		await badge.load()
		expect(askedFor('/v2/virt_management/stats')).toHaveLength(1)
		expect(badge.total()).toBe(2)
		badge.stop()
	})
})

describe('the charts against the stub', () => {
	it('draws the memory of a VM without the used series and says why', async () => {
		await mountPage()
		choose('Debian')
		await flushPromises()
		expect(seriesNames()).toContain('Used')

		choose('Windows')
		await flushPromises()
		expect(seriesNames()).toContain('Assigned')
		expect(seriesNames()).not.toContain('Used')
		expect(document.body.textContent).toContain('The memory used inside the virtual machine is not reported.')
	})

	it('hands the 7-day gap to apexcharts as a null', async () => {
		await mountPage()
		expect(apexes().flatMap(a => a.props('series')).some(s => s.data.some(p => p.y === null))).toBe(false)

		button('.stats-ranges button', '7 days').click()
		await flushPromises()
		const withGap = apexes().flatMap(a => a.props('series')).filter(s => s.data.some(p => p.y === null))
		expect(withGap.length).toBeGreaterThan(0)
		expect(withGap[0].data.some(p => typeof p.y === 'number')).toBe(true)
	})

	it('after twenty quick changes of item, shows one set of curves, those of the last item', async () => {
		await mountPage()
		for (let i = 0; i < 20; i++) {
			choose(i % 2 === 0 ? 'Plex / web' : 'Jellyfin / web')
		}
		await flushPromises()
		await flushPromises()
		expect(document.querySelector('.stats-name').textContent).toBe('Jellyfin / web')

		const expected = handle({ method: 'GET', path: '/v2/app_management/stats/app%3Ajellyfin%3Aweb%3A1', query: { range: 'live' } }, stub).body
		const user = expected.series.find(s => s.chart === 'cpu' && s.name === 'user').points.map(p => p[1])
		const shown = apexes().flatMap(a => a.props('series')).filter(s => s.name === 'User')
		expect(shown).toHaveLength(1)
		expect(shown[0].data.map(p => p.y)).toEqual(user)
	})
})

describe('the alert settings against the stub', () => {
	async function openDialog() {
		button('.stats-head button', 'Alert settings').click()
		await flushPromises()
		await flushPromises()
	}
	async function typeThreshold(value) {
		const field = document.querySelector('.stats-rule [data-field="threshold"]')
		field.value = value
		field.dispatchEvent(new Event('input'))
		await flushPromises()
		return field
	}

	it('the stub refuses a threshold of 0 with 400 bad_rules, through the real client', async () => {
		await expect(statsApi.setAlerts('app_management', 'app:jellyfin:web:1', [{ key: 'cpu_high', enabled: true, threshold: 0, minutes: 10 }]))
			.rejects.toMatchObject({ response: { status: 400, data: { message: 'bad_rules: rules[0].threshold' } } })
	})

	it('shows the fixed refusal sentence and marks the threshold when the service refuses a value', async () => {
		await mountPage()
		await openDialog()
		expect(document.querySelector('.stats-rule [data-field="threshold"]').getAttribute('aria-invalid')).toBeNull()

		// the page lets 50 through; the service is made to receive 0
		tamper = body => ({ rules: body.rules.map((rule, i) => (i === 0 ? { ...rule, threshold: 0 } : rule)) })
		await typeThreshold('50')
		button('.stats-dialog-actions button', 'Save').click()
		await flushPromises()
		await flushPromises()

		expect(document.querySelector('.stats-dialog-error').textContent).toBe('These values were refused.')
		expect(document.querySelector('.stats-rule [data-field="threshold"]').getAttribute('aria-invalid')).toBe('true')
		expect(document.querySelector('.stats-dialog').textContent).not.toContain('bad_rules')
	})

	it('keeps what a valid save sent', async () => {
		await mountPage()
		await openDialog()
		await typeThreshold('75')
		button('.stats-dialog-actions button', 'Save').click()
		await flushPromises()
		await flushPromises()
		expect(document.querySelector('.stats-dialog')).toBeNull()
		// the first item of the list is Immich / server
		expect(stub.rules.get('app:immich:server:1')[0]).toMatchObject({ key: 'cpu_high', threshold: 75 })
	})
})
