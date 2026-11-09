// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BackupsTab from './BackupsTab.vue'
import { fleetApi } from '@/service/fleet'
import i18n from '@/plugins/i18n'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('@/service/fleet', () => ({ fleetApi: { backups: vi.fn(), relay: vi.fn() } }))

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
const check = row => row.find('input[type="checkbox"]').setValue(true)
const bar = () => wrapper.find('.fleet-backups-bar')
const barButton = label => bar().findAll('button').find(b => b.text().includes(label))
const coupleLine = app => wrapper.findAll('.fleet-backups-couples tbody tr').find(l => l.text().includes(app))
const lineButton = (app, label) => coupleLine(app).findAll('button').find(b => b.text() === label)
const relayCalls = boxId => fleetApi.relay.mock.calls.filter(c => c[0] === boxId)
const failure = (status, body) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: body } })
const accepted = (started, refused = []) => Promise.resolve({ status: 202, data: { message: 'ok', data: { started, refused } } })

describe('the Backups tab', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
		fleetApi.backups.mockResolvedValue(answer([box()]))
		fleetApi.relay.mockImplementation(() => accepted([]))
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

	it('stops reading, and drops its listener, when the tab goes away', async () => {
		vi.useFakeTimers()
		const remove = vi.spyOn(document, 'removeEventListener')
		wrapper = mount(BackupsTab, { attachTo: document.body, global: { plugins: [Buefy, i18n] } })
		await flushPromises()
		wrapper.unmount()
		wrapper = null
		expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
		await vi.advanceTimersByTimeAsync(120000)
		document.dispatchEvent(new Event('visibilitychange'))
		await vi.advanceTimersByTimeAsync(0)
		expect(fleetApi.backups).toHaveBeenCalledTimes(1)
		remove.mockRestore()
	})

	describe('the detail of a box the master cannot vouch for', () => {
		const resticCouple = () => couple({ verify: { state: 'passed', at: ago(MIN), error: '' }, restic_check: { ok: true, at: ago(MIN), error: '' } })

		it('shows a fresh, online box in green, all three marks', async () => {
			fleetApi.backups.mockResolvedValue(answer([box({ couples: [resticCouple()] })]))
			await mountTab()
			await toggle().trigger('click')
			expect(wrapper.findAll('.fleet-backups-couples .is-ok')).toHaveLength(3)
		})

		it.each([['offline', { online: false }], ['stale', { stale: true }]])('has no green mark in the couples of a box that is %s, whose last snapshot was ok', async (_, over) => {
			fleetApi.backups.mockResolvedValue(answer([box({ ...over, couples: [resticCouple()] })]))
			await mountTab()
			await toggle().trigger('click')
			const marks = wrapper.findAll('.fleet-backups-couples .backup-mark')
			expect(marks).toHaveLength(3)
			expect(marks.every(m => m.classes().includes('is-none'))).toBe(true)
			// the words are kept
			expect(coupleLine('immich').text()).toContain('Integrity check: Passed')
		})
	})

	it('shows only the error, not "Not read yet", for an old box with an error and no read', async () => {
		fleetApi.backups.mockResolvedValue(answer([box({ couples: [], polled_at: '', state: 'unknown', green: false, error: 'this box is too old' })]))
		await mountTab()
		await toggle().trigger('click')
		expect(wrapper.text()).toContain('this box is too old')
		expect(wrapper.text()).not.toContain('Not read yet')
	})

	it('writes the integrity check as one sentence', async () => {
		fleetApi.backups.mockResolvedValue(answer([box({ couples: [couple({ restic_check: { ok: false, at: ago(MIN), error: 'bad pack' } })] })]))
		await mountTab()
		await toggle().trigger('click')
		expect(coupleLine('immich').text()).toContain('Integrity check: Failed')
	})

	describe('without couples', () => {
		it('says no backup is scheduled only for a box that was read', async () => {
			fleetApi.backups.mockResolvedValue(answer([box({ couples: [] })]))
			await mountTab()
			await toggle().trigger('click')
			expect(wrapper.text()).toContain('No backup is scheduled on this box')
		})

		it('does not say it for a box that was never read', async () => {
			fleetApi.backups.mockResolvedValue(answer([box({ couples: [], polled_at: '', state: 'unknown', green: false })]))
			await mountTab()
			await toggle().trigger('click')
			expect(wrapper.text()).not.toContain('No backup is scheduled on this box')
			expect(wrapper.find('.fleet-backups-unread').text()).toContain('Not read yet')
		})

		it('does not say it for a box whose read failed', async () => {
			fleetApi.backups.mockResolvedValue(answer([box({ couples: [], error: 'timeout on the box', state: 'unknown', green: false })]))
			await mountTab()
			await toggle().trigger('click')
			expect(wrapper.text()).toContain('timeout on the box')
			expect(wrapper.text()).not.toContain('No backup is scheduled on this box')
			expect(wrapper.find('.fleet-backups-unread').text()).toContain('could not be read')
		})
	})

	describe('backing up now', () => {
		const two = () => answer([box(), box({ box_id: 'b', name: 'Shop', couples: [couple({ app: 'plex' })] })])

		it('offers nothing to do until a box is ticked, and counts the ticked ones', async () => {
			fleetApi.backups.mockResolvedValue(two())
			await mountTab()
			expect(bar().text()).toContain('0 selected')
			expect(barButton('Back up now').attributes('disabled')).toBeDefined()
			expect(barButton('Schedule verification').attributes('disabled')).toBeDefined()
			await check(rowOf('Home'))
			expect(bar().text()).toContain('1 selected')
			expect(barButton('Back up now').attributes('disabled')).toBeUndefined()
			await check(rowOf('Shop'))
			expect(bar().text()).toContain('2 selected')
		})

		it('gives each ticked box its own result: one done, one offline', async () => {
			fleetApi.backups.mockResolvedValue(two())
			fleetApi.relay.mockImplementation(id => (id === 'b' ? Promise.reject(failure(503, { message: 'box offline' })) : accepted([{ app: 'immich', destination: 'nas' }])))
			await mountTab()
			await check(rowOf('Home'))
			await check(rowOf('Shop'))
			await barButton('Back up now').trigger('click')
			await flushPromises()
			expect(relayCalls('a')).toEqual([['a', 'post', '/v2/app_management/backup/schedules/run', { data: {} }]])
			expect(relayCalls('b')).toEqual([['b', 'post', '/v2/app_management/backup/schedules/run', { data: {} }]])
			expect(rowOf('Home').find('.fleet-result').text()).toBe('Done')
			expect(rowOf('Shop').find('.fleet-result').text()).toBe('Box offline')
		})

		it('says what a box refused inside a 202, never a bare Done', async () => {
			fleetApi.relay.mockImplementation(() => accepted([{ app: 'plex', destination: 'nas' }], [{ app: 'immich', destination: 'nas', reason: 'busy' }]))
			await mountTab()
			await check(rowOf('Home'))
			await barButton('Back up now').trigger('click')
			await flushPromises()
			const text = rowOf('Home').find('.fleet-result').text()
			expect(text).not.toBe('Done')
			expect(text).toContain('immich')
			expect(text).toContain('busy')
		})

		it('shows a refusal (409) and an old box (404) each on its own line, with its reason', async () => {
			fleetApi.backups.mockResolvedValue(two())
			fleetApi.relay.mockImplementation(id => Promise.reject(id === 'a' ? failure(409, { message: 'an operating system upgrade is open' }) : failure(404, { message: 'no schedule matches' })))
			await mountTab()
			await check(rowOf('Home'))
			await check(rowOf('Shop'))
			await barButton('Back up now').trigger('click')
			await flushPromises()
			expect(rowOf('Home').find('.fleet-result').text()).toBe('Refused: an operating system upgrade is open')
			expect(rowOf('Shop').find('.fleet-result').text()).toBe('Refused: no schedule matches')
		})

		it('ignores a second click while the first is running, and keeps the first result', async () => {
			let finish
			fleetApi.relay.mockImplementation(() => new Promise((resolve) => {
				finish = () => resolve({ status: 202, data: { data: { started: [], refused: [] } } })
			}))
			await mountTab()
			await check(rowOf('Home'))
			const click = barButton('Back up now')
			click.trigger('click')
			click.trigger('click')
			await flushPromises()
			expect(relayCalls('a')).toHaveLength(1)
			expect(barButton('Back up now').attributes('disabled')).toBeDefined()
			expect(barButton('Schedule verification').attributes('disabled')).toBeDefined()
			finish()
			await flushPromises()
			expect(rowOf('Home').find('.fleet-result').text()).toBe('Done')
			expect(barButton('Back up now').attributes('disabled')).toBeUndefined()
		})

		it('names every checkbox for a screen reader, and the header one ticks them all', async () => {
			fleetApi.backups.mockResolvedValue(two())
			await mountTab()
			const label = el => el.element.closest('label').textContent
			expect(label(rowOf('Home').find('input[type="checkbox"]'))).toContain('Select Home')
			const all = wrapper.find('thead input[type="checkbox"]')
			expect(label(all)).toContain('Select all boxes')
			await all.setValue(true)
			expect(bar().text()).toContain('2 selected')
			await all.setValue(false)
			expect(bar().text()).toContain('0 selected')
		})

		it('reads again about three seconds after an action', async () => {
			await mountTab()
			vi.useFakeTimers()
			await check(rowOf('Home'))
			await barButton('Back up now').trigger('click')
			await vi.advanceTimersByTimeAsync(0)
			expect(fleetApi.backups).toHaveBeenCalledTimes(1)
			await vi.advanceTimersByTimeAsync(2500)
			expect(fleetApi.backups).toHaveBeenCalledTimes(1)
			await vi.advanceTimersByTimeAsync(1000)
			expect(fleetApi.backups).toHaveBeenCalledTimes(2)
		})
	})

	describe('on one couple', () => {
		it('backs up one couple', async () => {
			await mountTab()
			await toggle().trigger('click')
			await lineButton('immich', 'Back up').trigger('click')
			await flushPromises()
			expect(relayCalls('a')).toEqual([['a', 'post', '/v2/app_management/backup/schedules/run', { data: { app: 'immich', destination: 'nas' } }]])
			expect(coupleLine('immich').find('.fleet-result').text()).toBe('Done')
		})

		it('ignores a second click on a couple while the first is running', async () => {
			await mountTab()
			await toggle().trigger('click')
			const click = lineButton('immich', 'Back up')
			click.trigger('click')
			click.trigger('click')
			await flushPromises()
			expect(relayCalls('a')).toHaveLength(1)
			expect(coupleLine('immich').find('.fleet-result').text()).toBe('Done')
		})

		it('names each button for a screen reader with its app and destination', async () => {
			fleetApi.backups.mockResolvedValue(answer([box({ couples: [couple({ restic: false }), couple({ app: 'plex', destination: 'cloud', restic: true })] })]))
			await mountTab()
			await toggle().trigger('click')
			expect(lineButton('immich', 'Back up').attributes('aria-label')).toBe('Back up immich to nas')
			expect(lineButton('immich', 'Verify').attributes('aria-label')).toBe('Verify immich on nas')
			expect(lineButton('plex', 'Check repository').attributes('aria-label')).toBe('Check repository of cloud')
		})

		it('says why Verify is disabled in its accessible name, not only in a tooltip', async () => {
			fleetApi.backups.mockResolvedValue(answer([box({ couples: [couple({ restic: false, last_ok_stamp: '', state: 'never' })] })]))
			await mountTab()
			await toggle().trigger('click')
			expect(lineButton('immich', 'Verify').attributes('aria-label')).toContain('no backup has succeeded')
		})

		it('does not say no backup has succeeded when the couple is ok but its records are gone', async () => {
			fleetApi.backups.mockResolvedValue(answer([box({ couples: [couple({ restic: false, last_ok_stamp: '', state: 'ok' })] })]))
			await mountTab()
			await toggle().trigger('click')
			const verify = lineButton('immich', 'Verify')
			expect(verify.attributes('aria-label')).not.toContain('no backup has succeeded')
			expect(verify.attributes('aria-label')).toContain('No run of it is left in the log of the box')
			expect(verify.attributes('title')).toBe('No run of it is left in the log of the box')
			expect(verify.attributes('disabled')).toBeDefined()
		})

		it('verifies a couple with its last good stamp', async () => {
			fleetApi.backups.mockResolvedValue(answer([box({ couples: [couple({ restic: false, last_ok_stamp: '20261108T0300' })] })]))
			await mountTab()
			await toggle().trigger('click')
			expect(lineButton('immich', 'Check repository')).toBeUndefined()
			await lineButton('immich', 'Verify').trigger('click')
			await flushPromises()
			expect(relayCalls('a')).toEqual([['a', 'post', '/v2/app_management/backup/verifications', { data: { destination: 'nas', app: 'immich', stamp: '20261108T0300' } }]])
		})

		it('cannot verify a couple that has no good backup yet', async () => {
			fleetApi.backups.mockResolvedValue(answer([box({ couples: [couple({ restic: false, last_ok_stamp: '', state: 'never' })] })]))
			await mountTab()
			await toggle().trigger('click')
			expect(lineButton('immich', 'Verify').attributes('disabled')).toBeDefined()
			await lineButton('immich', 'Verify').trigger('click')
			await flushPromises()
			expect(relayCalls('a')).toEqual([])
		})

		it('checks the repository of a restic couple instead of verifying it, the name encoded', async () => {
			fleetApi.backups.mockResolvedValue(answer([box({ couples: [couple({ destination: 'my nas/1', restic: true })] })]))
			await mountTab()
			await toggle().trigger('click')
			expect(lineButton('immich', 'Verify')).toBeUndefined()
			await lineButton('immich', 'Check repository').trigger('click')
			await flushPromises()
			expect(relayCalls('a')).toEqual([['a', 'post', '/v2/app_management/backup/destinations/my%20nas%2F1/restic/check']])
		})

		it('shows the refusal of the box on the couple\'s own line', async () => {
			fleetApi.relay.mockRejectedValue(failure(409, { message: 'already running' }))
			await mountTab()
			await toggle().trigger('click')
			await lineButton('immich', 'Back up').trigger('click')
			await flushPromises()
			expect(coupleLine('immich').find('.fleet-result').text()).toBe('Refused: already running')
		})

		it('shows a couple that cannot be verified grey, in words', async () => {
			fleetApi.backups.mockResolvedValue(answer([box({ couples: [couple({ restic: false, verify: { state: 'not_verifiable', error: '' } })] })]))
			await mountTab()
			await toggle().trigger('click')
			const mark = coupleLine('immich').find('.fleet-backups-verify [role="img"]')
			expect(mark.classes()).toContain('is-none')
			expect(mark.classes()).not.toContain('is-ok')
			expect(coupleLine('immich').find('.fleet-backups-verify').text()).toContain('Not verifiable')
		})
	})

	describe('scheduling the verification', () => {
		it('opens the dialog for the ticked boxes, starting from the schedule they carry', async () => {
			const schedule = { enabled: true, every_days: 14, at: '04:30' }
			fleetApi.backups.mockResolvedValue(answer([box({ verification_schedule: schedule }), box({ box_id: 'b', name: 'Shop' })]))
			await mountTab()
			await check(rowOf('Home'))
			const open = vi.spyOn(wrapper.vm.$buefy.modal, 'open').mockReturnValue({})
			await barButton('Schedule verification').trigger('click')
			expect(open).toHaveBeenCalledTimes(1)
			const { component, props } = open.mock.calls[0][0]
			expect(component.name).toBe('VerificationScheduleModal')
			expect(props.rows).toEqual([{ key: 'a', id: 'a', name: 'Home' }])
			expect(props.current).toEqual(schedule)
			expect(typeof props.afterApply).toBe('function')
			expect(props.differ).toBe(false)
		})

		const schedulesOf = (a, b) => answer([box({ verification_schedule: a }), box({ box_id: 'b', name: 'Shop', verification_schedule: b })])
		const openFor = async () => {
			await check(rowOf('Home'))
			await check(rowOf('Shop'))
			const open = vi.spyOn(wrapper.vm.$buefy.modal, 'open').mockReturnValue({})
			await barButton('Schedule verification').trigger('click')
			return open.mock.calls[0][0].props
		}

		it('prefills only when the ticked boxes that carry a schedule agree', async () => {
			const same = { enabled: true, every_days: 14, at: '04:30' }
			fleetApi.backups.mockResolvedValue(schedulesOf(same, { ...same }))
			await mountTab()
			const props = await openFor()
			expect(props.current).toEqual(same)
			expect(props.differ).toBe(false)
		})

		it('leaves the defaults and says so when the ticked boxes have different schedules', async () => {
			fleetApi.backups.mockResolvedValue(schedulesOf({ enabled: true, every_days: 14, at: '04:30' }, { enabled: true, every_days: 3, at: '04:30' }))
			await mountTab()
			const props = await openFor()
			expect(props.current).toBeNull()
			expect(props.differ).toBe(true)
		})

		it('ignores a box without a schedule when the others agree', async () => {
			const one = { enabled: false, every_days: 5, at: '01:00' }
			fleetApi.backups.mockResolvedValue(schedulesOf(one, undefined))
			await mountTab()
			const props = await openFor()
			expect(props.current).toEqual(one)
			expect(props.differ).toBe(false)
		})
	})
})
