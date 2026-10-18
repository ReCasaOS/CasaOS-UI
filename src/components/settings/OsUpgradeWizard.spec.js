// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import Buefy from 'buefy'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import OsSupportModal from './OsSupportModal.vue'
import OsUpgradeWizard from './OsUpgradeWizard.vue'
import { POLL_MS } from './osUpgrade'
import { NEXT, TEXT } from './osWizard'
import real from './__fixtures__/os-plan-d11-12.json'
import { CASES, raw } from './__fixtures__/os-run-states'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'
import i18n from '@/plugins/i18n'

// require.context has no Vite equivalent: the real English and French tables, in the plugin's own setup.
vi.mock('@/assets/lang', async () => ({
	default: {
		en_us: (await import('@/assets/lang/en_US.json')).default,
		fr_fr: (await import('@/assets/lang/fr_FR.json')).default,
	},
}))
vi.mock('clipboard-copy', () => ({ default: vi.fn() }))

const source = readFileSync('src/components/settings/OsUpgradeWizard.vue', 'utf8')

const NOW = new Date('2026-10-12T10:00:00Z')

// ---- a core that answers like the engine does, one step at a time ---------------------------------------------------------

const REPORT = {
	checked_at: '2026-10-12T09:55:00Z',
	state: 'ready',
	hop: {
		from: { id: 'debian', version_id: '11', codename: 'bullseye', pretty_name: 'Debian GNU/Linux 11 (bullseye)' },
		to: { id: 'debian', version_id: '12', codename: 'bookworm', pretty_name: 'Debian 12 (bookworm)' },
	},
	counts: { refuse: 0, warn: 0, ok: 1, info: 0 },
	checks: [{ code: 'ram', severity: 'ok', title: 't', detail: 'd', data: { unknown: false }, action: 'none' }],
	text: 'ReCasaOS readiness report\nstate: ready\n',
}

const core = {}
const order = []
const calls = {}

function reset() {
	Object.assign(core, { made: null, plannable: true, beta: false, run: null, extra: {}, idleExtra: {}, plan: null, planJob: 'idle', report: REPORT, down: false })
	order.length = 0
}
const answer = data => Promise.resolve({ data: { success: 200, message: 'ok', data } })
const refused = (error_code, data) => ({ response: { status: 409, data: { success: 409, message: 'x', data: { error_code, error: 'x', data } } } })

function statusNow() {
	if (!core.run)
		return raw('idle', { beta_enabled: core.beta, ...core.idleExtra })
	const wanted = CASES[core.run]
	return raw(core.run, { beta_enabled: core.beta, ...wanted.extra, actions: wanted.actions, ...core.extra })
}

function makeCalls() {
	const log = (name, fn) => vi.fn((...args) => {
		order.push(name)
		return fn(...args)
	})
	Object.assign(calls, {
		getOsUpgradeStatus: vi.fn(() => core.down ? Promise.reject(Object.assign(new Error('x'), { request: {} })) : answer(statusNow())),
		getOsReadiness: log('readiness', () => answer(core.report)),
		getOsPlan: vi.fn(() => answer(core.plannable === false ? { plannable: false, reason: 'not_ready', state: 'idle' } : core.planJob === 'done' ? { plannable: true, state: 'done', started_at: '2026-10-12T09:30:00Z', finished_at: '2026-10-12T09:34:10Z', expires_at: (core.made ?? core.plan).expires_at, plan: core.made ?? core.plan } : core.planJob === 'running' ? { plannable: true, state: 'running', phase: 'sources', started_at: '2026-10-12T09:59:00Z' } : { plannable: true, state: 'idle' })),
		startOsPlan: log('plan', () => {
			core.planJob = 'running'
			// the plan that is made again is made now, and has the same id: the machine is the same
			core.made = { ...real, made_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString() }
			return answer({ plannable: true, state: 'running', phase: 'sources', started_at: '2026-10-12T09:59:00Z' })
		}),
		getOsRunbook: vi.fn(() => answer({})),
		getOsUpgradeRunbook: vi.fn(() => answer({})),
		setOsUpgradeBeta: log('beta', (enabled) => {
			core.beta = enabled
			return answer({ beta_enabled: enabled })
		}),
		startOsRefresh: log('refresh', () => {
			core.run = 'refreshing'
			return answer({})
		}),
		startOsUpgrade: log('start', (body) => {
			core.run = body.rehearsal ? 'rehearsing' : 'running'
			return answer({})
		}),
		rebootOsUpgrade: log('reboot', () => {
			core.run = 'rebooting'
			return answer({})
		}),
		resumeOsUpgrade: log('resume', () => answer({})),
		abortOsUpgrade: log('abort', () => answer({})),
		ackOsUpgrade: log('ack', ({ action }) => {
			core.run = action === 'discard' && core.run === 'rehearsed' ? 'rehearsal_done' : null
			return answer({})
		}),
	})
}

let wrapper

async function tick(ms = 0) {
	await vi.advanceTimersByTimeAsync(ms)
	// the status goes from the run to the guide, and the guide draws what it says: a few turns
	for (let turn = 0; turn < 3; turn++)
		await nextTick()
}

async function open(props = {}, component = OsUpgradeWizard) {
	wrapper = mount(component, {
		attachTo: document.body,
		props: component === OsUpgradeWizard ? { locale: 'en_us', canCheck: true, ...props } : props,
		global: { plugins: [Buefy, i18n], mocks: { $api: { sys: calls } } },
	})
	await tick()
	return wrapper
}

const text = selector => wrapper.find(selector).text()
const primary = () => wrapper.find('.os-wizard-primary')
const current = () => wrapper.find('.os-wizard-step[aria-current="step"]')
const currentTitle = () => current().find('.os-wizard-step-title').text()
const stepStates = () => wrapper.findAll('.os-wizard-step-state').map(item => item.text())
const dialog = () => wrapper.find('.os-run-dialog')

// the machine is checked first, as the guide asks: for the tests that begin after it
async function openChecked(props = {}) {
	await open(props)
	if (currentTitle().includes('Check the machine') && primary().exists())
		await click('.os-wizard-primary')
	return wrapper
}

async function click(selector) {
	await wrapper.find(selector).trigger('click')
	await tick()
}
const press = () => click('.os-wizard-primary')

// a window opened by the guide, confirmed as a person would: the name of the machine, the boxes, the safety net
async function confirm({ hop = false } = {}) {
	if (hop)
		await wrapper.find('input[name="os-run-safety-net"][value="snapshot"]').setValue(true)
	if (wrapper.find('#os-run-hostname').exists())
		await wrapper.find('#os-run-hostname').setValue('stagevet-box')
	for (const input of wrapper.findAll('.os-run-dialog input[type="checkbox"]'))
		await input.setValue(true)
	await click('.os-run-dialog-ok')
}

// the core moves on by itself, and the page sees it at its next ask
async function becomes(state, extra = {}) {
	core.run = state
	core.extra = extra
	await tick(POLL_MS.idle)
}

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(NOW)
	i18n.global.locale = 'en_us'
	reset()
	makeCalls()
	delete document.hidden
})

afterEach(() => {
	wrapper?.unmount()
	wrapper = null
	document.body.innerHTML = ''
	vi.useRealTimers()
})

// ---- the whole journey -------------------------------------------------------------------------------------------------

describe('the journey from a clean Debian 11 to the verdict', () => {
	it('goes through the six steps with the calls in order, and each one once', async () => {
		await open()

		// 1. the check, then the switch
		expect(currentTitle()).toContain('Check the machine')
		expect(text('.os-wizard-position')).toBe('Step 1 of 6: Check the machine')
		expect(primary().text()).toBe('Continue')
		await press()
		expect(calls.getOsReadiness).toHaveBeenCalledTimes(1)
		expect(primary().text()).toBe('Switch the upgrade on')
		await press()
		await click('.os-run-dialog-ok')
		expect(calls.setOsUpgradeBeta).toHaveBeenCalledWith(true)

		// 2. the refresh, with its confirmation
		expect(currentTitle()).toContain('Bring the current release up to date')
		expect(primary().text()).toBe('Continue')
		await press()
		expect(calls.startOsRefresh).not.toHaveBeenCalled()
		await click('.os-run-dialog-ok')
		expect(calls.startOsRefresh).toHaveBeenCalledWith(false)
		expect(primary().exists()).toBe(false)
		expect(text('.os-wizard-next')).toBe(NEXT.refresh_working)

		// the machine wants a restart: the guide offers it, and the confirmation says it is the same release
		await becomes('reboot_first')
		expect(primary().text()).toBe('Restart now')
		// restarted by hand: the core says the refresh is done
		await becomes('refreshed')
		expect(primary().text()).toBe('Continue')
		expect(text('.os-wizard-next')).toBe(NEXT.refresh_close)
		await press()
		expect(calls.ackOsUpgrade).toHaveBeenLastCalledWith({ action: 'acknowledge', word: '' })

		// 3. the plan is asked for by itself, once
		expect(calls.startOsPlan).toHaveBeenCalledTimes(1)
		expect(currentTitle()).toContain('Prepare the plan')
		expect(text('.os-wizard-next')).toBe(NEXT.plan_running)
		core.planJob = 'done'
		core.plan = real
		await tick(1000)
		expect(calls.startOsPlan).toHaveBeenCalledTimes(1)

		// 4. the rehearsal, put back and closed by itself
		expect(currentTitle()).toContain('Rehearse')
		expect(wrapper.find('.os-wizard-secondary').text()).toBe('Skip the rehearsal')
		await press()
		await confirm()
		expect(calls.startOsUpgrade).toHaveBeenCalledTimes(1)
		expect(calls.startOsUpgrade.mock.calls[0][0]).toMatchObject({ rehearsal: true, plan_id: real.plan_id, safety_net: '' })
		await becomes('rehearsed')
		expect(primary().text()).toBe('Put the machine back')
		await press()
		expect(calls.ackOsUpgrade.mock.calls.map(call => call[0].action)).toEqual(['acknowledge', 'discard', 'acknowledge'])
		await tick(POLL_MS.open)

		// 5. the upgrade, from the plan that is alive
		expect(currentTitle()).toContain('Start the upgrade')
		expect(primary().text()).toBe('Start the upgrade')
		await press()
		expect(text('.os-run-dialog')).toContain('I took a snapshot of the machine')
		await confirm({ hop: true })
		expect(calls.startOsUpgrade).toHaveBeenCalledTimes(2)
		expect(calls.startOsUpgrade.mock.calls[1][0]).toMatchObject({ rehearsal: false, plan_id: real.plan_id, safety_net: 'snapshot', hostname: 'stagevet-box' })

		// 6. the restart, the outage, the check, the verdict
		await becomes('awaiting_reboot')
		expect(currentTitle()).toContain('Restart and check')
		expect(primary().text()).toBe('Restart now')
		await press()
		await click('.os-run-dialog-ok')
		expect(calls.rebootOsUpgrade).toHaveBeenCalledTimes(1)
		core.down = true
		await tick(POLL_MS.error * 3)
		expect(primary().exists()).toBe(false)
		expect(text('.os-wizard-next')).toBe(NEXT.stale)
		expect(text('.os-run-outage-message')).toBe('The machine is restarting. This page goes on by itself.')
		expect(currentTitle()).toContain('Restart and check')
		core.down = false
		await becomes('verifying')
		expect(primary().exists()).toBe(false)
		await becomes('succeeded')
		expect(primary().text()).toBe('Finish')
		await press()
		expect(core.run).toBeNull()
		await tick(POLL_MS.open)
		expect(stepStates()).toEqual(Array(6).fill('Done'))
		expect(text('.os-wizard-next')).toBe(TEXT.finished)

		expect(order).toEqual(['readiness', 'beta', 'refresh', 'ack', 'plan', 'start', 'ack', 'ack', 'start', 'reboot', 'ack'])
	})

	it('shows each step with a word and an icon, and announces a change of step once', async () => {
		await open()
		expect(wrapper.find('nav').attributes('aria-label')).toBe('Steps of the upgrade')
		expect(wrapper.findAll('.os-wizard-step')).toHaveLength(6)
		expect(wrapper.findAll('[aria-current="step"]')).toHaveLength(1)
		expect(stepStates()).toEqual(['Current step', 'To do', 'To do', 'To do', 'To do', 'To do'])
		for (const step of wrapper.findAll('.os-wizard-step'))
			expect(step.find('.os-wizard-mark').exists()).toBe(true)
		expect(text('.os-wizard-live')).toBe('')

		await press()
		await press()
		await click('.os-run-dialog-ok')
		expect(text('.os-wizard-live')).toBe(`Now at step 2 of 6: Bring the current release up to date ${NEXT.refresh_idle}`)
		// polls that change nothing say nothing more
		const said = text('.os-wizard-live')
		await tick(POLL_MS.open * 3)
		expect(text('.os-wizard-live')).toBe(said)
	})

	it('has no HTML of the core anywhere, and says everything by keys that the two languages have', () => {
		expect(source).not.toMatch(/v-html|innerHTML/)
		for (const key of Object.values(NEXT))
			expect([en[key], fr[key]].every(Boolean)).toBe(true)
	})
})

// ---- the guide follows the core, and resumes after a reload -----------------------------------------------------------------

describe('a reload in the middle of each step', () => {
	it.each([
		['the switch is off', { beta: false }, 'Check the machine'],
		['the switch is on and nothing else is known', { beta: true }, 'Check the machine'],
		['the switch is on and a refresh is behind', { beta: true, idleExtra: { last_refresh_at: '2026-10-12T08:00:00Z' } }, 'Prepare the plan'],
		['the refresh runs', { beta: true, run: 'refreshing' }, 'Bring the current release up to date'],
		['the refresh asks for a restart', { beta: true, run: 'reboot_first' }, 'Bring the current release up to date'],
		['the refresh is done', { beta: true, run: 'refreshed' }, 'Bring the current release up to date'],
		['a plan is alive', { beta: true, planJob: 'done', plan: real }, 'Rehearse'],
		['the rehearsal runs', { beta: true, run: 'rehearsing' }, 'Rehearse'],
		['the rehearsal is ready', { beta: true, run: 'rehearsed' }, 'Rehearse'],
		['the rehearsal ended', { beta: true, run: 'rehearsal_done' }, 'Rehearse'],
		['the upgrade runs', { beta: true, run: 'running' }, 'Start the upgrade'],
		['the machine waits for its restart', { beta: true, run: 'awaiting_reboot' }, 'Restart and check'],
		['the machine is checked', { beta: true, run: 'verifying' }, 'Restart and check'],
		['the verdict is in', { beta: true, run: 'succeeded' }, 'Restart and check'],
	])('resumes at the same step when %s', async (_, given, title) => {
		Object.assign(core, given)
		await open()
		expect(currentTitle()).toContain(title)
		expect(wrapper.findAll('[aria-current="step"]')).toHaveLength(1)
	})

	it('does not close a rehearsal by itself after a reload: the person said nothing', async () => {
		Object.assign(core, { beta: true, run: 'rehearsal_done' })
		await open()
		await tick(POLL_MS.open * 3)
		expect(calls.ackOsUpgrade).not.toHaveBeenCalled()
		expect(primary().text()).toBe('Continue')
	})

	it('does not ask for a plan by itself on a plan that is alive, or on a machine that cannot be planned', async () => {
		Object.assign(core, { beta: true, planJob: 'done', plan: real })
		await open()
		expect(calls.startOsPlan).not.toHaveBeenCalled()
	})
})

describe('what the guide does not hide', () => {
	it('keeps Continue off for a refresh that failed, and shows the state card with its buttons', async () => {
		Object.assign(core, { beta: true, run: 'failed', extra: { kind: 'refresh', reason: '', failure: { stage: 'apt', class: 'network', rc: 100, detail_line: '<b>STOP</b>: could not download' }, actions: ['acknowledge'] } })
		await open()
		expect(primary().exists()).toBe(false)
		// the step that stopped is where the person is, and says so in words
		expect(current().classes()).toContain('is-stopped')
		expect(wrapper.find('.os-wizard-step.is-stopped').text()).toContain('Bring the current release up to date')
		expect(wrapper.find('.os-wizard-step.is-stopped').text()).toContain('Stopped')
		expect(wrapper.findAll('.os-run-button').map(button => button.text())).toEqual(['Close this run'])
		expect(text('.os-run-failure-detail')).toContain('<b>STOP</b>')
		expect(wrapper.find('.os-run-failure-detail b').exists()).toBe(false)
		await tick(POLL_MS.open * 3)
		expect(primary().exists()).toBe(false)
	})

	it.each(['needs_attention', 'stopped_at_waypoint', 'interrupted', 'manual', 'failed', 'reboot_stalled'])('offers no Continue in %s, only the buttons of the state', async (state) => {
		Object.assign(core, { beta: true, run: state })
		await open()
		expect(primary().exists()).toBe(false)
		expect(wrapper.find('.os-wizard-secondary').exists()).toBe(false)
		expect(text('.os-wizard-next')).toBe(NEXT.stopped)
		expect(wrapper.find('.os-wizard-step.is-stopped').exists()).toBe(true)
		expect(wrapper.findAll('.os-run-button').length).toBe(CASES[state].actions.length)
	})

	it('blocks on a state it does not know', async () => {
		Object.assign(core, { beta: true, run: 'failed', extra: { state: 'a_state_from_the_future', actions: ['acknowledge'] } })
		await open()
		expect(primary().exists()).toBe(false)
		expect(text('.os-wizard-next')).toBe(NEXT.unknown)
		expect(wrapper.find('.os-run-unknown').text()).toBe('a_state_from_the_future')
	})

	it('says nothing for a machine that has no upgrade to offer', async () => {
		await open({ canCheck: false })
		expect(wrapper.find('.os-wizard-guide').exists()).toBe(false)
		expect(wrapper.find('.os-run').exists()).toBe(false)
	})

	it('still closes the run of a machine that cannot be checked any more', async () => {
		Object.assign(core, { beta: true, run: 'succeeded' })
		await open({ canCheck: false })
		expect(primary().text()).toBe('Finish')
		await press()
		expect(calls.ackOsUpgrade).toHaveBeenCalledTimes(1)
	})
})

describe('a call that is refused', () => {
	it('shows its sentence in the window of the step, and the guide stays where it was', async () => {
		Object.assign(core, { beta: true })
		calls.startOsRefresh.mockImplementation(() => Promise.reject(refused('busy', { reason: 'apt' })))
		await openChecked()
		await press()
		await click('.os-run-dialog-ok')
		expect(text('.os-run-dialog .os-run-call-sentence')).toBe('Another package manager is at work on this machine. Wait for it to end, then try again.')
		expect(currentTitle()).toContain('Bring the current release up to date')
		expect(calls.startOsRefresh).toHaveBeenCalledTimes(1)
	})

	it('shows the refusal of a close in the section, and keeps the same button', async () => {
		Object.assign(core, { beta: true, run: 'refreshed' })
		await open()
		calls.ackOsUpgrade.mockImplementation(() => Promise.reject(refused('not_terminal', {})))
		await press()
		expect(wrapper.find('.os-run-call-sentence').exists()).toBe(true)
		expect(primary().text()).toBe('Continue')
		expect(currentTitle()).toContain('Bring the current release up to date')
	})

	it('does not close the rehearsal by itself when putting the machine back was refused, and does not try again', async () => {
		Object.assign(core, { beta: true, run: 'rehearsed' })
		await open()
		calls.ackOsUpgrade.mockImplementation(() => Promise.reject(refused('not_terminal', {})))
		await press()
		await tick(POLL_MS.open * 3)
		expect(calls.ackOsUpgrade).toHaveBeenCalledTimes(1)
		expect(primary().text()).toBe('Put the machine back')
	})

	it('does not close a rehearsal by itself in a loop when that close is refused', async () => {
		Object.assign(core, { beta: true, run: 'rehearsed' })
		await open()
		await press()
		calls.ackOsUpgrade.mockImplementation(() => Promise.reject(refused('not_terminal', {})))
		core.run = 'rehearsal_done'
		await tick(POLL_MS.open * 4)
		// the discard, one close that was refused, and nothing more
		expect(calls.ackOsUpgrade.mock.calls.length).toBeLessThanOrEqual(3)
	})
})

describe('the plan and the refresh', () => {
	it('asks for the plan again when the refresh came after it', async () => {
		Object.assign(core, { beta: true, planJob: 'done', plan: real })
		await open()
		expect(currentTitle()).toContain('Rehearse')
		// the refresh begins while a plan is alive: that plan is older than the refresh
		await click('.os-wizard-secondary')
		expect(currentTitle()).toContain('Start the upgrade')
		await becomes('refreshing', { kind: 'refresh' })
		await becomes('refreshed')
		await press()
		core.planJob = 'idle'
		await tick(POLL_MS.idle)
		expect(currentTitle()).toContain('Prepare the plan')
		expect(calls.startOsPlan).toHaveBeenCalledTimes(1)
	})

	it('asks for the plan again when the core refuses a start because a refresh came after it', async () => {
		Object.assign(core, { beta: true, planJob: 'done', plan: real })
		await open()
		await click('.os-wizard-secondary')
		expect(calls.startOsPlan).not.toHaveBeenCalled()
		calls.startOsUpgrade.mockImplementation(() => Promise.reject(refused('plan_older_than_refresh', {})))
		await press()
		await confirm({ hop: true })
		expect(calls.startOsUpgrade).toHaveBeenCalledTimes(1)
		await tick()
		expect(calls.startOsPlan).toHaveBeenCalledTimes(1)
		expect(currentTitle()).toContain('Prepare the plan')
		expect(text('.os-wizard-next')).toBe(NEXT.plan_running)
	})

	it('does not ask for the plan by itself again after it failed', async () => {
		Object.assign(core, { beta: true })
		await openChecked()
		await click('.os-wizard-secondary')
		expect(calls.startOsPlan).toHaveBeenCalledTimes(1)
		core.planJob = 'failed'
		calls.getOsPlan.mockImplementation(() => answer({ plannable: true, state: 'failed', phase: 'sources', started_at: '2026-10-12T09:59:00Z', finished_at: '2026-10-12T09:59:30Z', error: { code: 'apt_failed', phase: 'sources', detail: 'x', data: {} } }))
		await tick(3000)
		expect(calls.startOsPlan).toHaveBeenCalledTimes(1)
		expect(text('.os-wizard-next')).toBe(NEXT.plan_failed)
		expect(primary().text()).toBe('Continue')
		await press()
		expect(calls.startOsPlan).toHaveBeenCalledTimes(2)
	})
})

describe('one click, one call', () => {
	it('makes the check once when the button is pressed twice', async () => {
		await open()
		const button = primary()
		await Promise.all([button.trigger('click'), button.trigger('click')])
		await tick()
		expect(calls.getOsReadiness).toHaveBeenCalledTimes(1)
	})

	it('closes once when the button is pressed twice, and puts the buttons away while the call is out', async () => {
		Object.assign(core, { beta: true, run: 'refreshed' })
		await open()
		let release
		calls.ackOsUpgrade.mockImplementation(() => new Promise((resolve) => {
			release = () => resolve({ data: { data: {} } })
		}))
		const button = primary()
		await button.trigger('click')
		await button.trigger('click')
		expect(calls.ackOsUpgrade).toHaveBeenCalledTimes(1)
		expect(primary().attributes('disabled')).toBeDefined()
		core.run = null
		release()
		await tick()
		expect(calls.ackOsUpgrade).toHaveBeenCalledTimes(1)
	})

	it('puts the machine back once', async () => {
		Object.assign(core, { beta: true, run: 'rehearsed' })
		await open()
		const button = primary()
		await button.trigger('click')
		await button.trigger('click')
		await tick()
		expect(calls.ackOsUpgrade.mock.calls.filter(call => call[0].action === 'discard')).toHaveLength(1)
	})
})

describe('the window around the guide', () => {
	it('puts the focus in the window and back on the button that opened it', async () => {
		Object.assign(core, { beta: true })
		await openChecked()
		await press()
		expect(dialog().exists()).toBe(true)
		await tick()
		expect(document.activeElement.classList.contains('os-run-dialog-title')).toBe(true)
		await click('.os-run-dialog-cancel')
		expect(dialog().exists()).toBe(false)
		expect(document.activeElement).toBe(primary().element)
	})

	it('closes only the window that is on top at Escape', async () => {
		Object.assign(core, { beta: true })
		const modal = await open({ os: { id: 'debian', version_id: '11', codename: 'bullseye', pretty_name: 'Debian GNU/Linux 11 (bullseye)', arch: 'amd64', known: true, support: { state: 'security_ended', ends: '2026-08-31', precision: 'day' }, next: { id: 'debian', version_id: '12', codename: 'bookworm', pretty_name: 'Debian 12 (bookworm)', state: 'report' } } }, OsSupportModal)
		await press()
		await press()
		expect(dialog().exists()).toBe(true)
		window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
		await tick()
		expect(dialog().exists()).toBe(false)
		expect(modal.emitted('close')).toBeUndefined()
	})

	it('shows the guide in the Operating system window, in place of the stacked sections', async () => {
		Object.assign(core, { beta: true })
		await open({ os: { id: 'debian', version_id: '11', codename: 'bullseye', pretty_name: 'Debian GNU/Linux 11 (bullseye)', arch: 'amd64', known: true, support: { state: 'security_ended', ends: '2026-08-31', precision: 'day' }, next: { id: 'debian', version_id: '12', codename: 'bookworm', pretty_name: 'Debian 12 (bookworm)', state: 'report' } } }, OsSupportModal)
		expect(wrapper.find('.os-wizard-guide').exists()).toBe(true)
		expect(wrapper.findAll('.os-wizard-primary')).toHaveLength(1)
		expect(wrapper.find('.os-support-modal .os-snapshot').exists()).toBe(true)
		expect(wrapper.find('.os-cannot').exists()).toBe(false)
	})

	it('clears its timers when the window closes', async () => {
		Object.assign(core, { beta: true })
		await openChecked()
		wrapper.unmount()
		wrapper = null
		expect(vi.getTimerCount()).toBe(0)
		const asked = calls.getOsUpgradeStatus.mock.calls.length
		await tick(POLL_MS.idle * 3)
		expect(calls.getOsUpgradeStatus).toHaveBeenCalledTimes(asked)
	})

	it('says its steps in French', async () => {
		i18n.global.locale = 'fr_fr'
		await open({ locale: 'fr_fr' })
		expect(text('.os-wizard-position')).toBe('Étape 1 sur 6 : Vérifier la machine')
		expect(primary().text()).toBe('Continuer')
		expect(wrapper.find('nav').attributes('aria-label')).toBe('Étapes de la mise à niveau')
	})
})

// ---- the second round: the core's time of the refresh, the plan asked again, and the words of a state that offers nothing -----------

describe('the plan, the check and the refresh, as the core tells them', () => {
	it('asks for the plan again, and takes the new one, when the core says the refresh came after it (same id, other time)', async () => {
		Object.assign(core, { beta: true, planJob: 'done', plan: real, idleExtra: { last_refresh_at: '2026-10-12T09:50:00Z' } })
		await open()
		expect(order).toEqual(['plan'])
		expect(currentTitle()).toContain('Prepare the plan')
		core.planJob = 'done'
		await tick(1000)
		expect(currentTitle()).toContain('Rehearse')
		expect(calls.startOsPlan).toHaveBeenCalledTimes(1)
		expect(stepStates()[1]).toBe('Done')
	})

	it('asks the core again whether a plan can be made when the step is reached, and when the person asks', async () => {
		Object.assign(core, { beta: true, plannable: false, idleExtra: { last_refresh_at: '2026-10-12T09:50:00Z' } })
		await open()
		expect(currentTitle()).toContain('Prepare the plan')
		expect(primary().text()).toBe('Try again')
		expect(wrapper.find('details.is-plan').attributes('open')).toBeDefined()
		const asked = calls.getOsPlan.mock.calls.length
		// the machine is mended: one press, and the plan is asked for
		core.plannable = true
		await press()
		expect(calls.getOsPlan.mock.calls.length).toBeGreaterThan(asked)
		expect(calls.startOsPlan).toHaveBeenCalledTimes(1)
	})

	it('asks again by itself when the check is made again while the plan cannot be made', async () => {
		Object.assign(core, { beta: true, plannable: false, idleExtra: { last_refresh_at: '2026-10-12T09:50:00Z' } })
		await open()
		const asked = calls.getOsPlan.mock.calls.length
		core.plannable = true
		await wrapper.findComponent({ name: 'OsUpgradeReadiness' }).vm.check()
		await tick()
		await tick(1000)
		expect(calls.getOsPlan.mock.calls.length).toBeGreaterThan(asked)
	})

	it('shows why nothing is offered when the core never says whether a plan can be made, and a button to try again', async () => {
		Object.assign(core, { beta: true, idleExtra: { last_refresh_at: '2026-10-12T09:50:00Z' } })
		calls.getOsPlan.mockImplementation(() => Promise.reject(Object.assign(new Error('x'), { request: {} })))
		await open()
		// the section cannot read the plan's state: it is a plan that cannot be made, for now, and the person can ask again
		expect(text('.os-wizard-next')).toBe(NEXT.plan_unavailable)
		expect(text('.os-wizard-step.is-blocked .os-wizard-step-reason')).toContain('A plan cannot be made on this machine just now.')
		expect(primary().text()).toBe('Try again')
	})

	it('asks for the check before the refresh when the switch is on after a reload', async () => {
		Object.assign(core, { beta: true })
		await open()
		expect(currentTitle()).toContain('Check the machine')
		expect(calls.startOsRefresh).not.toHaveBeenCalled()
		expect(primary().text()).toBe('Continue')
	})

	it('keeps the check open on a report with points to look at until the person says they read them, and opens the report', async () => {
		core.report = { ...REPORT, state: 'attention', counts: { refuse: 0, warn: 2, ok: 1, info: 0 }, checks: [{ code: 'containers_policy', severity: 'warn', title: 't', detail: 'd', data: { unknown: false, names: ['a'] }, action: 'none' }, { code: 'ram', severity: 'warn', title: 't', detail: 'd', data: { unknown: false }, action: 'none' }, { code: 'merged_usr', severity: 'ok', title: 't', detail: 'd', data: { unknown: false }, action: 'none' }] }
		await open()
		await press()
		expect(text('.os-wizard-next')).toContain('points to look at')
		expect(primary().text()).toBe('I have read the points')
		expect(wrapper.find('details.is-check').attributes('open')).toBeDefined()
		await press()
		expect(primary().text()).toBe('Switch the upgrade on')
		expect(calls.setOsUpgradeBeta).not.toHaveBeenCalled()
	})

	it('says that "I already did it" is not checked, and keeps the step unconfirmed', async () => {
		Object.assign(core, { beta: true })
		await openChecked()
		expect(text('.os-wizard-note')).toBe('Only if you really did: this page cannot check.')
		expect(wrapper.find('.os-wizard-secondary').attributes('aria-describedby')).toBe('os-wizard-secondary-note')
		await click('.os-wizard-secondary')
		expect(stepStates()[1]).toBe('Not confirmed')
		expect(currentTitle()).toContain('Prepare the plan')
	})

	it('opens the plan when it is the plan that stops the upgrade', async () => {
		Object.assign(core, { beta: true, planJob: 'done', plan: { ...real, verdict: 'blocked' } })
		await open()
		expect(text('.os-wizard-next')).toBe(NEXT.start_blocked)
		expect(wrapper.find('details.is-plan').attributes('open')).toBeDefined()
		expect(text('.os-wizard-why')).toBe('The plan has a problem that nothing can accept.')
	})
})

describe('the restart that is not offered, and the one that cannot be seen', () => {
	it('blocks the last step with the red checks and says the restart is offered again when they are mended', async () => {
		Object.assign(core, { beta: true, run: 'awaiting_reboot', extra: { actions: ['takeover'], barrier: { ok: false, checks: [{ code: 'fstab_unresolved', ok: false, severity: 'refuse' }] } } })
		await open()
		expect(primary().exists()).toBe(false)
		expect(text('.os-wizard-next')).toBe(NEXT.finish_barrier)
		expect(wrapper.find('.os-wizard-step.is-blocked').text()).toContain('Restart and check')
		const said = text('.os-wizard-live')
		// mended: the core offers the restart, and the guide says so, once
		core.extra = {}
		core.run = 'awaiting_reboot'
		await tick(POLL_MS.open)
		expect(primary().text()).toBe('Restart now')
		expect(text('.os-wizard-live')).not.toBe(said)
		expect(text('.os-wizard-live')).toContain(NEXT.finish_restart)
		expect(text('.os-run-live')).toBe('')
	})

	it('offers to go on when the core kept the refresh at its restart and cannot tell the machine restarted', async () => {
		Object.assign(core, { beta: true, run: 'reboot_first', extra: { boot_unknown: true } })
		await open()
		expect(wrapper.find('.os-wizard-secondary').text()).toBe('Already restarted? Continue')
		await click('.os-wizard-secondary')
		expect(calls.ackOsUpgrade).toHaveBeenLastCalledWith({ action: 'acknowledge', word: '' })
	})

	it('shows an old interruption before the point of no return as stopped, with the buttons of the state', async () => {
		Object.assign(core, { beta: true, run: 'interrupted', extra: { pnr: false, half_upgraded: false, last_activity_at: '2026-10-12T08:00:00Z' } })
		await open()
		expect(primary().exists()).toBe(false)
		expect(wrapper.find('.os-wizard-step.is-stopped').exists()).toBe(true)
		expect(text('.os-wizard-why')).toBe('The operation stopped at this step. Read why below.')
	})

	it('does not call a verdict that was taken over by hand a finished upgrade', async () => {
		Object.assign(core, { beta: true, run: 'manual_done' })
		await open()
		expect(primary().text()).toBe('Finish')
		await press()
		await tick(POLL_MS.idle)
		expect(text('.os-wizard-next')).not.toBe(TEXT.finished)
	})

	it('keeps the steps nobody confirmed unconfirmed when the upgrade is finished, and says what had findings', async () => {
		Object.assign(core, { beta: true, run: 'succeeded_with_findings' })
		await open()
		await press()
		await tick(POLL_MS.idle)
		expect(text('.os-wizard-next')).toBe(TEXT.finished)
		expect(stepStates()).toEqual(['Done', 'Not confirmed', 'Done', 'Not confirmed', 'Done', 'Done with findings'])
	})
})

describe('what is read aloud, and where the focus goes', () => {
	it('says a change once, in the guide, and not in the operation as well', async () => {
		Object.assign(core, { beta: true })
		await openChecked()
		await press()
		await click('.os-run-dialog-ok')
		expect(text('.os-run-live')).toBe('')
		const said = text('.os-wizard-live')
		expect(said).toContain(NEXT.refresh_working)
		await becomes('refreshing', { kind: 'refresh' })
		await tick(POLL_MS.open * 2)
		expect(text('.os-wizard-live')).toBe(said)
		expect(text('.os-run-live')).toBe('')
	})

	it('puts the focus on the sentence of the guide when the button goes inside a step', async () => {
		Object.assign(core, { beta: true })
		await openChecked()
		await press()
		await click('.os-run-dialog-ok')
		expect(primary().exists()).toBe(false)
		expect(document.activeElement).toBe(wrapper.find('.os-wizard-next').element)
	})
})

describe('the rehearsal is closed by itself only right after the person put the machine back', () => {
	it('does not remember the word when the press was ignored because a call was out', async () => {
		Object.assign(core, { beta: true, run: 'rehearsed' })
		await open()
		let release
		calls.ackOsUpgrade.mockImplementation(() => new Promise((resolve) => {
			release = () => resolve({ data: { data: {} } })
		}))
		// a call of the operation is out: the guide's press is ignored
		wrapper.findComponent({ name: 'OsUpgradeRun' }).vm.acting = 'abort'
		await tick()
		await wrapper.vm.go('discard')
		expect(wrapper.vm.memory.closeRehearsal).toBe(false)
		expect(calls.ackOsUpgrade).not.toHaveBeenCalled()
		release?.()
	})

	it('closes the ended rehearsal once, and not again at the next answer', async () => {
		Object.assign(core, { beta: true, run: 'rehearsed' })
		await open()
		await press()
		await tick(POLL_MS.open * 3)
		expect(calls.ackOsUpgrade.mock.calls.map(call => call[0].action)).toEqual(['discard', 'acknowledge'])
		expect(wrapper.vm.memory.closeRehearsal).toBe(false)
	})
})

describe('a refusal at each step: the guide stays, and the sentence is shown', () => {
	const WINDOW = '.os-run-dialog .os-run-call-sentence'
	const SECTION = '.os-run-call-sentence'
	const MATRIX = [
		['the beta switch', { beta: false }, 'beta', 'run_open', 'An upgrade is open. Finish it or close it first.', WINDOW, 'Check the machine', ['check', 'press']],
		['the refresh', { beta: true }, 'refresh', 'busy', 'Another package manager is at work on this machine. Wait for it to end, then try again.', WINDOW, 'Bring the current release up to date', ['check']],
		['the rehearsal', { beta: true, planJob: 'done', plan: real }, 'start', 'no_plan', 'There is no plan to start from. Make the plan first.', WINDOW, 'Rehearse', ['confirm']],
		['the putting back', { beta: true, run: 'rehearsed' }, 'ack', 'not_terminal', null, SECTION, 'Rehearse', []],
		['the close of the refresh', { beta: true, run: 'refreshed' }, 'ack', 'not_terminal', null, SECTION, 'Bring the current release up to date', []],
		['the upgrade', { beta: true, planJob: 'done', plan: real }, 'start', 'hostname_mismatch', 'The name you typed is not the name of this machine.', WINDOW, 'Start the upgrade', ['skip', 'confirm']],
		['the restart', { beta: true, run: 'awaiting_reboot' }, 'reboot', 'busy', null, WINDOW, 'Restart and check', ['dialog']],
		['the last close', { beta: true, run: 'succeeded' }, 'ack', 'not_terminal', null, SECTION, 'Restart and check', []],
	]

	it.each(MATRIX)('at %s', async (_, given, call, code, sentence, where, title, how) => {
		Object.assign(core, given)
		const key = { beta: 'setOsUpgradeBeta', refresh: 'startOsRefresh', start: 'startOsUpgrade', ack: 'ackOsUpgrade', reboot: 'rebootOsUpgrade' }[call]
		calls[key].mockImplementation(() => Promise.reject(refused(code, {})))
		await open()
		// the steps before the one under test are played as a person plays them
		if (how.includes('check'))
			await press()
		if (how.includes('skip'))
			await click('.os-wizard-secondary')
		await press()
		if (given.beta === false || call === 'refresh' || call === 'reboot' || call === 'start') {
			if (how.includes('confirm'))
				await confirm({ hop: title === 'Start the upgrade' })
			else if (dialog().exists() || wrapper.find('.os-run-dialog-ok').exists())
				await click('.os-run-dialog-ok')
		}
		expect(wrapper.find(where).exists()).toBe(true)
		if (sentence)
			expect(text(where)).toBe(sentence)
		expect(currentTitle()).toContain(title)
		expect(calls[key]).toHaveBeenCalledTimes(1)
	})

	it('at the check: a report that could not be read is said, and the step stays', async () => {
		calls.getOsReadiness.mockImplementation(() => Promise.reject(Object.assign(new Error('x'), { response: { status: 500, data: {} } })))
		await open()
		await press()
		expect(wrapper.find('.os-readiness-error').exists()).toBe(true)
		expect(currentTitle()).toContain('Check the machine')
		expect(primary().text()).toBe('Check again')
	})

	it('at the plan: a plan that is refused is said by its section, and the step stays', async () => {
		Object.assign(core, { beta: true, idleExtra: { last_refresh_at: '2026-10-12T09:50:00Z' } })
		calls.startOsPlan.mockImplementation(() => Promise.reject(refused('busy', { reason: 'apt' })))
		await open()
		await tick()
		expect(wrapper.find('.os-plan-failure').exists()).toBe(true)
		expect(currentTitle()).toContain('Prepare the plan')
		expect(primary().text()).toBe('Continue')
	})
})
