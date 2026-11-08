// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BackupsTab from './BackupsTab.vue'
import { fleetApi } from '@/service/fleet'
import i18n from '@/plugins/i18n'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('@/service/fleet', () => ({ fleetApi: { backups: vi.fn() } }))

const MIN = 60000
const ago = ms => new Date(Date.now() - ms).toISOString()
const couple = (over = {}) => ({ app: 'immich', destination: 'nas', state: 'ok', running: false, last_run_at: ago(10 * MIN), last_ok_at: ago(10 * MIN), last_ok_stamp: 's', last_error: '', next_slot: ago(-3600000), restic: true, restic_check: null, verify: { state: 'none', error: '' }, ...over })
const box = (over = {}) => ({ box_id: 'a', name: 'Home', online: true, polled_at: ago(MIN), stale: false, error: '', state: 'ok', green: true, problems: 0, couples: [couple()], ...over })
const answer = (boxes, over = {}) => ({ data: { data: { notify: true, interval_seconds: 300, boxes, ...over } } })

let wrapper
async function mountTab() {
	wrapper = mount(BackupsTab, { attachTo: document.body, global: { plugins: [Buefy, i18n] } })
	await flushPromises()
	return wrapper
}
const rows = () => wrapper.findAll('tbody > tr:not(.detail)').filter(r => !r.element.closest('.fleet-backups-couples'))
const rowOf = text => rows().find(r => r.text().includes(text))
const toggle = () => rowOf('Home').find('button.fleet-backups-toggle')
const summary = () => wrapper.find('.fleet-backups-summary')

describe('the Backups tab', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
		fleetApi.backups.mockResolvedValue(answer([box()]))
	})
	afterEach(() => {
		vi.useRealTimers()
		wrapper?.unmount()
		wrapper = null
	})

	it('says everything is green only when every box is', async () => {
		fleetApi.backups.mockResolvedValue(answer([box(), box({ box_id: 'b', name: 'Shop' })]))
		await mountTab()
		expect(summary().text()).toContain('Everything is green')
		expect(summary().classes()).toContain('is-ok')
	})

	it('counts the problems and the offline boxes in red, not green', async () => {
		fleetApi.backups.mockResolvedValue(answer([
			box(),
			box({ box_id: 'b', name: 'Shop', green: false, state: 'failed', problems: 2, couples: [couple({ state: 'failed' })] }),
			box({ box_id: 'c', name: 'Cabin', online: false }),
		]))
		await mountTab()
		expect(summary().text()).not.toContain('Everything is green')
		expect(summary().text()).toContain('2 problems')
		expect(summary().text()).toContain('1 offline')
		expect(summary().classes()).toContain('is-danger')
	})

	it('is not green when a box is unknown', async () => {
		fleetApi.backups.mockResolvedValue(answer([box(), box({ box_id: 'b', name: 'Shop', green: false, state: 'unknown' })]))
		await mountTab()
		expect(summary().text()).not.toContain('Everything is green')
		expect(summary().text()).toContain('1 unknown')
	})

	it('warns visibly when no alert channel is set, and opens the alerts settings', async () => {
		fleetApi.backups.mockResolvedValue(answer([box()], { notify: false }))
		await mountTab()
		const warning = wrapper.find('.fleet-backups-notify')
		expect(warning.text()).toContain('No alert channel is set on the master: nothing will warn you.')
		const open = vi.spyOn(wrapper.vm.$buefy.modal, 'open').mockReturnValue({})
		await warning.find('button').trigger('click')
		// the modal is loaded on demand
		await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1))
		expect(open.mock.calls[0][0].component.name).toBe('AlertsModal')
	})

	it('shows no warning when an alert channel is set', async () => {
		await mountTab()
		expect(wrapper.find('.fleet-backups-notify').exists()).toBe(false)
	})

	it('shows an offline box grey, with the age of what it last said, never as backed up', async () => {
		fleetApi.backups.mockResolvedValue(answer([box({ online: false, polled_at: ago(4 * MIN) })]))
		await mountTab()
		const row = rowOf('Home')
		expect(row.text()).toContain('Offline')
		expect(row.text()).toContain('4 min ago')
		expect(row.text()).not.toContain('Backed up')
		expect(row.find('[role="img"]').classes()).toContain('is-none')
		expect(row.find('[role="img"]').attributes('aria-label')).toContain('Offline')
	})

	it('shows a stale box grey', async () => {
		fleetApi.backups.mockResolvedValue(answer([box({ stale: true, polled_at: ago(90 * MIN) })]))
		await mountTab()
		expect(rowOf('Home').find('[role="img"]').classes()).toContain('is-none')
		expect(rowOf('Home').text()).toContain('Out of date')
	})

	it('shows a healthy box with its last success and a mark that is not colour alone', async () => {
		await mountTab()
		const row = rowOf('Home')
		expect(row.find('[role="img"]').classes()).toContain('is-ok')
		expect(row.find('[role="img"]').text()).not.toBe('')
		expect(row.find('[role="img"]').attributes('title')).toBeTruthy()
		expect(row.text()).toContain('10 min ago')
	})

	it('opens the detail of a box, a line per couple, failures first, with the error text', async () => {
		fleetApi.backups.mockResolvedValue(answer([box({
			green: false,
			state: 'failed',
			problems: 1,
			couples: [
				couple({ app: 'plex', destination: 'cloud' }),
				couple({ app: 'immich', destination: 'nas', state: 'failed', last_error: 'repository locked' }),
			],
		})]))
		await mountTab()
		expect(wrapper.text()).not.toContain('repository locked')
		await toggle().trigger('click')
		const lines = wrapper.findAll('.fleet-backups-couples tbody tr')
		expect(lines).toHaveLength(2)
		expect(lines[0].text()).toContain('immich')
		expect(lines[0].text()).toContain('nas')
		expect(lines[0].text()).toContain('Failed')
		expect(lines[0].text()).toContain('repository locked')
		expect(lines[1].text()).toContain('plex')
		await toggle().trigger('click')
		expect(wrapper.text()).not.toContain('repository locked')
	})

	it('shows the verification of a couple, and never green for one that cannot be verified', async () => {
		fleetApi.backups.mockResolvedValue(answer([box({
			couples: [
				couple({ app: 'alpha', verify: { state: 'passed', at: ago(2 * 3600000), error: '' } }),
				couple({ app: 'bravo', verify: { state: 'not_verifiable', error: '' } }),
				couple({ app: 'charlie', verify: { state: 'failed', at: ago(MIN), error: 'bad checksum' } }),
			],
		})]))
		await mountTab()
		await toggle().trigger('click')
		const lines = wrapper.findAll('.fleet-backups-couples tbody tr')
		const lineOf = name => lines.find(l => l.text().includes(name))
		const verify = name => lineOf(name).find('.fleet-backups-verify [role="img"]')
		expect(verify('alpha').classes()).toContain('is-ok')
		expect(verify('bravo').classes()).toContain('is-none')
		expect(verify('charlie').classes()).toContain('is-danger')
		expect(lineOf('charlie').text()).toContain('bad checksum')
		expect(rowOf('Home').find('[role="img"]').classes()).toContain('is-danger')
	})

	it('shows the error of a box that could not be read in its detail only', async () => {
		fleetApi.backups.mockResolvedValue(answer([box({ green: false, state: 'unknown', error: 'timeout on the box', couples: [] })]))
		await mountTab()
		expect(wrapper.text()).not.toContain('timeout on the box')
		await toggle().trigger('click')
		expect(wrapper.text()).toContain('timeout on the box')
	})

	it('says the fleet could not be read, and reads again on Retry', async () => {
		fleetApi.backups.mockRejectedValueOnce(new Error('Network Error'))
		await mountTab()
		expect(wrapper.text()).toContain('The fleet could not be read.')
		await wrapper.find('.fleet-error button').trigger('click')
		await flushPromises()
		expect(wrapper.text()).not.toContain('The fleet could not be read.')
		expect(rowOf('Home')).toBeTruthy()
	})

	it('reads again every 30 seconds', async () => {
		vi.useFakeTimers()
		wrapper = mount(BackupsTab, { attachTo: document.body, global: { plugins: [Buefy, i18n] } })
		await flushPromises()
		expect(fleetApi.backups).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(29000)
		expect(fleetApi.backups).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(1500)
		expect(fleetApi.backups).toHaveBeenCalledTimes(2)
	})

	it('says so when there is no box', async () => {
		fleetApi.backups.mockResolvedValue(answer([]))
		await mountTab()
		expect(wrapper.text()).toContain('No box in the fleet yet')
		expect(wrapper.text()).not.toContain('Everything is green')
	})
})
