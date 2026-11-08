// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ContainersTab from './ContainersTab.vue'
import { fleetApi } from '@/service/fleet'
import i18n from '@/plugins/i18n'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('@/service/fleet', () => ({ fleetApi: { status: vi.fn(), relay: vi.fn(), backups: vi.fn() } }))

const MIN = 60000
const ago = ms => new Date(Date.now() - ms).toISOString()
const A = { id: 'a', name: 'Home', self: true, online: true }
const B = { id: 'b', name: 'Shop', self: false, online: true }
const app = name => ({ name, app_type: 'v2app', status: 'running', title: { en_us: name } })
let GRIDS
const couple = (over = {}) => ({ app: 'jellyfin', destination: 'nas', state: 'ok', last_error: '', last_ok_at: ago(10 * MIN), next_slot: ago(-3600000), verify: { state: 'none', error: '' }, ...over })
const backupBox = (id, over = {}) => ({ box_id: id, name: id, online: true, polled_at: ago(MIN), stale: false, error: '', state: 'ok', green: true, problems: 0, couples: [couple()], ...over })
const answer = boxes => ({ data: { data: { notify: true, interval_seconds: 300, boxes } } })

let wrapper
async function mountTab() {
	wrapper = mount(ContainersTab, { attachTo: document.body, global: { plugins: [Buefy, i18n] } })
	await flushPromises()
	return wrapper
}
const rowOf = (box, title) => wrapper.findAll('section.fleet-group').find(s => s.attributes('aria-label') === box).findAll('.fleet-row').find(r => r.text().includes(title))
const markOf = (box, title) => rowOf(box, title).find('.backup-mark')

describe('the backup mark on a container row', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
		GRIDS = { a: [app('jellyfin'), app('plex')], b: [app('jellyfin')] }
		fleetApi.status.mockResolvedValue({ data: { data: { role: 'master', master: { address: 'https://m', boxes: [A, B] } } } })
		fleetApi.relay.mockImplementation((boxId, method, path) => Promise.resolve({ status: 200, data: { success: 200, data: path === '/v2/app_management/web/appgrid' ? GRIDS[boxId] : {} } }))
		fleetApi.backups.mockResolvedValue(answer([backupBox('a'), backupBox('b', { couples: [] })]))
	})
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
	})

	it('shows a green check, with the destination, on an app whose backups are fine', async () => {
		await mountTab()
		const mark = markOf('Home', 'jellyfin')
		expect(mark.classes()).toContain('is-ok')
		expect(mark.text()).toBe('✓')
		expect(mark.attributes('role')).toBe('img')
		expect(mark.attributes('aria-label')).toMatch(/to nas$/)
	})

	it('shows nothing on an app without a schedule', async () => {
		await mountTab()
		expect(markOf('Home', 'plex').exists()).toBe(false)
		expect(markOf('Shop', 'jellyfin').exists()).toBe(false)
	})

	it('shows the red cross, with the reason, when the last backup failed', async () => {
		fleetApi.backups.mockResolvedValue(answer([backupBox('a', { state: 'failed', green: false, couples: [couple({ state: 'failed', last_error: 'disk full' })] }), backupBox('b', { couples: [] })]))
		await mountTab()
		const mark = markOf('Home', 'jellyfin')
		expect(mark.classes()).toContain('is-danger')
		expect(mark.text()).toBe('✕')
		expect(mark.attributes('aria-label')).toContain('disk full')
	})

	it('shows the red cross when the verification failed', async () => {
		fleetApi.backups.mockResolvedValue(answer([backupBox('a', { couples: [couple({ verify: { state: 'failed', error: 'corrupt' } })] }), backupBox('b', { couples: [] })]))
		await mountTab()
		expect(markOf('Home', 'jellyfin').classes()).toContain('is-danger')
		expect(markOf('Home', 'jellyfin').attributes('aria-label')).toBe('Verification failed')
	})

	it.each([
		['offline', { online: false }],
		['stale', { stale: true }],
		['never polled', { polled_at: '' }],
		['in error', { error: 'timeout on the box' }],
	])('shows grey attention, never green, for a box the master cannot vouch for (%s), whatever its last state', async (_, over) => {
		fleetApi.backups.mockResolvedValue(answer([backupBox('a', { green: true, state: 'ok', ...over }), backupBox('b', { couples: [] })]))
		await mountTab()
		const mark = markOf('Home', 'jellyfin')
		expect(mark.classes()).toContain('is-none')
		expect(mark.classes()).not.toContain('is-ok')
		expect(mark.attributes('aria-label')).toBe('Backup state unknown')
	})

	it('shows grey attention, not red, for a failure on a box that is offline', async () => {
		fleetApi.backups.mockResolvedValue(answer([backupBox('a', { online: false, couples: [couple({ state: 'failed', last_error: 'x' })] }), backupBox('b', { couples: [] })]))
		await mountTab()
		expect(markOf('Home', 'jellyfin').classes()).toContain('is-none')
	})

	it('shows grey attention for a late backup', async () => {
		fleetApi.backups.mockResolvedValue(answer([backupBox('a', { couples: [couple({ state: 'late' })] }), backupBox('b', { couples: [] })]))
		await mountTab()
		expect(markOf('Home', 'jellyfin').classes()).toContain('is-none')
		expect(markOf('Home', 'jellyfin').attributes('aria-label')).toBe('Backup late')
	})

	it('never repeats a stored late or failed text for a box the master cannot vouch for', async () => {
		fleetApi.backups.mockResolvedValue(answer([backupBox('a', { stale: true, couples: [couple({ state: 'late' })] }), backupBox('b', { couples: [] })]))
		await mountTab()
		expect(markOf('Home', 'jellyfin').attributes('aria-label')).toBe('Backup state unknown')
		expect(markOf('Home', 'jellyfin').attributes('title')).toBe('Backup state unknown')
	})

	it('marks compose apps only: a container or a v1 app of the same name gets nothing', async () => {
		GRIDS.a = [{ name: 'jellyfin', app_type: 'container', status: 'running' }]
		GRIDS.b = [{ name: 'jellyfin', app_type: 'v1app', status: 'running' }]
		fleetApi.backups.mockResolvedValue(answer([backupBox('a'), backupBox('b')]))
		await mountTab()
		expect(wrapper.findAll('.fleet-row')).toHaveLength(2)
		expect(wrapper.findAll('.backup-mark')).toHaveLength(0)
	})

	it('looks each row up in its own box, though two boxes run an app of the same name', async () => {
		fleetApi.backups.mockResolvedValue(answer([
			backupBox('a', { couples: [couple({ state: 'failed', last_error: 'disk full' })] }),
			backupBox('b'),
		]))
		await mountTab()
		expect(markOf('Home', 'jellyfin').classes()).toContain('is-danger')
		expect(markOf('Shop', 'jellyfin').classes()).toContain('is-ok')
	})

	it('still lists the containers, with no mark anywhere, when the backups cannot be read', async () => {
		fleetApi.backups.mockRejectedValue(Object.assign(new Error('Request failed with status code 500'), { response: { status: 500 } }))
		await mountTab()
		expect(rowOf('Home', 'jellyfin').exists()).toBe(true)
		expect(rowOf('Home', 'plex').exists()).toBe(true)
		expect(wrapper.findAll('.backup-mark')).toHaveLength(0)
		expect(wrapper.find('.fleet-error').exists()).toBe(false)
	})

	it('shows no mark when the answer is not a list of boxes', async () => {
		fleetApi.backups.mockResolvedValue({ data: { data: {} } })
		await mountTab()
		expect(rowOf('Home', 'jellyfin').exists()).toBe(true)
		expect(wrapper.findAll('.backup-mark')).toHaveLength(0)
	})

	it('reads the backups once for each pass over the boxes, not once per box', async () => {
		await mountTab()
		expect(fleetApi.backups).toHaveBeenCalledTimes(1)
		await wrapper.vm.load()
		expect(fleetApi.backups).toHaveBeenCalledTimes(2)
	})

	it('drops the marks when a later read of the backups fails', async () => {
		await mountTab()
		expect(wrapper.findAll('.backup-mark').length).toBeGreaterThan(0)
		fleetApi.backups.mockRejectedValue(new Error('down'))
		await wrapper.vm.load()
		await flushPromises()
		expect(wrapper.findAll('.backup-mark')).toHaveLength(0)
		expect(rowOf('Home', 'jellyfin').exists()).toBe(true)
	})
})
