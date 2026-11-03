// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UpdatesTab from './UpdatesTab.vue'
import { fleetApi } from '@/service/fleet'
import i18n from '@/plugins/i18n'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('@/service/fleet', () => ({ fleetApi: { status: vi.fn(), relay: vi.fn() } }))

const A = { id: 'a', name: 'Home', self: true, online: true }
const B = { id: 'b', name: 'Shop', self: false, online: true }
const app = (name, update_available = true) => ({ name, app_type: 'v2app', status: 'running', title: { en_us: name }, update_available })
const DEFAULTS = {
	'/v1/sys/version/check': { current_version: '0.4.80', need_update: true, version: { version: '0.4.81' } },
	'/v1/sys/autoupdate': { enabled: true, state: 'waiting' },
}
const GRIDS = { a: [app('jellyfin')], b: [app('plex'), app('sonarr'), app('radarr', false)] }
const failure = (status, body) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: body } })

// what each box answers to each call: `path` for a GET, `method path` for the rest; an Error rejects, a function answers in turn
function serve(table = {}) {
	fleetApi.relay.mockImplementation((boxId, method, path) => {
		let a = table[boxId]?.[`${method} ${path}`] ?? table[boxId]?.[path] ?? (path === '/v2/app_management/web/appgrid' ? GRIDS[boxId] : DEFAULTS[path]) ?? {}
		if (typeof a === 'function') {
			a = a()
		}
		return a instanceof Error ? Promise.reject(a) : Promise.resolve({ status: 200, data: { success: 200, data: a } })
	})
}
// answers one after the other, the last one for ever
function inTurn(...answers) {
	let i = 0
	return () => answers[Math.min(i++, answers.length - 1)]
}

let wrapper
async function mountTab() {
	wrapper = mount(UpdatesTab, { attachTo: document.body, global: { plugins: [Buefy, i18n] } })
	await flushPromises()
	return wrapper
}
const rows = () => wrapper.findAll('tbody tr')
const rowOf = text => rows().find(r => r.text().includes(text))
const check = row => row.find('label.b-checkbox').trigger('click')
const toolbarButton = label => wrapper.findAll('.fleet-toolbar button').find(b => b.text().includes(label))
const dialogButton = label => [...document.querySelectorAll('.dialog button')].find(b => b.textContent.includes(label))
const relayCalls = (boxId, method) => fleetApi.relay.mock.calls.filter(c => c[0] === boxId && (!method || c[1] === method))

describe('the Updates tab', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
		fleetApi.status.mockResolvedValue({ data: { data: { role: 'master', master: { address: 'https://m', boxes: [A, B] } } } })
		serve()
	})
	afterEach(() => {
		vi.useRealTimers()
		wrapper?.unmount()
		wrapper = null
	})

	it('shows each box\'s release, automatic updates and apps to update', async () => {
		await mountTab()
		expect(rows()).toHaveLength(2)
		expect(rowOf('Shop').text()).toContain('0.4.80')
		expect(rowOf('Shop').text()).toContain('0.4.81')
		expect(rowOf('Shop').text()).toContain('Waiting')
		expect(rowOf('Shop').text()).toContain('2 apps to update')
		expect(rowOf('Home').text()).toContain('Update the master from its own settings')
	})

	it('excludes the master\'s own row from "Update ReCasaOS"', async () => {
		await mountTab()
		await check(rowOf('Home'))
		await check(rowOf('Shop'))
		expect(toolbarButton('Update ReCasaOS').text()).toContain('(1)')
		await toolbarButton('Update ReCasaOS').trigger('click')
		await flushPromises()
		expect(document.body.textContent).toContain('Update ReCasaOS on 1 boxes?')
		dialogButton('Update').click()
		await flushPromises()
		expect(relayCalls('a', 'post')).toEqual([])
		expect(relayCalls('b', 'post')).toEqual([['b', 'post', '/v1/sys/update']])
		expect(rowOf('Shop').text()).toContain('Updating…')
	})

	it('checks packages on demand and follows the update', async () => {
		serve({ b: { '/v1/sys/packages': { count: 3 }, '/v1/sys/packages/update/status': inTurn({ state: 'running' }, { state: 'succeeded' }) } })
		await mountTab()
		expect(relayCalls('b').some(c => c[2] === '/v1/sys/packages')).toBe(false)
		await rowOf('Shop').findAll('button').find(b => b.text() === 'Check').trigger('click')
		await flushPromises()
		expect(rowOf('Shop').text()).toContain('3 packages pending')
		await check(rowOf('Shop'))
		await toolbarButton('Update packages').trigger('click')
		await flushPromises()
		expect(document.body.textContent).toContain('Update the system packages on 1 boxes?')
		expect(document.body.textContent).toContain('Docker is left out, as on a box.')
		vi.useFakeTimers()
		dialogButton('Update packages').click()
		await vi.advanceTimersByTimeAsync(0)
		expect(relayCalls('b', 'post')).toEqual([['b', 'post', '/v1/sys/packages/update']])
		expect(rowOf('Shop').text()).toContain('Updating…')
		await vi.advanceTimersByTimeAsync(2000)
		expect(rowOf('Shop').text()).toContain('Up to date')
		expect(rowOf('Shop').text()).not.toContain('3 packages pending')
	})

	it('updates the apps of each selected box with its own ids', async () => {
		const run = { started_at: 't0', finished_at: 't1', apps: [{ id: 'plex', state: 'updated' }, { id: 'sonarr', state: 'failed', error: 'pull failed' }] }
		serve({ b: { '/v2/app_management/compose/updates/run': run }, a: { '/v2/app_management/compose/updates/run': { started_at: 't0', finished_at: 't1', apps: [{ id: 'jellyfin', state: 'updated' }] } } })
		await mountTab()
		await check(rowOf('Home'))
		await check(rowOf('Shop'))
		await toolbarButton('Update apps').trigger('click')
		await flushPromises()
		expect(document.body.textContent).toContain('Update the apps on 2 boxes?')
		dialogButton('Update apps').click()
		await flushPromises()
		expect(relayCalls('a', 'post')).toEqual([['a', 'post', '/v2/app_management/compose/updates', { data: { ids: ['jellyfin'] } }]])
		expect(relayCalls('b', 'post')).toEqual([['b', 'post', '/v2/app_management/compose/updates', { data: { ids: ['plex', 'sonarr'] } }]])
		expect(rowOf('Shop').text()).toContain('1/2')
		expect(rowOf('Shop').text()).toContain('sonarr')
		expect(rowOf('Home').text()).toContain('1/1')
	})

	it('shows a refused update on its row only', async () => {
		serve({ b: { 'post /v1/sys/update': failure(409, { message: 'a backup is running' }) } })
		fleetApi.status.mockResolvedValue({ data: { data: { role: 'master', master: { address: 'https://m', boxes: [{ ...A, self: false }, B] } } } })
		await mountTab()
		await check(rowOf('Home'))
		await check(rowOf('Shop'))
		await toolbarButton('Update ReCasaOS').trigger('click')
		await flushPromises()
		dialogButton('Update').click()
		await flushPromises()
		expect(rowOf('Shop').find('.fleet-result').text()).toBe('Refused: a backup is running')
		expect(rowOf('Home').text()).toContain('Updating…')
	})
})
