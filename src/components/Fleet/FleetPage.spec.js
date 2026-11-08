// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FleetPage from './FleetPage.vue'
import { fleetApi } from '@/service/fleet'
import i18n from '@/plugins/i18n'

// The English strings, so that what a spec reads is what a person reads.
vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('@/service/fleet', () => ({ fleetApi: { status: vi.fn(), backups: vi.fn(), relay: vi.fn(), renameBox: vi.fn(), removeBox: vi.fn(), rotateCode: vi.fn() } }))

const A = { id: 'a', name: 'Home', url: 'https://home', online: true, last_seen: '2026-11-02T10:00:00Z' }
const B = { id: 'b', name: 'Shop', url: '', online: true, last_seen: '2026-11-02T10:00:00Z' }
const app = (name, title, status = 'running') => ({ name, app_type: 'v2app', status, title: { en_us: title } })
const DEFAULTS = {
	'/v1/sys/version/check': { current_version: '0.4.80', need_update: true, version: { version: '0.4.81' } },
	'/v1/sys/os': { pretty_name: 'Debian GNU/Linux 12 (bookworm)', support: { state: 'supported' } },
	'/v1/sys/utilization': { cpu: { percent: 10 }, mem: { usedPercent: 50 }, sys_disk: { size: 100, used: 25 } },
	'/v2/virt_management/vms': [],
}
const GRIDS = {
	a: [app('jellyfin', 'Jellyfin'), { name: 'db', app_type: 'container', status: 'exited', title: { en_us: 'Postgres' } }],
	b: [app('plex', 'Plex', 'exited')],
}
const failure = (status, body) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: body } })

// what each box answers to each call: `path` for a GET, `method path` for the rest; an Error rejects
function serve(table = {}) {
	fleetApi.relay.mockImplementation((boxId, method, path) => {
		const a = table[boxId]?.[`${method} ${path}`] ?? table[boxId]?.[path] ?? (path === '/v2/app_management/web/appgrid' ? GRIDS[boxId] : DEFAULTS[path]) ?? {}
		return a instanceof Error ? Promise.reject(a) : Promise.resolve({ status: 200, data: { success: 200, data: a } })
	})
}
const boxes = list => fleetApi.status.mockResolvedValue({ data: { data: { role: 'master', master: { address: 'https://m', boxes: list } } } })

let wrapper
async function mountPage() {
	wrapper = mount(FleetPage, { attachTo: document.body, global: { plugins: [Buefy, i18n] } })
	await flushPromises()
	return wrapper
}
const rows = () => wrapper.findAll('.fleet-page .fleet-row, .fleet-page .fleet-vm')
const chipOf = label => wrapper.findAll('.fleet-chip').find(c => c.text().startsWith(label))
const rowOf = text => rows().find(r => r.text().includes(text))
const cards = () => wrapper.findAll('.fleet-page .fleet-card')
const cardOf = text => cards().find(c => c.find('h4').text().includes(text))
async function openTab(label) {
	await wrapper.findAll('.tabs li a').find(a => a.text().includes(label)).trigger('click')
	await flushPromises()
}
const toolbarButton = label => wrapper.findAll('.fleet-toolbar button').find(b => b.text().includes(label))
const dialogButton = label => [...document.querySelectorAll('.dialog button')].find(b => b.textContent.includes(label))
const relayCalls = (boxId, method) => fleetApi.relay.mock.calls.filter(c => c[0] === boxId && (!method || c[1] === method))

describe('the Fleet page', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
		boxes([A, B])
		serve()
	})
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
	})

	it('shows one row per box, offline ones from the status alone', async () => {
		boxes([A, { ...B, online: false }])
		await mountPage()
		expect(wrapper.find('h3').text()).toBe('Fleet')
		expect(cards()).toHaveLength(2)
		expect(cardOf('Home').text()).toContain('Debian GNU/Linux 12 (bookworm)')
		expect(cardOf('Home').text()).toContain('Update available: 0.4.81')
		expect(cardOf('Home').text()).toContain('1/2')
		expect(cardOf('Shop').text()).toContain('Offline since')
		expect(relayCalls('b')).toHaveLength(0)
		expect(relayCalls('a', 'get').map(c => c[2]).sort()).toEqual(['/v1/sys/os', '/v1/sys/utilization', '/v1/sys/version/check', '/v2/app_management/web/appgrid', '/v2/virt_management/vms'])
	})

	it('keeps a failed source on its own row', async () => {
		serve({ a: { '/v1/sys/os': failure(500) } })
		await mountPage()
		expect(cardOf('Home').text()).toContain('Could not be read')
		expect(cardOf('Home').text()).toContain('1/2')
		expect(cardOf('Shop').text()).toContain('Debian GNU/Linux 12 (bookworm)')
		expect(cardOf('Shop').text()).not.toContain('Could not be read')
	})

	it('lists the containers of every box and acts on the selection', async () => {
		serve({ b: { 'put /v2/app_management/compose/plex/status': failure(409, { success: 409, message: 'busy' }) } })
		await mountPage()
		await openTab('Containers')
		expect(rows().map(r => r.text().includes('Jellyfin') || r.text().includes('Plex') || r.text().includes('Postgres'))).toEqual([true, true, true])
		await rowOf('Jellyfin').find('label.b-checkbox').trigger('click')
		await rowOf('Plex').find('label.b-checkbox').trigger('click')
		expect(toolbarButton('Stop').attributes('disabled')).toBeUndefined()
		await toolbarButton('Stop').trigger('click')
		await flushPromises()
		expect(relayCalls('a', 'put')).toEqual([['a', 'put', '/v2/app_management/compose/jellyfin/status', { data: '"stop"' }]])
		expect(relayCalls('b', 'put')).toEqual([['b', 'put', '/v2/app_management/compose/plex/status', { data: '"stop"' }]])
		expect(rowOf('Jellyfin').find('.fleet-result').text()).toBe('Done')
		expect(rowOf('Plex').find('.fleet-result').text()).toBe('Refused: busy')
		expect(rowOf('Postgres').find('.fleet-result').exists()).toBe(false)
	})

	it('refuses to check a non-actionable row, and says why', async () => {
		await mountPage()
		await openTab('Containers')
		expect(rowOf('Postgres').find('input[type=checkbox]').element.disabled).toBe(true)
		expect(rowOf('Jellyfin').find('input[type=checkbox]').element.disabled).toBe(false)
		expect(rowOf('Postgres').html()).toContain('Not controllable from the fleet')
		expect(toolbarButton('Stop').attributes('disabled')).toBeDefined()
	})

	it('keeps the results of the last action across a refresh', async () => {
		await mountPage()
		await openTab('Containers')
		await rowOf('Jellyfin').find('label.b-checkbox').trigger('click')
		await toolbarButton('Start').trigger('click')
		await flushPromises()
		expect(rowOf('Jellyfin').find('.fleet-result').text()).toBe('Done')
		const reads = relayCalls('a', 'get').length
		document.dispatchEvent(new Event('visibilitychange'))
		await flushPromises()
		expect(relayCalls('a', 'get').length).toBeGreaterThan(reads)
		expect(rowOf('Jellyfin').find('.fleet-result').text()).toBe('Done')
	})

	it('filters the containers by box and by state', async () => {
		await mountPage()
		await openTab('Containers')
		await wrapper.find('select.fleet-filter-box').setValue('b')
		expect(rows().map(r => r.text().includes('Plex'))).toEqual([true])
		await wrapper.find('select.fleet-filter-box').setValue('')
		await chipOf('Stopped').trigger('click')
		expect(rows()).toHaveLength(2)
		expect(rows().some(r => r.text().includes('Jellyfin'))).toBe(false)
	})

	it('groups the containers by box, counts them, and counts each chip', async () => {
		await mountPage()
		await openTab('Containers')
		const groups = wrapper.findAll('.fleet-group')
		expect(groups.map(g => g.find('h4').text())).toEqual(['Home', 'Shop'])
		expect(groups[0].text()).toContain('1 of 2 running')
		expect(groups[1].text()).toContain('0 of 1 running')
		expect(chipOf('All').text()).toContain('3')
		expect(chipOf('Running').text()).toContain('1')
		expect(chipOf('Stopped').text()).toContain('2')
	})

	it('searches the containers by name', async () => {
		await mountPage()
		await openTab('Containers')
		await wrapper.find('input.fleet-search').setValue('jelly')
		expect(rows().map(r => r.find('.fleet-row-title').text())).toEqual(['Jellyfin'])
		await wrapper.find('input.fleet-search').setValue('nothing here')
		expect(rows()).toHaveLength(0)
		expect(wrapper.text()).toContain('No container matches this filter')
	})

	it('acts on one container from its own buttons, and on a whole box from its header', async () => {
		await mountPage()
		await openTab('Containers')
		await rowOf('Jellyfin').find('button[aria-label="Stop Jellyfin"]').trigger('click')
		await flushPromises()
		expect(relayCalls('a', 'put')).toEqual([['a', 'put', '/v2/app_management/compose/jellyfin/status', { data: '"stop"' }]])
		expect(rowOf('Jellyfin').find('.fleet-result').text()).toBe('Done')
		// a stopped one offers Start, a running one Restart and Stop
		expect(rowOf('Plex').find('button[aria-label="Start Plex"]').exists()).toBe(true)
		expect(rowOf('Plex').find('button[aria-label="Stop Plex"]').exists()).toBe(false)
		// the box header checks what can be checked in it: Postgres is only listed
		await wrapper.find('.fleet-group-head label.b-checkbox').trigger('click')
		await toolbarButton('Restart').trigger('click')
		await flushPromises()
		expect(relayCalls('a', 'put').slice(1)).toEqual([['a', 'put', '/v2/app_management/compose/jellyfin/status', { data: '"restart"' }]])
	})

	it('names a box whose containers cannot be read once, in its group', async () => {
		serve({ b: { '/v2/app_management/web/appgrid': failure(503) } })
		await mountPage()
		await openTab('Containers')
		const shop = wrapper.findAll('.fleet-group').find(g => g.find('h4').text() === 'Shop')
		expect(shop.text()).toContain('Box offline')
		expect(shop.findAll('.fleet-row')).toHaveLength(0)
		expect(chipOf('All').text()).toContain('2')
	})

	it('mounts the Backups tab only once it is selected', async () => {
		fleetApi.backups.mockResolvedValue({ data: { data: { notify: true, interval_seconds: 300, boxes: [] } } })
		await mountPage()
		expect(fleetApi.backups).not.toHaveBeenCalled()
		await openTab('Backups')
		expect(fleetApi.backups).toHaveBeenCalledTimes(1)
		expect(wrapper.findComponent({ name: 'BackupsTab' }).exists()).toBe(true)
	})

	it('says so when the fleet cannot be read', async () => {
		fleetApi.status.mockRejectedValue(new Error('Network Error'))
		await mountPage()
		expect(wrapper.text()).toContain('The fleet could not be read.')
	})

	it('lists the VMs of the boxes that have the module and acts on them', async () => {
		const vm = { id: 'vm-1', title: 'Debian', state: 'running', vcpus: 2, memory_mib: 2048, os: 'debian12' }
		serve({ a: { '/v2/virt_management/vms': [vm] }, b: { '/v2/virt_management/vms': failure(404) } })
		await mountPage()
		await openTab('Virtual Machines')
		expect(rows()).toHaveLength(1)
		expect(rowOf('Debian').text()).toContain('2048 MiB')
		expect(rowOf('Debian').text()).toContain('Running')
		await rowOf('Debian').find('label.b-checkbox').trigger('click')
		await toolbarButton('Restart').trigger('click')
		await flushPromises()
		expect(relayCalls('a', 'post')).toEqual([['a', 'post', '/v2/virt_management/vms/vm-1/reboot']])
		expect(rowOf('Debian').find('.fleet-result').text()).toBe('Done')
		await toolbarButton('Stop').trigger('click')
		await flushPromises()
		expect(relayCalls('a', 'post').at(-1)).toEqual(['a', 'post', '/v2/virt_management/vms/vm-1/shutdown'])
	})

	it('shows each VM as a card with its facts, filters them, and acts from the card', async () => {
		const vms = [
			{ id: 'vm-1', title: 'Debian', state: 'running', vcpus: 2, memory_mib: 2048, os: 'debian12' },
			{ id: 'vm-2', title: 'Kali', state: 'paused', vcpus: 4, memory_mib: 4096, os: 'kali' },
			{ id: 'vm-3', title: 'Old', state: 'shut-off', vcpus: 1, memory_mib: 512, os: '' },
		]
		serve({ a: { '/v2/virt_management/vms': vms }, b: { '/v2/virt_management/vms': failure(503) } })
		await mountPage()
		await openTab('Virtual Machines')
		expect(rows()).toHaveLength(3)
		expect(rowOf('Kali').text()).toContain('on Home')
		expect(rowOf('Kali').text()).toContain('4096 MiB')
		expect(chipOf('Running').text()).toContain('1')
		expect(chipOf('Needs attention').text()).toContain('1')
		await chipOf('Needs attention').trigger('click')
		expect(rows().map(r => r.find('h4').text())).toEqual(['Kali'])
		await chipOf('All').trigger('click')
		await rowOf('Old').find('button[aria-label="Start Old"]').trigger('click')
		await flushPromises()
		expect(relayCalls('a', 'post')).toEqual([['a', 'post', '/v2/virt_management/vms/vm-3/start']])
		expect(rowOf('Old').find('.fleet-result').text()).toBe('Done')
		// the box whose VMs could not be read is named below the cards
		expect(wrapper.find('.fleet-vm-notes').text()).toContain('Shop')
		expect(wrapper.find('.fleet-vm-notes').text()).toContain('Box offline')
	})

	it('asks before forcing a VM off', async () => {
		serve({ a: { '/v2/virt_management/vms': [{ id: 'vm-1', title: 'Debian', state: 'running', vcpus: 2, memory_mib: 2048, os: '' }] } })
		await mountPage()
		await openTab('Virtual Machines')
		await rowOf('Debian').find('label.b-checkbox').trigger('click')
		await toolbarButton('Force off').trigger('click')
		await flushPromises()
		expect(relayCalls('a', 'post')).toEqual([])
		expect(document.body.textContent).toContain('Force off 1 virtual machines?')
		dialogButton('Force off').click()
		await flushPromises()
		expect(relayCalls('a', 'post')).toEqual([['a', 'post', '/v2/virt_management/vms/vm-1/force-off']])
	})

	it('does not hold the overview behind a spinner for a slow box', async () => {
		let answerB
		const slow = new Promise((resolve) => {
			answerB = resolve
		})
		// box B answers every source late, box A at once
		const inner = fleetApi.relay.getMockImplementation()
		fleetApi.relay.mockImplementation((boxId, method, path) => boxId === 'b' ? slow.then(data => ({ status: 200, data: { success: 200, data } })) : inner(boxId, method, path))
		await mountPage()
		expect(document.querySelector('.fleet-page .loading-overlay')).toBeNull()
		expect(cardOf('Home').text()).toContain('Debian GNU/Linux 12 (bookworm)')
		expect(cardOf('Shop').text()).toContain('Loading…')
		answerB({ pretty_name: 'Ubuntu 24.04 LTS', support: { state: 'supported' } })
		await flushPromises()
		expect(cardOf('Shop').text()).not.toContain('Loading…')
		expect(cardOf('Shop').text()).toContain('Ubuntu 24.04 LTS')
	})

	it('says "Never connected" for a box that has never reached the master', async () => {
		boxes([A, { id: 'c', name: 'Garage', url: '', online: false }])
		await mountPage()
		expect(cardOf('Garage').text()).toContain('Never connected')
		expect(cardOf('Garage').text()).not.toContain('1970')
	})

	it('sums the fleet in tiles above the cards, without a tile for virtual machines when there are none', async () => {
		boxes([A, { ...B, online: false }])
		await mountPage()
		const tiles = wrapper.findAll('.fleet-stat').map(t => t.text())
		expect(tiles).toHaveLength(3)
		expect(tiles[0]).toContain('1 / 2')
		expect(tiles[0]).toContain('1 offline')
		expect(tiles[1]).toContain('1 / 2')
		expect(tiles[1]).toContain('1 down')
		expect(tiles[2]).toContain('1')
		expect(wrapper.find('.fleet-overview').text()).not.toContain('Virtual Machines')
	})

	it('shows the virtual machines of a box that has some', async () => {
		serve({ a: { '/v2/virt_management/vms': [{ state: 'running' }, { state: 'shut off' }] } })
		await mountPage()
		expect(cardOf('Home').text()).toContain('Virtual Machines')
		expect(cardOf('Home').text()).toContain('1/2')
		expect(cardOf('Shop').text()).not.toContain('Virtual Machines')
		expect(wrapper.findAll('.fleet-stat')).toHaveLength(4)
	})

	it('says under each meter what the box has: cores, frequency, sizes', async () => {
		serve({ a: { '/v1/sys/utilization': { cpu: { percent: 10, num: 8, freq: 3400, temperature: 52 }, mem: { usedPercent: 50, used: 4 * 1024 ** 3, total: 8 * 1024 ** 3 }, sys_disk: { size: 100 * 1024 ** 3, used: 25 * 1024 ** 3 } } } })
		await mountPage()
		const details = cardOf('Home').findAll('.fleet-meter-detail').map(d => d.text())
		expect(details).toEqual(['8 cores · 3.4 GHz · 52°C', '4 GB / 8 GB', '25 GB / 100 GB'])
		// a box that sends no cores, no frequency and no totals gets no detail line
		expect(cardOf('Shop').findAll('.fleet-meter-detail')).toHaveLength(1)
	})

	it('updates ReCasaOS on a box from its tag, after asking', async () => {
		await mountPage()
		const tag = () => cardOf('Home').find('button.fleet-update')
		expect(tag().text()).toBe('Update available: 0.4.81')
		await tag().trigger('click')
		await flushPromises()
		expect(relayCalls('a', 'post')).toHaveLength(0)
		expect(document.body.textContent).toContain('Update ReCasaOS on Home?')
		dialogButton('Update').click()
		await flushPromises()
		expect(relayCalls('a', 'post')).toEqual([['a', 'post', '/v1/sys/update']])
		expect(tag().exists()).toBe(false)
		expect(cardOf('Home').text()).toContain('Updating…')
	})

	it('says why an update did not start, and leaves the tag', async () => {
		serve({ a: { 'post /v1/sys/update': failure(409, { message: 'busy' }) } })
		await mountPage()
		await cardOf('Home').find('button.fleet-update').trigger('click')
		await flushPromises()
		dialogButton('Update').click()
		await flushPromises()
		expect(document.body.textContent).toContain('busy')
		expect(cardOf('Home').find('button.fleet-update').exists()).toBe(true)
	})

	it('does not offer to update the master from the page', async () => {
		boxes([{ ...A, self: true }, B])
		await mountPage()
		expect(cardOf('Home').find('button.fleet-update').exists()).toBe(false)
		expect(cardOf('Home').text()).toContain('Update available: 0.4.81')
		expect(cardOf('Shop').find('button.fleet-update').exists()).toBe(true)
	})

	it('filters the cards with the chips and counts each filter', async () => {
		boxes([A, { ...B, online: false }])
		await mountPage()
		const chip = label => wrapper.findAll('.fleet-chip').find(c => c.text().startsWith(label))
		expect(chip('All').text()).toContain('2')
		expect(chip('Offline').text()).toContain('1')
		await chip('Offline').trigger('click')
		expect(cards().map(c => c.find('h4').text())).toEqual(['Shop'])
		await chip('To update').trigger('click')
		expect(cards().map(c => c.find('h4').text())).toEqual(['Home'])
		await chip('All').trigger('click')
		expect(cards()).toHaveLength(2)
	})

	it('puts the boxes that need a person first when sorted by state', async () => {
		boxes([A, { ...B, online: false }])
		await mountPage()
		expect(cards().map(c => c.find('h4').text())).toEqual(['Home', 'Shop'])
		await wrapper.find('#fleet-sort').setValue('state')
		expect(cards().map(c => c.find('h4').text())).toEqual(['Shop', 'Home'])
	})

	it('marks boxes that need a new code', async () => {
		boxes([{ ...A, needs_recode: true }, B])
		await mountPage()
		const home = cardOf('Home')
		const shop = cardOf('Shop')
		expect(home.find('.tag.is-warning').text()).toBe('New code needed')
		expect(home.find('button.is-warning').exists()).toBe(true)
		expect(shop.text()).not.toContain('New code needed')
		expect(shop.find('.is-warning').exists()).toBe(false)
		// the "New code" action itself is highlighted, for that box only
		expect(document.querySelectorAll('.dropdown-item.has-text-warning')).toHaveLength(1)
	})

	it('asks before giving a box a new code, which cuts its tunnel', async () => {
		fleetApi.rotateCode.mockResolvedValue({ data: { data: { code: 'FLEET1.new' } } })
		await mountPage()
		const overview = wrapper.findComponent({ name: 'OverviewTab' }).vm
		overview.newCode({ id: 'b', name: 'Shop' })
		await flushPromises()
		expect(fleetApi.rotateCode).not.toHaveBeenCalled()
		expect(document.body.textContent).toContain('New code for Shop?')
		dialogButton('New code').click()
		await flushPromises()
		expect(fleetApi.rotateCode).toHaveBeenCalledWith('b')
		expect(document.querySelector('.add-box-dialog input[readonly]').value).toBe('FLEET1.new')
	})

	it('shows what the core answers to a refused change as text, never as HTML', async () => {
		fleetApi.removeBox.mockRejectedValue(failure(409, { message: '<b>busy</b>' }))
		await mountPage()
		wrapper.findComponent({ name: 'OverviewTab' }).vm.confirmRemove({ id: 'b', name: 'Shop' })
		await flushPromises()
		dialogButton('Remove').click()
		await flushPromises()
		const toast = document.querySelector('.toast')
		expect(toast.textContent).toContain('<b>busy</b>')
		expect(toast.querySelector('b')).toBeNull()
	})

	it('removes a box after confirming, and renames one', async () => {
		fleetApi.removeBox.mockResolvedValue({})
		fleetApi.renameBox.mockResolvedValue({})
		await mountPage()
		const overview = wrapper.findComponent({ name: 'OverviewTab' }).vm
		overview.confirmRemove({ id: 'b', name: 'Shop' })
		await flushPromises()
		expect(document.body.textContent).toContain('Remove Shop from the fleet?')
		dialogButton('Remove').click()
		await flushPromises()
		expect(fleetApi.removeBox).toHaveBeenCalledWith('b')
		overview.rename({ id: 'a', name: 'Home' })
		await flushPromises()
		const input = document.querySelector('.dialog input')
		input.value = 'Garage'
		input.dispatchEvent(new Event('input'))
		dialogButton('Rename').click()
		await flushPromises()
		expect(fleetApi.renameBox).toHaveBeenCalledWith('a', { name: 'Garage' })
	})
})
