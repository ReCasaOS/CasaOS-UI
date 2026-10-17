// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import Buefy from 'buefy'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OsUpgradePlan from './OsUpgradePlan.vue'
import { planText } from './osPlan'
import real from './__fixtures__/os-plan-d11-12.json'
import core from './__fixtures__/os-plan-core-answers.json'
import runbookAnswer from './__fixtures__/os-plan-runbook-d11-12.json'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'
import i18n from '@/plugins/i18n'

// require.context has no Vite equivalent: the real English and French tables, in the plugin's own setup (fallback to English,
// the language's name in lower case).
vi.mock('@/assets/lang', async () => ({
	default: {
		en_us: (await import('@/assets/lang/en_US.json')).default,
		fr_fr: (await import('@/assets/lang/fr_FR.json')).default,
	},
}))

const copy = vi.hoisted(() => vi.fn())
vi.mock('clipboard-copy', () => ({ default: copy }))
const saveAs = vi.hoisted(() => vi.fn())
vi.mock('file-saver', () => ({ default: { saveAs } }))

// From the project root: import.meta.url is not a file URL under happy-dom.
const source = readFileSync('src/components/settings/OsUpgradePlan.vue', 'utf8')

const ID = real.plan_id
const STARTED = '2026-10-12T09:30:00Z'
// the time of the tests: the plan of the fixture was made at 09:30 and lives until 09:30 the next day
const NOW = new Date('2026-10-12T10:00:00Z')
const HOUR = 3600 * 1000

// what GET /v1/sys/os/upgrade/plan says, in each state
const IDLE = { plannable: true, state: 'idle' }
const running = (phase = 'sources') => ({ plannable: true, state: 'running', phase, started_at: STARTED })
const done = (plan = real) => ({ plannable: true, state: 'done', started_at: STARTED, finished_at: '2026-10-12T09:34:10Z', expires_at: plan.expires_at, plan })
const failed = (error, phase = error.phase) => ({ plannable: true, state: 'failed', phase, started_at: STARTED, finished_at: '2026-10-12T09:31:00Z', error })

// the plan of the measured box, with changes
const planWith = (changes = {}) => ({ ...structuredClone(real), ...changes })

// what GET /v1/sys/os/upgrade/runbook says: the nine blocks of the core's runbook for the hop, in its order, as the core wrote them for the plan of the
// real box (the fixture has its whole text too). The text of the runbook numbers them from 0: BLOCK 0 is `verify`, the sources are BLOCK 3 and the point
// of no return is BLOCK 5.
const BLOCKS = runbookAnswer.blocks
const TEXT = '#!/bin/sh\n# runbook\nset -eu\n'
const runbook = (changes = {}) => ({ plan_id: ID, hop: 'debian-11-12', text: TEXT, blocks: BLOCKS, ...changes })

// a refusal of the core: a 409 with its code in data.error_code
const refused = (error_code, data) => ({ response: { status: 409, data: { success: 409, message: 'x', data: { error_code, error: 'x', data } } } })

const getOsPlan = vi.fn()
const startOsPlan = vi.fn()
const getOsRunbook = vi.fn()
let wrapper

const answer = data => Promise.resolve({ data: { success: 200, message: 'ok', data } })
// a call that fails when it is made (a promise that was rejected before anyone waited for it would be an unhandled rejection)
const failure = (error = {}) => () => Promise.reject(Object.assign(new Error('failed'), error))

// a call that is still out, and that the test answers when it chooses
function deferred() {
	const control = {}
	control.promise = new Promise((resolve, reject) => {
		control.resolve = resolve
		control.reject = reject
	})
	return control
}

// the time moves, and every answer that is waiting for it is let in
const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms)

// the window opened, and the core's first answer in
async function open(first = IDLE, options = {}) {
	getOsPlan.mockReturnValueOnce(answer(first))
	wrapper = mount(OsUpgradePlan, {
		props: { locale: 'en_us' },
		global: { plugins: [Buefy, i18n], mocks: { $api: { sys: { getOsPlan, startOsPlan, getOsRunbook } } } },
		...options,
	})
	await tick()
	return wrapper
}

function close() {
	wrapper?.unmount()
	wrapper = null
}

// the button pressed, and the core's answer in
async function start(status = running()) {
	startOsPlan.mockReturnValueOnce(answer(status))
	await wrapper.find('.os-plan-start').trigger('click')
	await tick()
}

// a window with a plan on it
async function opened(plan = real) {
	await open(done(plan))
	return wrapper
}

const text = selector => wrapper.find(selector).text()
const texts = selector => wrapper.findAll(selector).map(item => item.text())
const buttons = () => wrapper.findAll('button').map(button => button.text())
const cells = row => row.findAll('th, td').map(cell => cell.text())

async function openRunbook() {
	const details = wrapper.find('.os-plan-runbook')
	details.element.open = true
	await details.trigger('toggle')
	await tick()
}

beforeEach(() => {
	vi.useFakeTimers()
	// the plan of the fixture expires on the 13th at 09:30: a window that opens a few hours after it was made
	vi.setSystemTime(NOW)
	i18n.global.locale = 'en_us'
	for (const fn of [getOsPlan, startOsPlan, getOsRunbook, copy, saveAs])
		fn.mockReset()
})

afterEach(() => {
	close()
	vi.useRealTimers()
})

describe('the plan section, when it is shown', () => {
	it('is not there before the core has answered, and then says what it is for, that it changes nothing, and has one button', async () => {
		const first = deferred()
		getOsPlan.mockReturnValueOnce(first.promise)
		wrapper = mount(OsUpgradePlan, { props: { locale: 'en_us' }, global: { plugins: [Buefy, i18n], mocks: { $api: { sys: { getOsPlan, startOsPlan, getOsRunbook } } } } })
		await tick()
		expect(wrapper.find('.os-plan').exists()).toBe(false)

		first.resolve({ data: { data: IDLE } })
		await tick()

		expect(text('.os-plan-title')).toBe('What would the upgrade do?')
		expect(text('.os-plan-readonly')).toMatch(/^This plan changes nothing on the machine: apt works in a temporary folder that is removed afterwards\./)
		expect(buttons()).toEqual(['See what the upgrade would do'])
		expect(wrapper.find('section').attributes('aria-labelledby')).toBe('os-plan-title')
		expect(wrapper.find('#os-plan-title').exists()).toBe(true)
		expect(wrapper.find('[role="status"]').attributes('aria-live')).toBe('polite')
		expect(wrapper.find('[role="status"]').text()).toBe('')
	})

	it('asks the core once when it opens, and nothing more until the button is pressed', async () => {
		await open()
		await tick(10000)

		expect(getOsPlan).toHaveBeenCalledTimes(1)
		expect(startOsPlan).not.toHaveBeenCalled()
		expect(getOsRunbook).not.toHaveBeenCalled()
		expect(wrapper.find('.os-plan-report').exists()).toBe(false)
		// a machine that has no plan on the first look has not lost one
		expect(wrapper.find('.os-plan-withdrawn').exists()).toBe(false)
		expect(wrapper.find('.os-plan-vanished').exists()).toBe(false)
	})

	it.each([
		['a machine that cannot be planned', { plannable: false, reason: 'identity_unsupported', state: 'idle' }],
		['a core that is not root', { plannable: false, reason: 'not_root', state: 'idle' }],
		['a hop that is not planned', { plannable: false, reason: 'hop_not_planned', state: 'idle' }],
		['an answer that does not say it can be', { state: 'idle' }],
		['an answer that says it as a word', { plannable: 'true', state: 'idle' }],
		['a state it does not know', { plannable: true, state: 'from-the-future' }],
		['an answer that is not one', 'plannable'],
		['an answer that is nothing', null],
	])('is not shown for %s', async (_, status) => {
		await open(status)

		expect(wrapper.find('.os-plan').exists()).toBe(false)
	})

	it.each([
		['a core that has no such route', { response: { status: 404 } }],
		['a call that took too long', { code: 'ECONNABORTED' }],
		['no network', {}],
	])('is not shown for %s, and the window is none the worse', async (_, error) => {
		getOsPlan.mockImplementationOnce(failure(error))
		wrapper = mount(OsUpgradePlan, { props: { locale: 'en_us' }, global: { plugins: [Buefy, i18n], mocks: { $api: { sys: { getOsPlan, startOsPlan, getOsRunbook } } } } })
		await tick()

		expect(wrapper.find('.os-plan').exists()).toBe(false)
		await tick(5000)
		expect(getOsPlan).toHaveBeenCalledTimes(1)
	})

	it('is not shown in a window that has no way to ask the core', async () => {
		wrapper = mount(OsUpgradePlan, { props: { locale: 'en_us' }, global: { plugins: [Buefy, i18n], mocks: { $api: undefined } } })
		await tick()

		expect(wrapper.find('.os-plan').exists()).toBe(false)
	})

	// the readiness report above it said the system is not one to upgrade from: there is no plan to offer
	it.each([
		['unsupported', false],
		['latest', false],
		['ready', true],
		['attention', true],
		['blocked', true],
		['', true],
	])('when the readiness report says "%s", the plan is shown: %s', async (state, shown) => {
		await open(IDLE, { props: { locale: 'en_us', readinessState: state } })

		expect(wrapper.find('.os-plan').exists()).toBe(shown)
	})

	it('goes away when the report that is asked again says the system is the latest, and comes back with the next one', async () => {
		await open()
		expect(wrapper.find('.os-plan').exists()).toBe(true)

		await wrapper.setProps({ readinessState: 'latest' })
		expect(wrapper.find('.os-plan').exists()).toBe(false)

		await wrapper.setProps({ readinessState: '' })
		expect(wrapper.find('.os-plan').exists()).toBe(true)
	})
})

describe('making the plan', () => {
	it('asks the core to start it, once, with nothing sent, and says the step it is at', async () => {
		await open()
		await start(running('sources'))

		expect(startOsPlan).toHaveBeenCalledTimes(1)
		expect(startOsPlan.mock.calls[0]).toEqual([])
		expect(text('.os-plan-step')).toBe('Step 1 of 6: Reading and rewriting the package sources')
		expect(text('[role="status"]')).toContain('Step 1 of 6')
		// the button stays where it is, working, and is not pressed twice
		expect(wrapper.find('.os-plan-start').classes()).toContain('is-loading')
		await wrapper.find('.os-plan-start').trigger('click')
		await tick()
		expect(startOsPlan).toHaveBeenCalledTimes(1)
	})

	it('asks how it goes once a second, one request at a time, and says each step', async () => {
		await open()
		await start(running('sources'))
		const slow = deferred()
		getOsPlan.mockReturnValueOnce(slow.promise)

		await tick(1000)
		expect(getOsPlan).toHaveBeenCalledTimes(2)
		// the answer has not come: no second request is made, however long it takes
		await tick(30000)
		expect(getOsPlan).toHaveBeenCalledTimes(2)

		slow.resolve({ data: { data: running('update') } })
		await tick()
		expect(text('.os-plan-step')).toBe('Step 2 of 6: Fetching the package lists of the next release')
		getOsPlan.mockReturnValueOnce(answer(running('dist-upgrade')))
		await tick(1000)
		expect(text('.os-plan-step')).toBe('Step 4 of 6: Planning the full upgrade')
		expect(getOsPlan).toHaveBeenCalledTimes(3)
	})

	it('says a step it does not know as working, and a job with none', async () => {
		await open()
		await start(running('from-the-future'))
		expect(text('.os-plan-step')).toBe('Working')

		getOsPlan.mockReturnValueOnce(answer({ plannable: true, state: 'running' }))
		await tick(1000)
		expect(text('.os-plan-step')).toBe('Working')
	})

	it('shows the plan when the job is done, gives it the focus, stops asking, and offers to make it again', async () => {
		await open(IDLE, { attachTo: document.body })
		await start(running('parse'))
		getOsPlan.mockReturnValueOnce(answer(done()))
		await tick(1000)

		expect(wrapper.find('.os-plan-report').exists()).toBe(true)
		expect(text('.os-plan-result')).toBe('The plan found things you would have to accept first.')
		// the heading can take the focus (a heading does not, unless it is given a place in the order of focus that only a script uses)
		expect(wrapper.find('.os-plan-result').attributes('tabindex')).toBe('-1')
		expect(document.activeElement).toBe(wrapper.find('.os-plan-result').element)
		// a job that ends is not a job that is gone
		expect(wrapper.find('.os-plan-vanished').exists()).toBe(false)
		expect(wrapper.find('.os-plan-withdrawn').exists()).toBe(false)
		expect(wrapper.find('.os-plan-step').exists()).toBe(false)
		expect(wrapper.find('.os-plan-start').classes()).not.toContain('is-loading')
		expect(text('.os-plan-start')).toBe('Make the plan again')

		const asks = getOsPlan.mock.calls.length
		await tick(10000)
		expect(getOsPlan).toHaveBeenCalledTimes(asks)
	})

	it('follows the job that already runs when the core says so', async () => {
		await open()
		await start({ ...running('update'), already_running: true })

		expect(text('.os-plan-step')).toBe('Step 2 of 6: Fetching the package lists of the next release')
		getOsPlan.mockReturnValueOnce(answer(done()))
		await tick(1000)
		expect(wrapper.find('.os-plan-report').exists()).toBe(true)
	})

	it('follows a job that was running when the window opened, and shows its plan without waiting to be asked', async () => {
		await open(running('estimate'))
		expect(text('.os-plan-step')).toBe('Step 5 of 6: Estimating the download and the disk space')

		getOsPlan.mockReturnValueOnce(answer(done()))
		await tick(1000)
		expect(wrapper.find('.os-plan-report').exists()).toBe(true)
		expect(startOsPlan).not.toHaveBeenCalled()
	})

	it('shows a plan that was made before, as the core says it, with nothing asked and no focus taken', async () => {
		await open(done(), { attachTo: document.body })

		expect(wrapper.find('.os-plan-report').exists()).toBe(true)
		expect(document.activeElement).not.toBe(wrapper.find('.os-plan-result').element)
		expect(text('.os-plan-start')).toBe('Make the plan again')
		expect(text('.os-plan-meta')).toMatch(/^Plan p1-5787acb2, made on .*2026.*, valid until .*2026.*\.$/)
		await tick(5000)
		expect(getOsPlan).toHaveBeenCalledTimes(1)
	})

	it('says a plan that expired as one that has, and shows none of it', async () => {
		await open({ plannable: true, state: 'idle', expired: true, expires_at: '2026-10-12T09:30:00Z' })

		expect(text('.os-plan-expired')).toBe('The last plan has expired. Make a new one.')
		expect(text('[role="status"] .os-plan-expired')).toBe('The last plan has expired. Make a new one.')
		expect(wrapper.find('.os-plan-report').exists()).toBe(false)
		expect(text('.os-plan-start')).toBe('See what the upgrade would do')
	})

	it('says it when the job that was followed is no longer there', async () => {
		await open()
		await start(running('update'))
		getOsPlan.mockReturnValueOnce(answer(IDLE))
		await tick(1000)

		expect(text('.os-plan-vanished')).toBe('The plan is no longer on the machine: ReCasaOS may have restarted while it was being made. Make it again.')
		// in the announcing place, where a screen reader says it
		expect(text('[role="status"] .os-plan-vanished')).toBe('The plan is no longer on the machine: ReCasaOS may have restarted while it was being made. Make it again.')
		// it is said once, and as what happened: there was no plan on the screen to be gone
		expect(wrapper.find('.os-plan-withdrawn').exists()).toBe(false)
		expect(wrapper.find('.os-plan-step').exists()).toBe(false)
		expect(text('.os-plan-start')).toBe('Make the plan again')
		const asks = getOsPlan.mock.calls.length
		await tick(5000)
		expect(getOsPlan).toHaveBeenCalledTimes(asks)
	})

	it('makes a new plan after one, and the old one gives place to the step', async () => {
		await opened()
		await start(running('sources'))

		expect(wrapper.find('.os-plan-report').exists()).toBe(false)
		expect(wrapper.find('.os-plan-step').exists()).toBe(true)
		// a plan that gives place to a job is not a plan that is gone
		expect(wrapper.find('.os-plan-withdrawn').exists()).toBe(false)
	})

	// the request that begins a job can take seconds (it looks at the machine first): what ended before is not the step it is at
	it.each([
		['a job that failed at the update', failed({ code: 'timeout', phase: 'update', detail: '', data: {} })],
		['a job that is done, at its last step', { ...done(), phase: 'parse' }],
		['a plan that was made', done()],
	])('says "Working", and not the step that %s was at, while the request to make the plan again is out', async (_, before) => {
		await open(before)
		const out = deferred()
		startOsPlan.mockReturnValueOnce(out.promise)
		await wrapper.find('.os-plan-start').trigger('click')

		expect(text('.os-plan-step')).toBe('Working')
		expect(wrapper.find('.os-plan-start').classes()).toContain('is-loading')

		out.resolve({ data: { data: running('upgrade') } })
		await tick()
		expect(text('.os-plan-step')).toBe('Step 3 of 6: Planning the first, minimal upgrade')
	})

	it('sends one request when the button is pressed again while the first is out', async () => {
		await open()
		const out = deferred()
		startOsPlan.mockReturnValueOnce(out.promise)
		await wrapper.find('.os-plan-start').trigger('click')
		await wrapper.find('.os-plan-start').trigger('click')
		await tick()

		expect(startOsPlan).toHaveBeenCalledTimes(1)
		out.resolve({ data: { data: running() } })
		await tick()
		expect(startOsPlan).toHaveBeenCalledTimes(1)
		expect(text('.os-plan-step')).toBe('Step 1 of 6: Reading and rewriting the package sources')
	})
})

describe('when the job fails', () => {
	const error = (code, extra = {}) => ({ code, phase: 'update', detail: '', data: {}, ...extra })

	it('says why by the code, the step it stopped at, and has no plan', async () => {
		await open()
		await start()
		getOsPlan.mockReturnValueOnce(answer(failed(error('timeout', { phase: 'update' }))))
		await tick(1000)

		expect(text('.os-plan-failure-title')).toBe('The plan took too long and was stopped. Nothing was changed on the machine. Try again.')
		expect(text('.os-plan-failed-step')).toBe('It stopped at step 2 of 6: Fetching the package lists of the next release.')
		expect(wrapper.find('.os-plan-report').exists()).toBe(false)
		// a job that fails is not a job that is gone
		expect(wrapper.find('.os-plan-vanished').exists()).toBe(false)
		expect(wrapper.find('.os-plan-withdrawn').exists()).toBe(false)
		expect(text('.os-plan-start')).toBe('Make the plan again')
		const asks = getOsPlan.mock.calls.length
		await tick(5000)
		expect(getOsPlan).toHaveBeenCalledTimes(asks)
	})

	it('says a failed update by its kind, with the lines apt wrote as text under a heading that says whose words they are', async () => {
		await open(failed(error('sandbox_update_failed', {
			data: { kind: 'network' },
			detail: 'Err:3 http://user:s3cret@deb.debian.org/debian bookworm InRelease\nCould not resolve \'deb.debian.org\'\nE: <img src=x onerror=alert(1)>',
		})))

		expect(text('.os-plan-failure-title')).toBe('apt could not reach a package source: check the network and the name server of the machine.')
		expect(text('.os-plan-said summary')).toBe('What apt said, as the machine reported it')
		expect(texts('.os-plan-said-lines li')).toEqual(['Err:3 http://***@deb.debian.org/debian bookworm InRelease', 'E: <img src=x onerror=alert(1)>'])
		expect(wrapper.find('.os-plan-failure img').exists()).toBe(false)
		expect(wrapper.text()).not.toContain('s3cret')
	})

	// the core's own words (in English, whatever the language of the window) are not given as apt's
	it.each([
		['a failed update with no line of apt\'s', error('sandbox_update_failed', { data: { kind: 'other' }, detail: 'apt-get update ended with status 100' })],
		['a failed solver with no line of apt\'s', error('sandbox_solver_failed', { phase: 'upgrade', detail: 'apt-get -s ended with status 100' })],
		['a plan that was not understood', error('plan_unparsed', { phase: 'parse', detail: 'summary_mismatch' })],
		['a plan that was not understood, whose reason looks like an apt line', error('plan_unparsed', { phase: 'parse', detail: 'E: summary_mismatch' })],
	])('does not say the core\'s detail of %s as what apt said', async (_, content) => {
		await open(failed(content))

		expect(wrapper.find('.os-plan-failure-title').exists()).toBe(true)
		expect(wrapper.find('.os-plan-said').exists()).toBe(false)
		expect(wrapper.text()).not.toMatch(/What apt said|summary_mismatch|ended with status/)
	})

	// dpkg left a package half done: apt says it after its summary, the core says it is no apt that was not understood, and the owner is told what to run
	it('says a package that dpkg left half done by what to run, and not as an apt that was not understood', async () => {
		await open(failed(error('plan_unparsed', {
			phase: 'update',
			detail: 'a package is not fully installed or removed (apt says: 1 not fully installed or removed.): run dpkg --configure -a, then ask for the plan again',
			data: { reason: 'not_fully_installed', line: '1 not fully installed or removed.' },
		})))

		expect(text('.os-plan-failure-title')).toBe('A package on this machine is half installed or half configured, so there is no plan until it is mended. Run dpkg --configure -a in a console, then make the plan again.')
		expect(wrapper.find('.os-plan-said').exists()).toBe(false)
		expect(wrapper.text()).not.toContain('could not understand')

		close()
		i18n.global.locale = 'fr_fr'
		await open(failed(error('plan_unparsed', { data: { reason: 'not_fully_installed' } })), { props: { locale: 'fr_fr' } })
		expect(text('.os-plan-failure-title')).toBe('Un paquet de cette machine est à moitié installé ou à moitié configuré : il n\'y a pas de plan tant qu\'il n\'est pas réparé. Lancez dpkg --configure -a dans une console, puis refaites le plan.')
	})

	// the proxy of the box may be in a file that the sandbox did not get: a failure that said only the network would send the owner to the wrong place
	describe('with the files of apt\'s configuration that the sandbox did not get', () => {
		const note = 'These files of apt\'s own configuration were not used by the plan, which reads only plain settings of the network and of recommended packages. If a proxy was set in one of them, the plan could not use it, and that may be why it failed.'
		const left = [
			'01autoremove: It is not made of simple settings, one to a line.',
			'15update-stamp: It is not made of simple settings, one to a line.',
			'20auto-upgrades: It sets something other than the network or the recommended packages.',
			'80link: It is not a regular file.',
			'96osp:gpgv: It sets something other than the network or the recommended packages.',
			'97big: It is too large.',
			'98osp-canary-detect: It sets a script that finds the proxy, which the plan does not run.',
			'98osp-canary-incl: It has a directive of apt\'s configuration language, such as #include or #clear.',
		]

		it('says them under the sentence of a failed update, each with why, and the note about a proxy, before the step and what apt said', async () => {
			await open(core.status_failed_update)

			expect(text('.os-plan-failure-title')).toBe('apt could not reach a package source: check the network and the name server of the machine.')
			expect(text('.os-plan-failure-conf > p')).toBe(note)
			expect(texts('.os-plan-failure-conf li')).toEqual(left)
			expect(wrapper.find('.os-plan-failure-conf-cut').exists()).toBe(false)
			const html = wrapper.find('.os-plan-failure').html()
			const at = ['os-plan-failure-title', 'os-plan-failure-conf', 'os-plan-failed-step', 'os-plan-said'].map(name => html.indexOf(`class="${name}`))
			expect(at.every(place => place >= 0)).toBe(true)
			expect(at).toEqual([...at].sort((a, b) => a - b))
			// what apt said is still there, as apt's
			expect(text('.os-plan-said summary')).toBe('What apt said, as the machine reported it')
			// announced where the failure is
			expect(wrapper.find('[role="status"] .os-plan-failure-conf').exists()).toBe(true)
		})

		it('says that the list is cut when the core cut it at 200', async () => {
			await open(core.status_failed_update_many)

			expect(wrapper.findAll('.os-plan-failure-conf li')).toHaveLength(200)
			expect(text('.os-plan-failure-conf-cut')).toBe('The list is cut: there are more.')
		})

		it('says nothing of them when the box has none left out', async () => {
			await open(core.status_failed_update_clean)

			expect(text('.os-plan-failure-title')).toBe('apt could not reach a package source: check the network and the name server of the machine.')
			expect(wrapper.find('.os-plan-failure-conf').exists()).toBe(false)
		})

		it('says them for a solver that failed, and for a package that dpkg left half done, and not for a failure that is none of theirs', async () => {
			await open(core.status_failed_solver)
			expect(text('.os-plan-failure-title')).toBe('apt could not work out the upgrade.')
			expect(texts('.os-plan-failure-conf li')).toEqual(left)

			close()
			await open(core.status_failed_half_configured)
			expect(text('.os-plan-failure-title')).toBe('A package on this machine is half installed or half configured, so there is no plan until it is mended. Run dpkg --configure -a in a console, then make the plan again.')
			expect(texts('.os-plan-failure-conf li')).toEqual(left)

			close()
			await open(core.status_failed_half_configured_clean)
			expect(wrapper.find('.os-plan-failure-conf').exists()).toBe(false)

			close()
			await open(failed(error('timeout', { data: { apt_conf_left_out: [{ file: 'a.conf', reason: 'not_simple' }] } })))
			expect(text('.os-plan-failure-title')).toContain('The plan took too long')
			expect(wrapper.find('.os-plan-failure-conf').exists()).toBe(false)
		})

		it('says a name from the machine as text', async () => {
			const hostile = '<img src=x onerror=alert(1)>'
			await open(failed(error('sandbox_update_failed', { data: { kind: 'network', apt_conf_left_out: [{ file: hostile, reason: 'not_simple' }, { file: 'b.conf', reason: 'from-the-future' }] } })))

			expect(texts('.os-plan-failure-conf li')).toEqual([`${hostile}: It is not made of simple settings, one to a line.`, 'b.conf: It was left out for a reason this window does not know.'])
			expect(wrapper.find('.os-plan-failure img').exists()).toBe(false)
		})

		it('is gone with the failure, when a new job begins', async () => {
			await open(core.status_failed_update)
			await start(running('sources'))

			expect(wrapper.find('.os-plan-failure').exists()).toBe(false)
			expect(wrapper.find('.os-plan-failure-conf').exists()).toBe(false)
		})
	})

	it('says where a package source that is refused is, and why', async () => {
		await open(failed(error('sources_format', { phase: 'sources', data: { file: 'sources.list.d/x.list', line: 3, reason: 'trusted' } })))

		expect(text('.os-plan-failure-title')).toBe('A package source is not in a form the plan reads.')
		expect(text('.os-plan-place')).toBe('File sources.list.d/x.list, line 3')
		expect(text('.os-plan-reason')).toBe('The line turns off the check of the signatures of its source, and the plan says nothing of such a source.')
		expect(text('.os-plan-failed-step')).toContain('step 1 of 6')
		expect(wrapper.find('.os-plan-said').exists()).toBe(false)
	})

	// the core refuses a source of a host it does not know when it has not read the lists of it: the owner is told what to do
	it('says what to do about a source whose own is not known: the lists first, then the plan again', async () => {
		await open(failed(error('sources_format', { phase: 'sources', data: { file: 'sources.list.d/x.list', line: 1, reason: 'undecided' } })))

		expect(text('.os-plan-reason')).toBe('The plan could not tell whether this source is the distribution\'s own. Update the package lists first (apt-get update, or the System packages window), then make the plan again.')
	})

	it('says a code it does not know by the code, with the core\'s own words as text', async () => {
		await open(failed(error('from_the_future', { phase: 'from-the-future', detail: 'the core\'s <b>words</b>' })))

		expect(text('.os-plan-failure-title')).toBe('The plan could not be made (from_the_future).')
		expect(wrapper.find('.os-plan-failed-step').exists()).toBe(false)
		// they are the core's words, not apt's
		expect(text('.os-plan-said summary')).toBe('What ReCasaOS said, as the machine reported it')
		expect(texts('.os-plan-said-lines li')).toEqual(['the core\'s <b>words</b>'])
		expect(wrapper.find('.os-plan-failure b').exists()).toBe(false)
	})

	it('says a failure that is nothing at all as a plan that could not be made', async () => {
		await open({ plannable: true, state: 'failed' })

		expect(text('.os-plan-failure-title')).toBe('The plan could not be made.')
	})

	it('says a job that is done with no plan to read as a failure, and never as a plan', async () => {
		await open({ plannable: true, state: 'done', plan: 'plan' })

		expect(wrapper.find('.os-plan-report').exists()).toBe(false)
		expect(text('.os-plan-failure-title')).toBe('The plan could not be made.')
	})

	// a failed job stays in the core until the next one: a window that opens on it says whose day it is of
	it('says when the plan stopped, for a failure that was there when the window opened', async () => {
		await open(failed(error('timeout')))

		expect(text('.os-plan-failed-on')).toMatch(/^The plan stopped on .*Oct 12, 2026.*\.$/)
	})

	it('says no time of a failure that has none', async () => {
		await open({ plannable: true, state: 'failed', error: error('timeout') })

		expect(wrapper.find('.os-plan-failed-on').exists()).toBe(false)
	})

	it('announces a failure where a screen reader says it, as it does a step', async () => {
		await open()
		await start()
		getOsPlan.mockReturnValueOnce(answer(failed(error('timeout'))))
		await tick(1000)

		expect(text('[role="status"] .os-plan-failure-title')).toBe('The plan took too long and was stopped. Nothing was changed on the machine. Try again.')
	})

	// what the core and the files say is text in the title and the place of a failure too, whatever the code
	describe('with what the machine says in it', () => {
		const hostile = '<img src=x onerror=alert(1)>'

		it.each([
			['a file of a mixed package source', 'sources_mixed_file', { file: hostile }, `A file of package sources mixes the distribution's own lines with others: ${hostile}. Split it in two, then try again.`, null],
			['a file of a package source that is not read', 'sources_format', { file: hostile, line: 2, reason: 'type' }, 'A package source is not in a form the plan reads.', `File ${hostile}, line 2`],
			['a place in a source that is a disc', 'sources_cdrom', { file: `${hostile}.list`, line: 1 }, 'A package source is a disc or a local folder, which cannot be upgraded from.', `File ${hostile}.list, line 1`],
			['a folder with no room', 'no_room', { path: hostile, need: 671088640, free: 0 }, `There is not enough room in ${hostile} for the plan's temporary folder: 640 MiB needed, 0 MiB free. Free some space, then try again.`, null],
			['a code it does not know', hostile, {}, `The plan could not be made (${hostile}).`, null],
		])('is text in %s', async (_, code, data, title, place) => {
			await open(failed(error(code, { phase: 'sources', data })))

			expect(text('.os-plan-failure-title')).toBe(title)
			if (place)
				expect(text('.os-plan-place')).toBe(place)
			const box = wrapper.find('.os-plan-failure')
			expect(box.find('img').exists()).toBe(false)
			expect(box.find('[onerror]').exists()).toBe(false)
			// the text is there, as text
			expect(box.text()).toContain(hostile)
			expect(box.html()).not.toContain('<img')
		})
	})
})

describe('when the request is refused or fails', () => {
	it.each([
		['not_root', {}, 'ReCasaOS does not run as root on this machine, so it cannot plan the upgrade.'],
		['hop_not_planned', { hop: 'debian-12-13' }, 'ReCasaOS cannot plan the upgrade from this release yet.'],
		['identity_unsupported', { state: 'latest' }, 'This machine is not one that a plan can be made for: it is not a release that ReCasaOS knows how to upgrade, or it has no later one.'],
		['busy', {}, 'Another package manager is at work on this machine. Wait for it to end, then try again.'],
		['no_room', { path: '/var/tmp', need: 671088640, free: 104857600 }, 'There is not enough room in /var/tmp for the plan\'s temporary folder: 640 MiB needed, 100 MiB free. Free some space, then try again.'],
	])('says a 409 %s by its code, starts no job, and lets the owner ask again', async (code, data, sentence) => {
		await open()
		startOsPlan.mockImplementationOnce(failure(refused(code, data)))
		await wrapper.find('.os-plan-start').trigger('click')
		await tick()

		expect(text('.os-plan-failure-title')).toBe(sentence)
		// in the announcing place, where a screen reader says it
		expect(text('[role="status"] .os-plan-failure-title')).toBe(sentence)
		expect(wrapper.find('.os-plan-step').exists()).toBe(false)
		await tick(5000)
		expect(getOsPlan).toHaveBeenCalledTimes(1)

		await start(running())
		expect(startOsPlan).toHaveBeenCalledTimes(2)
		expect(wrapper.find('.os-plan-failure').exists()).toBe(false)
		expect(wrapper.find('.os-plan-step').exists()).toBe(true)
	})

	it.each([
		['a core that has no such route', { response: { status: 404 } }, 'This version of ReCasaOS cannot make this plan yet. Update ReCasaOS, then try again.'],
		['a call that took too long', { code: 'ECONNABORTED' }, 'The request took too long. Try again.'],
		['a server error', { response: { status: 500 } }, 'The request could not be completed. Try again.'],
		['no network', {}, 'The request could not be completed. Try again.'],
	])('says %s in the announcing place, and asks the core once whether a job began all the same', async (_, error, sentence) => {
		await open()
		startOsPlan.mockImplementationOnce(failure(error))
		getOsPlan.mockReturnValueOnce(answer(IDLE))
		await wrapper.find('.os-plan-start').trigger('click')
		await tick()

		expect(text('[role="status"] .os-plan-call-failure')).toBe(sentence)
		expect(getOsPlan).toHaveBeenCalledTimes(2)
		expect(wrapper.find('.os-plan-start').classes()).not.toContain('is-loading')
	})

	it('follows the job that a lost answer began', async () => {
		await open()
		startOsPlan.mockImplementationOnce(failure({ code: 'ECONNABORTED' }))
		getOsPlan.mockReturnValueOnce(answer(running('upgrade')))
		await wrapper.find('.os-plan-start').trigger('click')
		await tick()

		expect(wrapper.find('.os-plan-call-failure').exists()).toBe(false)
		expect(text('.os-plan-step')).toBe('Step 3 of 6: Planning the first, minimal upgrade')
	})

	it('says an answer to the request that it cannot read as a request that failed', async () => {
		await open()
		startOsPlan.mockReturnValueOnce(answer({ state: 'from-the-future' }))
		getOsPlan.mockReturnValueOnce(answer(IDLE))
		await wrapper.find('.os-plan-start').trigger('click')
		await tick()

		expect(text('.os-plan-call-failure')).toBe('The request could not be completed. Try again.')
	})

	it('takes the failure away when the next request goes out', async () => {
		await open()
		startOsPlan.mockImplementationOnce(failure({ response: { status: 500 } }))
		getOsPlan.mockReturnValueOnce(answer(IDLE))
		await wrapper.find('.os-plan-start').trigger('click')
		await tick()
		expect(wrapper.find('.os-plan-call-failure').exists()).toBe(true)

		await start(running())
		expect(wrapper.find('.os-plan-call-failure').exists()).toBe(false)
	})
})

describe('while it waits, and when the window closes', () => {
	it('goes on asking after an error, says it is waiting for the machine after three, and says nothing of it when it answers', async () => {
		await open()
		await start()

		for (let miss = 1; miss <= 4; miss++) {
			getOsPlan.mockImplementationOnce(failure({ code: 'ERR_NETWORK' }))
			await tick(1000)
			expect(wrapper.find('.os-plan-lost').exists(), `after ${miss} misses`).toBe(miss >= 3)
		}
		expect(text('.os-plan-lost')).toBe('The machine has not answered for a few seconds. This window keeps asking.')
		// the step it was at stays on the screen
		expect(text('.os-plan-step')).toBe('Step 1 of 6: Reading and rewriting the package sources')

		getOsPlan.mockReturnValueOnce(answer(running('update')))
		await tick(1000)
		expect(wrapper.find('.os-plan-lost').exists()).toBe(false)
		expect(text('.os-plan-step')).toContain('Step 2 of 6')
		getOsPlan.mockReturnValueOnce(answer(done()))
		await tick(1000)
		expect(wrapper.find('.os-plan-report').exists()).toBe(true)
	})

	it('counts an answer it cannot read as one that did not come', async () => {
		await open()
		await start()

		for (const bad of [undefined, 'running', { state: 'from-the-future' }]) {
			getOsPlan.mockReturnValueOnce(answer(bad))
			await tick(1000)
		}
		expect(wrapper.find('.os-plan-lost').exists()).toBe(true)
		expect(wrapper.find('.os-plan-step').exists()).toBe(true)
	})

	it('asks nothing more once the window has closed, and tells nobody of an answer that comes after', async () => {
		await open()
		await start()
		const late = deferred()
		getOsPlan.mockReturnValueOnce(late.promise)
		await tick(1000)
		const asks = getOsPlan.mock.calls.length
		const vm = wrapper.vm
		close()

		late.resolve({ data: { data: done() } })
		await tick(10000)
		expect(getOsPlan).toHaveBeenCalledTimes(asks)
		expect(vm.status.state).toBe('running')
	})

	it('asks nothing more when the window closes between two asks', async () => {
		await open()
		await start()
		close()

		await tick(10000)
		expect(getOsPlan).toHaveBeenCalledTimes(1)
	})

	it('has nobody to tell when the window closed before the first answer', async () => {
		const first = deferred()
		getOsPlan.mockReturnValueOnce(first.promise)
		wrapper = mount(OsUpgradePlan, { props: { locale: 'en_us' }, global: { plugins: [Buefy, i18n], mocks: { $api: { sys: { getOsPlan, startOsPlan, getOsRunbook } } } } })
		const vm = wrapper.vm
		close()
		first.resolve({ data: { data: running() } })
		await tick(5000)

		expect(vm.status).toBe(null)
		expect(getOsPlan).toHaveBeenCalledTimes(1)
	})

	it('has nobody to tell when the window closed before the answer to the request', async () => {
		await open()
		const late = deferred()
		startOsPlan.mockReturnValueOnce(late.promise)
		await wrapper.find('.os-plan-start').trigger('click')
		const vm = wrapper.vm
		close()

		late.resolve({ data: { data: running() } })
		await tick(5000)
		expect(vm.status.state).toBe('idle')
		expect(getOsPlan).toHaveBeenCalledTimes(1)
	})
})

describe('the plan that is shown', () => {
	it('says the findings first, then the sources, the packages and the disk', async () => {
		await opened()

		expect(wrapper.findAll('.os-plan-group').map(group => group.classes().find(name => name.startsWith('is-')))).toEqual(['is-findings', 'is-sources', 'is-packages', 'is-disk'])
		expect(wrapper.find('.os-plan-report article.message').classes()).toContain('is-warning')
	})

	it.each([
		['ok', [], 'is-success', 'The plan found nothing in the way.'],
		['needs_acceptance', [{ code: 'removal_manual', severity: 'needs_acceptance', data: { name: 'fuse', version: '1' } }], 'is-warning', 'The plan found things you would have to accept first.'],
		['blocked', [{ code: 'disk_short', severity: 'blocked', data: { path: '/usr', need: 1523741824, free: 1073741824 } }], 'is-danger', 'The plan found something that blocks the upgrade.'],
		// never better than what the plan found
		['ok', [{ code: 'disk_short', severity: 'blocked', data: {} }], 'is-danger', 'The plan found something that blocks the upgrade.'],
		['from-the-future', [], 'is-danger', 'The plan found something that blocks the upgrade.'],
	])('says the verdict %s with %j as %s', async (verdict, problems, tone, sentence) => {
		await opened(planWith({ verdict, problems, removals: [] }))

		expect(wrapper.find('.os-plan-report article.message').classes()).toContain(tone)
		expect(text('.os-plan-result')).toBe(sentence)
	})

	it('says each finding by its weight and its code, with its data', async () => {
		await opened(planWith({
			verdict: 'blocked',
			problems: [
				{ code: 'docker_held', severity: 'info', data: { names: ['docker-ce'] } },
				{ code: 'removal_manual', severity: 'needs_acceptance', data: { name: 'fuse', version: '2.9.9-5' } },
				{ code: 'removal_protected', severity: 'blocked', data: { name: 'sudo', pattern: 'sudo' } },
				{ code: 'from_the_future', severity: 'blocked', data: { names: ['x'], why: 'because' } },
			],
		}))

		const items = wrapper.findAll('.os-plan-item')
		expect(items.map(item => item.find('.os-plan-item-badge').text())).toEqual(['Blocks the upgrade', 'Blocks the upgrade', 'Needs your acceptance', 'For information'])
		expect(items.map(item => item.classes().find(name => name.startsWith('is-')))).toEqual(['is-blocked', 'is-blocked', 'is-needs_acceptance', 'is-info'])
		expect(items.map(item => item.find('i.mdi').classes().filter(name => name !== 'mdi' && !name.startsWith('mdi-2')))).toEqual([['mdi-alert-circle-outline'], ['mdi-alert-circle-outline'], ['mdi-alert-outline'], ['mdi-information-outline']])
		expect(items[0].find('.os-plan-item-sentence').text()).toBe('The upgrade would remove sudo, which ReCasaOS protects (it matches sudo). This blocks the upgrade.')
		expect(items[1].find('.os-plan-item-sentence').text()).toBe('Something this window does not know about the plan: from_the_future.')
		expect(items[1].find('.os-plan-item-details').text()).toBe('Names: x · Reason: because')
		expect(items[2].find('.os-plan-item-sentence').text()).toContain('fuse (2.9.9-5)')
		expect(items[3].find('.os-plan-item-sentence').text()).toBe('Docker\'s packages are on hold (docker-ce). That is expected: the upgrade leaves them alone, and Docker\'s package source is put aside while it runs.')
	})

	it('has no findings section when there are none', async () => {
		await opened(planWith({ verdict: 'ok', problems: [] }))

		expect(wrapper.find('.os-plan-group.is-findings').exists()).toBe(false)
	})

	it('says each file of the sources line by line, before and after, with why, and Docker\'s as put aside', async () => {
		await opened()

		expect(texts('.os-plan-file > summary')).toEqual(['sources.list: Rewritten for the next release', 'docker.list: Put aside for the upgrade'])
		const lines = wrapper.findAll('.os-plan-file')[0].findAll('.os-plan-line')
		expect(lines).toHaveLength(6)
		expect(lines[2].find('.os-plan-lineno').text()).toBe('Line 3')
		expect(lines[2].find('.os-plan-before').text()).toBe('deb http://archive.debian.org/debian-security bullseye-security main')
		expect(lines[2].find('.os-plan-after').text()).toBe('deb http://deb.debian.org/debian-security bookworm-security main')
		expect(lines[2].find('.os-plan-why').text()).toBe('(release name, address)')
		const docker = wrapper.findAll('.os-plan-file')[1].findAll('.os-plan-line')
		expect(docker).toHaveLength(1)
		expect(docker[0].find('.os-plan-before').text()).toContain('download.docker.com')
		expect(docker[0].find('.os-plan-after').exists()).toBe(false)
		expect(docker[0].find('.os-plan-why').text()).toBe('(put aside)')
		// no promise the runbook does not keep: it puts the source back only when Docker publishes the new release
		expect(text('.os-plan-docker')).toBe('Docker\'s package source (docker.list) is put aside while the upgrade runs. It is put back afterwards if Docker has published the new release; otherwise it stays aside until you put it back.')
		expect(wrapper.find('.os-plan-others').exists()).toBe(false)
		expect(wrapper.find('.os-plan-dropped').exists()).toBe(false)
		expect(wrapper.find('.os-plan-firmware').exists()).toBe(false)
	})

	it('names the other sources that are put aside, the lines left out and the firmware component', async () => {
		await opened(planWith({
			paused: [{ file: 'docker.list', hosts: ['https://download.docker.com'], docker: true }, { file: 'tailscale.list', hosts: ['https://pkgs.tailscale.com'], docker: false }, { file: 'sources.list', line: 7, hosts: ['http://x.example'], docker: false }],
			sources: { ...real.sources, dropped_backports: 2, firmware_added: 3 },
		}))

		expect(text('.os-plan-others')).toBe('Other sources, put aside for the upgrade and left aside afterwards: tailscale.list, sources.list:7.')
		expect(text('.os-plan-dropped')).toBe('Lines of backports or proposed updates left out: 2')
		expect(text('.os-plan-firmware')).toBe('Lines that get the firmware component non-free-firmware: 3')
	})

	it('counts the packages of the full upgrade and of the first one, and lists the removals with their badges', async () => {
		await opened(planWith({ removals: [{ name: 'fuse', version: '2.9.9-5', manual: true, protected: false, essential: false }, { name: 'sudo', version: '1.9', manual: true, protected: true, essential: true }, { name: 'dpkg', version: '1', manual: false, protected: false, essential: false }] }))

		expect(texts('.os-plan-counts thead th')).toEqual(['', 'Full upgrade', 'First, minimal upgrade'])
		expect(wrapper.findAll('.os-plan-counts tbody tr').map(cells)).toEqual([
			['Upgraded', '384', '274'],
			['Newly installed', '75', '0'],
			['Removed', '2', '0'],
			['Kept back', '0', '111'],
		])
		const rows = wrapper.findAll('.os-plan-removal')
		expect(rows.map(row => row.findAll('td').slice(0, 2).map(cell => cell.text()))).toEqual([['fuse', '2.9.9-5'], ['sudo', '1.9'], ['dpkg', '1']])
		expect(rows.map(row => row.findAll('.os-plan-badge').map(badge => badge.text()))).toEqual([['Installed by hand'], ['Installed by hand', 'Protected', 'Essential'], []])
		expect(rows[1].findAll('.os-plan-badge').map(badge => badge.classes().find(name => ['is-manual', 'is-protected', 'is-essential'].includes(name)))).toEqual(['is-manual', 'is-protected', 'is-essential'])
	})

	it('says no package would be removed when none would', async () => {
		await opened(planWith({ removals: [], verdict: 'ok', problems: [] }))

		expect(text('.os-plan-no-removals')).toBe('No package would be removed.')
		expect(wrapper.find('.os-plan-removals').exists()).toBe(false)
	})

	it('lists the new packages, the ones kept back and the ones no longer needed, folded away, and says when a list is cut', async () => {
		await opened(planWith({ kept_back: ['libc6', 'tzdata'], new_truncated: true, autoremovable_truncated: true }))

		expect(texts('.os-plan-names > summary')).toEqual(['New packages (75)', 'Kept back after the full upgrade (2)', 'No longer needed afterwards (18)'])
		const names = wrapper.findAll('.os-plan-names')
		expect(names[0].find('.os-plan-names-list').text()).toMatch(/^cron-daemon-common, dbus-bin, /)
		expect(names[0].text()).toContain('The list is cut: there are more.')
		expect(names[1].find('.os-plan-names-list').text()).toBe('libc6, tzdata')
		expect(names[1].text()).not.toContain('The list is cut')
		expect(names[2].text()).toContain('apt lists them and does not remove them: that is yours to decide afterwards.')
	})

	// each of the three lists says it is cut when the core says so, and a file of sources says how many lines it does not list
	it('says that each list of names is cut, and how many lines of a file are not listed', async () => {
		const lines = Array.from({ length: 150 }, (_, index) => ({ n: index + 1, before: 'a', after: 'b', why: 'suite' }))
		await opened(planWith({
			kept_back: ['libc6'],
			kept_back_truncated: true,
			new_truncated: true,
			autoremovable_truncated: true,
			sources: { ...real.sources, files: [{ file: 'big.list', action: 'rewritten', lines }] },
		}))

		const names = wrapper.findAll('.os-plan-names')
		expect(names).toHaveLength(3)
		for (const list of names)
			expect(list.text()).toContain('The list is cut: there are more.')
		expect(wrapper.findAll('.os-plan-line')).toHaveLength(60)
		expect(text('.os-plan-more')).toBe('And 90 more lines.')

		close()
		await opened(planWith({ kept_back: ['libc6'], sources: { ...real.sources, files: [{ file: 'small.list', action: 'rewritten', lines: lines.slice(0, 60) }] } }))
		expect(wrapper.findAll('.os-plan-names')[1].text()).not.toContain('The list is cut')
		expect(wrapper.find('.os-plan-more').exists()).toBe(false)
	})

	it('says the download and the extra space in the units of the language, and the room by folder, red where it is short', async () => {
		await opened()

		expect(text('.os-plan-download')).toBe('Download: 133 MiB')
		expect(text('.os-plan-extra')).toBe('Disk space the upgrade would use: 286 MiB')
		expect(wrapper.findAll('.os-plan-disk tbody tr').map(cells)).toEqual([['/var/cache/apt/archives', '659 MiB', '8 GiB'], ['/usr', '1.5 GiB', '8 GiB'], ['/', '512 MiB', '20 GiB']])
		expect(wrapper.find('.os-plan-disk-row.is-short').exists()).toBe(false)
		expect(wrapper.find('.os-plan-short').exists()).toBe(false)
	})

	it('says a room that is short in words as well as in colour, and a room that was not read', async () => {
		await opened(planWith({
			verdict: 'blocked',
			problems: [{ code: 'disk_short', severity: 'blocked', data: { path: '/usr', need: 1523741824, free: 1073741824 } }],
			disk: [
				{ path: '/var/cache/apt/archives', need: 690870912, free: 8589934592, ok: true },
				{ path: '/usr', need: 1523741824, free: 1073741824, ok: false },
				{ path: '/', need: 536870912, free: 0, ok: false, unknown: true },
			],
		}))

		const rows = wrapper.findAll('.os-plan-disk-row')
		expect(rows.map(row => row.classes().includes('is-short'))).toEqual([false, true, true])
		expect(cells(rows[1])).toEqual(['/usr', '1.5 GiB', '1 GiB (Not enough)'])
		expect(cells(rows[2])).toEqual(['/', '512 MiB', 'Could not be read (Not enough)'])
	})

	it('says what the upgrade frees as what it frees, and says that the disk is not checked when apt did not say what it takes', async () => {
		await opened(planWith({ estimates: { known: true, download_bytes: 1048576, extra_bytes: -52428800 } }))
		expect(text('.os-plan-extra')).toBe('Disk space the upgrade would free: 50 MiB')

		await opened(planWith({ estimates: { known: false }, disk: [] }))
		expect(text('.os-plan-estimates-unknown')).toBe('apt did not say how much it would download, so the disk space is not checked.')
		expect(wrapper.find('.os-plan-download').exists()).toBe(false)
		expect(wrapper.find('.os-plan-disk').exists()).toBe(false)
	})

	it('says the files of apt\'s own configuration that were left out, each with why, small, and nothing when none was', async () => {
		await opened()
		expect(text('.os-plan-conf > p')).toBe('These files of apt\'s own configuration were not used for this plan, which reads only plain settings of the network and of recommended packages. If a proxy was set in one of them, the plan could not use it.')
		expect(texts('.os-plan-conf-files li')).toEqual(['15update-stamp: It is not made of simple settings, one to a line.'])

		close()
		await opened(planWith({ apt_conf_left_out: [{ file: 'a.conf', reason: 'proxy_auto_detect' }, { file: 'b.conf', reason: 'too_large' }, { file: 'c.conf', reason: 'from-the-future' }] }))
		expect(texts('.os-plan-conf-files li')).toEqual([
			'a.conf: It sets a script that finds the proxy, which the plan does not run.',
			'b.conf: It is too large.',
			'c.conf: It was left out for a reason this window does not know.',
		])

		close()
		await opened(planWith({ apt_conf_left_out: [] }))
		expect(wrapper.find('.os-plan-conf').exists()).toBe(false)
	})

	it('says that the list of files left out is cut when the core cut it at 200, and only then', async () => {
		await opened(core.conf_many)
		expect(wrapper.findAll('.os-plan-conf-files li')).toHaveLength(200)
		expect(text('.os-plan-conf-cut')).toBe('The list is cut: there are more.')

		close()
		await opened()
		expect(wrapper.find('.os-plan-conf-cut').exists()).toBe(false)
	})

	// what the core makes of a box with a file of apt's configuration for each of the six reasons
	it('says the files of apt\'s configuration of the core\'s own answer, each by the reason the core gave', async () => {
		await opened(core.conf_reasons)

		expect(texts('.os-plan-conf-files li')).toEqual([
			'01autoremove: It is not made of simple settings, one to a line.',
			'15update-stamp: It is not made of simple settings, one to a line.',
			'20auto-upgrades: It sets something other than the network or the recommended packages.',
			'80link: It is not a regular file.',
			'96osp:gpgv: It sets something other than the network or the recommended packages.',
			'97big: It is too large.',
			'98osp-canary-detect: It sets a script that finds the proxy, which the plan does not run.',
			'98osp-canary-incl: It has a directive of apt\'s configuration language, such as #include or #clear.',
		])
		expect(wrapper.text()).not.toContain('a reason this window does not know')
	})

	// apt ended the estimate for lack of room after it said the sizes: the sizes are true, and the room that was read is short
	it('says a plan whose estimate apt ended for lack of room, with the sizes and the room that were read', async () => {
		await opened(core.lowroom)

		expect(text('.os-plan-result')).toBe('The plan found something that blocks the upgrade.')
		expect(text('.os-plan-item-sentence')).toBe('There is not enough room on /usr: 1.5 GiB needed, 1 GiB free. This blocks the upgrade.')
		expect(text('.os-plan-download')).toBe('Download: 133 MiB')
		expect(text('.os-plan-extra')).toBe('Disk space the upgrade would use: 286 MiB')
		expect(wrapper.find('.os-plan-estimates-unknown').exists()).toBe(false)
		const rows = wrapper.findAll('.os-plan-disk-row')
		expect(rows.map(row => row.classes().includes('is-short'))).toEqual([false, true, false])
		expect(cells(rows[1])).toEqual(['/usr', '1.5 GiB', '1 GiB (Not enough)'])
		expect(wrapper.find('.os-plan-runbook').exists()).toBe(false)
	})

	// the minimal upgrade keeps a package back and the full one lists it nowhere: the sentence names it, and does not say that apt keeps it back
	it('says a package that the full upgrade leaves behind and counts nowhere, as one that would stay as it is', async () => {
		await opened(core.silent)

		expect(text('.os-plan-result')).toBe('The plan found something that blocks the upgrade.')
		expect(text('.os-plan-item-sentence')).toBe('After the full upgrade, these packages would still stay at the version they have now: osp-k. apt does not always count such packages as kept back. The upgrade would not be complete with them, so it is blocked.')
		expect(wrapper.text()).not.toContain('still keeps')
		expect(wrapper.find('.os-plan-names.is-kept-back').exists()).toBe(false)
		expect(text('.os-plan-estimates-unknown')).toBe('apt did not say how much it would download, so the disk space is not checked.')
	})
})

// What the core says now, as its own code says it (see osPlan.spec.js: core.* are dumped from the core by throwaway Go tests).
describe('a machine that could not be asked, a plan that is blocked, and a folder that could not be removed', () => {
	const unknownSentence = 'The machine could not be asked whether the upgrade can be planned. That does not mean it cannot: try again in a moment.'
	const folder = '/var/tmp/casaos-os-plan.Qm4x7K'
	const leftSentence = `A temporary folder that the plan made could not be removed: ${folder}. It holds only the package lists and settings that the plan made, and can take up some 200 MiB. ReCasaOS removes it when it next starts, if it is more than ten minutes old. You can also delete it yourself.`

	it('says that the machine could not be asked, offers no plan to make, and asks again when told to', async () => {
		await open(core.status_unknown)

		// not "this upgrade is not offered": the section is there, and says what happened, in the place that is announced
		expect(wrapper.find('.os-plan').exists()).toBe(true)
		expect(text('.os-plan-unknown p')).toBe(unknownSentence)
		expect(wrapper.find('[role="status"] .os-plan-unknown').exists()).toBe(true)
		expect(wrapper.find('.os-plan-start').exists()).toBe(false)
		expect(buttons()).toEqual(['Try again'])

		getOsPlan.mockReturnValueOnce(answer(IDLE))
		await wrapper.find('.os-plan-ask-again').trigger('click')
		await tick()

		expect(getOsPlan).toHaveBeenCalledTimes(2)
		expect(wrapper.find('.os-plan-unknown').exists()).toBe(false)
		expect(buttons()).toEqual(['See what the upgrade would do'])
	})

	it('asks one request at a time, says it still when the answer is unknown again or does not come, and does not ask by itself', async () => {
		await open(core.status_unknown)
		const out = deferred()
		getOsPlan.mockReturnValueOnce(out.promise)
		await wrapper.find('.os-plan-ask-again').trigger('click')
		await wrapper.find('.os-plan-ask-again').trigger('click')
		expect(getOsPlan).toHaveBeenCalledTimes(2)

		out.resolve({ data: { data: core.status_unknown } })
		await tick()
		expect(text('.os-plan-unknown p')).toBe(unknownSentence)

		getOsPlan.mockImplementationOnce(failure({ code: 'ECONNABORTED' }))
		await wrapper.find('.os-plan-ask-again').trigger('click')
		await tick()
		expect(text('.os-plan-unknown p')).toBe(unknownSentence)
		await tick(10000)
		expect(getOsPlan).toHaveBeenCalledTimes(3)
	})

	it('is a machine that cannot be planned, and says nothing of it, when the core says so on the next ask', async () => {
		await open(core.status_unknown)
		getOsPlan.mockReturnValueOnce(answer({ plannable: false, reason: 'not_root', state: 'idle' }))
		await wrapper.find('.os-plan-ask-again').trigger('click')
		await tick()

		expect(wrapper.find('.os-plan').exists()).toBe(false)
	})

	it('is not shown for a system that is the latest, even when the machine could not be asked', async () => {
		await open(core.status_unknown, { props: { locale: 'en_us', readinessState: 'latest' } })

		expect(wrapper.find('.os-plan').exists()).toBe(false)
	})

	it('tells the owner that a folder could not be removed, after a job that failed and after a plan that is done, and not otherwise', async () => {
		await open(core.status_failed_left_behind)
		expect(text('.os-plan-left-behind')).toBe(leftSentence)
		expect(wrapper.find('[role="status"] .os-plan-left-behind').exists()).toBe(true)
		expect(text('.os-plan-failure-title')).toBe('The plan took too long and was stopped. Nothing was changed on the machine. Try again.')

		close()
		await open(core.status_done_left_behind)
		expect(text('.os-plan-left-behind')).toBe(leftSentence)
		expect(text('.os-plan-result')).toBe('The plan found something that blocks the upgrade.')

		close()
		await open(done())
		expect(wrapper.find('.os-plan-left-behind').exists()).toBe(false)
	})

	it('stops saying it when a new job takes the place of the one that left it', async () => {
		await open(core.status_failed_left_behind)
		await start(running())

		expect(wrapper.find('.os-plan-left-behind').exists()).toBe(false)
	})

	it('says the folder as text, whatever its name', async () => {
		await open({ ...core.status_failed_left_behind, sandbox_left_behind: '<img src=x onerror=alert(1)>' })

		expect(text('.os-plan-left-behind')).toContain('removed: <img src=x onerror=alert(1)>. It holds')
		expect(wrapper.find('.os-plan-left-behind img').exists()).toBe(false)
	})

	it('says a plan that would downgrade a package as blocked, names it, has no runbook, and says the room that was not read', async () => {
		await opened(core.downgrade)

		expect(text('.os-plan-result')).toBe('The plan found something that blocks the upgrade.')
		expect(wrapper.find('.os-plan-report article.message').classes()).toContain('is-danger')
		const items = wrapper.findAll('.os-plan-item')
		expect(items.map(item => item.find('.os-plan-item-badge').text())).toEqual(['Blocks the upgrade', 'Blocks the upgrade'])
		expect(items[0].find('.os-plan-item-sentence').text()).toBe('The upgrade would downgrade these packages, that is install older versions than the ones on this machine: docker-ce. The upgrade does not do that by itself. This blocks the upgrade.')
		expect(cells(wrapper.findAll('.os-plan-disk-row')[2])).toEqual(['/', '512 MiB', 'Could not be read (Not enough)'])
		expect(wrapper.find('.os-plan-no-runbook').exists()).toBe(true)
		expect(wrapper.find('.os-plan-runbook').exists()).toBe(false)
	})

	it('says a downgrade as blocking whatever the core weighed it and said of the verdict', async () => {
		await opened({ ...core.downgrade, verdict: 'ok', disk: [], problems: [{ ...core.downgrade.problems[0], severity: 'info' }] })

		expect(text('.os-plan-result')).toBe('The plan found something that blocks the upgrade.')
		expect(wrapper.find('.os-plan-report article.message').classes()).toContain('is-danger')
		expect(wrapper.find('.os-plan-runbook').exists()).toBe(false)
	})

	it('says the packages that apt keeps back and does not name, as a count, and that the disk is not checked', async () => {
		await opened(core.unlisted)

		expect(text('.os-plan-result')).toBe('The plan found something that blocks the upgrade.')
		expect(texts('.os-plan-item-sentence')).toEqual(['After the full upgrade, some packages would still stay at the version they have now, and apt counts them without naming them (how many: 1). A package on hold for which the next release has only an older version than the installed one is counted this way. The upgrade would not be complete with them, so it is blocked.'])
		expect(wrapper.findAll('.os-plan-counts tbody tr').map(cells).find(row => row[0] === 'Kept back')).toEqual(['Kept back', '1', '1'])
		expect(wrapper.find('.os-plan-names.is-kept-back').exists()).toBe(false)
		expect(text('.os-plan-estimates-unknown')).toBe('apt did not say how much it would download, so the disk space is not checked.')
		expect(wrapper.find('.os-plan-download').exists()).toBe(false)
		expect(wrapper.find('.os-plan-disk').exists()).toBe(false)
	})

	it('says the same note for a disk that the core says was not checked, for a reason this window does not know, and nothing for a plan that was', async () => {
		await opened(planWith({ disk_note: 'from-the-future' }))
		expect(text('.os-plan-estimates-unknown')).toBe('The disk space was not checked, for a reason this window does not know.')
		expect(text('.os-plan-download')).toBe('Download: 133 MiB')

		close()
		await opened()
		expect(wrapper.find('.os-plan-estimates-unknown').exists()).toBe(false)
	})

	it('says a machine that could not be asked, when the request to start is refused for it', async () => {
		await open()
		startOsPlan.mockImplementationOnce(failure(refused('identity_unsupported', { state: 'blocked', unknown: true })))
		await wrapper.find('.os-plan-start').trigger('click')
		await tick()

		expect(text('.os-plan-failure-title')).toBe('The machine could not be asked just now whether a plan can be made for it, so no plan was made. Try again in a moment.')
	})
})

describe('the same, in French', () => {
	beforeEach(() => {
		i18n.global.locale = 'fr_fr'
	})

	it('says a machine that could not be asked, and asks again', async () => {
		await open(core.status_unknown, { props: { locale: 'fr_fr' } })

		expect(text('.os-plan-unknown p')).toBe('On n\'a pas pu demander à la machine si l\'on peut établir le plan de la mise à niveau. Cela ne veut pas dire que c\'est impossible : réessayez dans un instant.')
		expect(buttons()).toEqual(['Réessayer'])
	})

	it('says the folder that could not be removed', async () => {
		await open(core.status_failed_left_behind, { props: { locale: 'fr_fr' } })

		expect(text('.os-plan-left-behind')).toBe('Un dossier temporaire créé par le plan n\'a pas pu être supprimé : /var/tmp/casaos-os-plan.Qm4x7K. Il ne contient que les listes de paquets et les réglages que le plan a produits, et peut occuper quelque 200 Mio. ReCasaOS le supprime à son prochain démarrage, s\'il a plus de dix minutes. Vous pouvez aussi le supprimer vous-même.')
	})

	it('says the way back from a source that is at the next release, with the path of the script left as it is', async () => {
		await open(core.status_failed_sources_target, { props: { locale: 'fr_fr' } })

		const title = text('.os-plan-failure-title')
		expect(title).toContain('/var/backups/casaos-os-upgrade-*/restore-sources.sh')
		expect(title).toMatch(/terminez cette mise à niveau/)
		expect(text('.os-plan-place')).toBe('Fichier sources.list, ligne 1')
	})

	it('says the titles of the nine blocks of the runbook, and keeps the words of the core for a title it does not know', async () => {
		getOsRunbook.mockReturnValueOnce(answer(runbook({ blocks: [...BLOCKS.slice(0, 8), { ...BLOCKS[8], title: 'a title of a later core' }] })))
		await open(done(), { props: { locale: 'fr_fr' } })
		await openRunbook()

		const titles = texts('.os-plan-block')
		expect(titles).toHaveLength(9)
		expect(titles[0]).toContain('Bloc 0 : vérifier que c\'est bien la machine du plan, et qu\'elle est prête')
		expect(titles[5]).toContain('LE POINT DE NON-RETOUR : la mise à niveau minimale, puis les paquets protégés')
		expect(titles[8]).toContain('Bloc 8 : a title of a later core')
	})

	it('has a French sentence for each title that the core sends, and the English one beside it', () => {
		for (const block of BLOCKS) {
			expect(en[block.title], block.title).toBe(block.title)
			expect(fr[block.title], block.title).toBeTruthy()
			expect(fr[block.title], block.title).not.toBe(block.title)
		}
	})

	it('says a box with nothing to do, with its zero sizes', async () => {
		await open(done(core.nothing), { props: { locale: 'fr_fr' } })

		expect(text('.os-plan-download')).toBe('Téléchargement : 0 Mio')
		expect(wrapper.find('.os-plan-estimates-unknown').exists()).toBe(false)
		expect(wrapper.findAll('.os-plan-disk-row').map(cells)).toEqual([['/var/cache/apt/archives', '512 Mio', '8 Gio'], ['/usr', '1 Gio', '8 Gio'], ['/', '512 Mio', '20 Gio']])
	})

	it('says a downgrade, and packages that apt does not name with the disk not checked', async () => {
		await open(done(core.downgrade), { props: { locale: 'fr_fr' } })
		expect(texts('.os-plan-item-sentence')[0]).toBe('La mise à niveau rétrograderait ces paquets, c\'est-à-dire installerait des versions plus anciennes que celles de cette machine : docker-ce. Elle ne le fait pas d\'elle-même. Cela bloque la mise à niveau.')

		close()
		await open(done(core.unlisted), { props: { locale: 'fr_fr' } })
		expect(texts('.os-plan-item-sentence')).toEqual(['Après la mise à niveau complète, des paquets resteraient à la version qu\'ils ont maintenant, et apt les compte sans les nommer (combien : 1). Un paquet retenu (hold) dont la version suivante du système ne propose qu\'une version plus ancienne que celle installée est compté ainsi. La mise à niveau ne serait pas complète avec eux : elle est donc bloquée.'])
		expect(text('.os-plan-estimates-unknown')).toBe('apt n\'a pas dit combien il téléchargerait : l\'espace disque n\'est donc pas vérifié.')
	})
})

// What the core says of a box with nothing to do, of each state its answer can be in, of each way a job ends and of each refusal, as the window
// says it (core.* are the answers of the core's own code: see osPlan.spec.js).
describe('a box with nothing to do', () => {
	it('is a plan that found nothing in the way, with its sizes said as zero, its rows of disk with room, and a runbook to read', async () => {
		await opened(core.nothing)

		expect(text('.os-plan-result')).toBe('The plan found nothing in the way.')
		expect(wrapper.find('.os-plan-group.is-findings').exists()).toBe(false)
		expect(text('.os-plan-download')).toBe('Download: 0 MiB')
		expect(text('.os-plan-extra')).toBe('Disk space the upgrade would use: 0 MiB')
		// sizes that are zero are sizes that were read: the note of a disk that was not checked is not there
		expect(wrapper.find('.os-plan-estimates-unknown').exists()).toBe(false)
		const rows = wrapper.findAll('.os-plan-disk-row')
		expect(rows.map(cells)).toEqual([['/var/cache/apt/archives', '512 MiB', '8 GiB'], ['/usr', '1 GiB', '8 GiB'], ['/', '512 MiB', '20 GiB']])
		expect(rows.map(row => row.classes().includes('is-short'))).toEqual([false, false, false])
		expect(wrapper.find('.os-plan-no-removals').exists()).toBe(true)
		expect(wrapper.findAll('.os-plan-counts tbody tr').map(cells)).toEqual([['Upgraded', '0', '0'], ['Newly installed', '0', '0'], ['Removed', '0', '0'], ['Kept back', '0', '0']])
		expect(wrapper.find('.os-plan-runbook').exists()).toBe(true)
		expect(wrapper.find('.os-plan-no-runbook').exists()).toBe(false)
	})

	it('is a plan that the rows of the disk block when the box is tight, in each of the three places', async () => {
		await opened(core.nothing_tight)

		expect(text('.os-plan-result')).toBe('The plan found something that blocks the upgrade.')
		expect(texts('.os-plan-item-sentence')).toEqual([
			'There is not enough room on /var/cache/apt/archives: 512 MiB needed, 400 MiB free. This blocks the upgrade.',
			'There is not enough room on /usr: 1 GiB needed, 900 MiB free. This blocks the upgrade.',
			'There is not enough room on /: 512 MiB needed, 400 MiB free. This blocks the upgrade.',
		])
		const rows = wrapper.findAll('.os-plan-disk-row')
		expect(rows.map(row => row.classes().includes('is-short'))).toEqual([true, true, true])
		expect(rows.map(cells)).toEqual([['/var/cache/apt/archives', '512 MiB', '400 MiB (Not enough)'], ['/usr', '1 GiB', '900 MiB (Not enough)'], ['/', '512 MiB', '400 MiB (Not enough)']])
		expect(text('.os-plan-download')).toBe('Download: 0 MiB')
		expect(wrapper.find('.os-plan-runbook').exists()).toBe(false)
	})

	it('lists the one package that is no longer needed, and says it is for the owner to decide', async () => {
		await opened(core.nothing_one_unneeded)

		expect(text('.os-plan-result')).toBe('The plan found nothing in the way.')
		expect(text('.os-plan-names.is-unneeded summary')).toBe('No longer needed afterwards (1)')
		expect(text('.os-plan-names.is-unneeded .os-plan-names-list')).toBe('osp-b')
	})
})

describe('each answer that the core gives to GET plan, in the window', () => {
	it('offers the plan to a machine that is idle, and nothing to one that a plan cannot be made for', async () => {
		await open(core.status_idle)
		expect(buttons()).toEqual(['See what the upgrade would do'])
		expect(wrapper.find('[role="status"]').text()).toBe('')

		for (const name of ['status_not_root', 'status_hop_not_planned', 'status_identity_unsupported']) {
			close()
			await open(core[name])
			expect(wrapper.find('.os-plan').exists(), name).toBe(false)
		}
	})

	it('follows a job that runs, at the step the core says it is at, and asks again until it ends', async () => {
		await open(core.status_running)

		expect(text('.os-plan-step')).toBe('Step 2 of 6: Fetching the package lists of the next release')
		getOsPlan.mockReturnValueOnce(answer(core.status_done))
		await tick(1000)
		expect(getOsPlan).toHaveBeenCalledTimes(2)
		expect(text('.os-plan-result')).toBe('The plan found things you would have to accept first.')
		expect(wrapper.find('.os-plan-step').exists()).toBe(false)
	})

	it('says a plan that has expired, with no plan on the screen and the button to make another', async () => {
		await open(core.status_expired)

		expect(text('.os-plan-expired')).toBe('The last plan has expired. Make a new one.')
		expect(wrapper.find('.os-plan-report').exists()).toBe(false)
		// a window that opens on a plan that has run out has asked for none yet: its button is the first one's
		expect(buttons()).toEqual(['See what the upgrade would do'])
	})

	it('shows the plan that is done, and the one of a box with nothing to do', async () => {
		await open(core.status_done)
		expect(text('.os-plan-meta')).toMatch(/^Plan p1-5787acb2, made on .*2026.*, valid until .*2026.*\.$/)
		expect(wrapper.find('.os-plan-left-behind').exists()).toBe(false)

		close()
		await open(core.status_done_nothing)
		expect(text('.os-plan-result')).toBe('The plan found nothing in the way.')
	})

	// the failures of a job, by their code: the sentence, the step it stopped at, the source and why, and the lines that apt itself wrote
	it.each([
		['status_failed_sources_target', 'A package source is already at the next release, or past it. If an earlier try of the upgrade by hand rewrote the sources, find the script that its runbook named, /var/backups/casaos-os-upgrade-*/restore-sources.sh (a folder for each plan), and run it with sh, or finish that upgrade. The script refuses once the upgrade of the packages has begun.', 1, 'File sources.list, line 1', null, []],
		['status_failed_sources_format', 'A package source is not in a form the plan reads.', 1, 'File debian.sources', 'A .sources file (the deb822 form) is not read by this plan yet.', []],
		['status_failed_sources_format_undecided', 'A package source is not in a form the plan reads.', 1, 'File sources.list, line 2', 'The plan could not tell whether this source is the distribution\'s own. Update the package lists first (apt-get update, or the System packages window), then make the plan again.', []],
		['status_failed_sources_alias', 'A package source names its release by an alias that moves with the archive: name the release in it, then try again.', 1, 'File sources.list, line 1', null, []],
		['status_failed_sources_cdrom', 'A package source is a disc or a local folder, which cannot be upgraded from.', 1, 'File sources.list, line 1', null, []],
		['status_failed_sources_mixed_file', 'A file of package sources mixes the distribution\'s own lines with others: mix.list. Split it in two, then try again.', 1, null, null, []],
		['status_failed_update_no_pubkey', 'apt could not check the signature of a package source: its key is missing from this machine.', 2, null, null, ['Err:1 http://deb.debian.org bookworm InRelease', 'W: GPG error: http://deb.debian.org bookworm InRelease: The following signatures couldn\'t be verified because the public key is not available: NO_PUBKEY 0E98404D386FA1D9', 'E: The repository \'http://deb.debian.org bookworm InRelease\' is not signed.']],
		['status_failed_update_not_found', 'A package source, or a file of it, was not found: a mirror may not have the next release, or its address is wrong.', 2, null, null, ['Err:2 http://deb.debian.org bullseye-backports InRelease', 'E: The repository \'http://deb.debian.org bullseye-backports Release\' does not have a Release file.']],
		['status_failed_solver_dist', 'apt could not work out the upgrade.', 4, null, null, ['E: Unable to correct problems, you have held broken packages.']],
		['status_failed_unparsed', 'ReCasaOS could not understand what apt said, so it makes no partial plan.', 6, null, null, []],
		['status_failed_timeout_solver', 'The plan took too long and was stopped. Nothing was changed on the machine. Try again.', 4, null, null, []],
		['status_failed_internal', 'The plan failed unexpectedly. Nothing was changed on the machine. Try again.', 4, null, null, []],
		['status_failed_canceled', 'The plan was stopped because ReCasaOS was stopping. Try again.', 2, null, null, []],
	])('says %s', async (name, title, step, place, reason, lines) => {
		await open(core[name])

		expect(text('.os-plan-failure-title')).toBe(title)
		expect(text('.os-plan-failed-step')).toMatch(new RegExp(`^It stopped at step ${step} of 6: `))
		expect(wrapper.find('.os-plan-place').exists() ? text('.os-plan-place') : null).toBe(place)
		expect(wrapper.find('.os-plan-reason').exists() ? text('.os-plan-reason') : null).toBe(reason)
		expect(texts('.os-plan-said-lines li')).toEqual(lines)
		expect(buttons()).toEqual(['Make the plan again'])
		expect(wrapper.find('[role="status"] .os-plan-failure').exists()).toBe(true)
	})

	// the core wrote in English, for whoever reads the raw answer, where the way back from a source that is at the next release is: the window
	// does not repeat it, and says its own
	it('says nothing of what the core wrote of a source that is at the next release, and says the way back in its own words', async () => {
		await open(core.status_failed_sources_target)

		expect(core.status_failed_sources_target.error.detail).toContain('restore-sources.sh')
		expect(wrapper.find('.os-plan-said').exists()).toBe(false)
		expect(wrapper.text()).not.toContain(core.status_failed_sources_target.error.detail)
		expect(text('.os-plan-failure-title')).toContain('/var/backups/casaos-os-upgrade-*/restore-sources.sh')
	})

	it.each([
		['refusal_not_root', 'ReCasaOS does not run as root on this machine, so it cannot plan the upgrade.'],
		['refusal_hop_not_planned', 'ReCasaOS cannot plan the upgrade from this release yet.'],
		['refusal_identity_unsupported', 'This machine is not one that a plan can be made for: it is not a release that ReCasaOS knows how to upgrade, or it has no later one.'],
		['refusal_busy', 'Another package manager is at work on this machine. Wait for it to end, then try again.'],
		['refusal_busy_unknown', 'Whether another package manager is at work on this machine could not be seen, so no plan was made. Try again in a moment.'],
		['refusal_no_room', 'There is not enough room in /var/tmp for the plan\'s temporary folder: 640 MiB needed, 639 MiB free. Free some space, then try again.'],
		['refusal_no_room_unknown', 'There is not enough room in /var/tmp for the plan\'s temporary folder: 640 MiB needed, and the room that is free could not be read. Free some space, then try again.'],
	])('says %s when the request that starts the plan is refused so', async (name, title) => {
		await open()
		startOsPlan.mockImplementationOnce(failure(refused(core[name].error_code, core[name].data)))
		await wrapper.find('.os-plan-start').trigger('click')
		await tick()

		expect(text('.os-plan-failure-title')).toBe(title)
		expect(wrapper.find('.os-plan-failed-step').exists()).toBe(false)
		expect(wrapper.find('[role="status"] .os-plan-failure').exists()).toBe(true)
	})
})

describe('what comes from the machine is text', () => {
	const hostile = '<img src=x onerror=alert(1)>'

	it('is shown as text, in the plan, the sources, the findings and the lists', async () => {
		await opened(planWith({
			verdict: 'blocked',
			problems: [{ code: 'removal_protected', severity: 'blocked', data: { name: hostile, pattern: '<b>x</b>' } }, { code: '<script>alert(2)</script>', severity: 'blocked', data: { '<u>name</u>': 'x', 'names': ['<svg onload=alert(3)>'] } }],
			removals: [{ name: hostile, version: '<i>1</i>', manual: true, protected: true, essential: false }],
			new_packages: [hostile, '<a href="javascript:alert(4)">x</a>'],
			kept_back: [hostile],
			autoremovable: [hostile],
			paused: [{ file: `${hostile}.list`, hosts: [], docker: false }],
			sources: { files: [{ file: `${hostile}.list`, action: 'rewritten', lines: [{ n: 1, before: `deb ${hostile}`, after: 'deb <b>x</b>', why: 'suite' }] }], hash_current: '', hash_generated: '' },
			apt_conf_left_out: [{ file: hostile, reason: 'not_simple' }],
			disk: [{ path: hostile, need: 1, free: 1, ok: true }],
		}))
		expect(text('.os-plan-conf-files')).toContain(hostile)

		for (const tag of ['img', 'b', 'i', 'script', 'svg', 'a', 'u'])
			// the icons are <i class="mdi ...">: the one with no class is the one that came from the machine
			expect(wrapper.find(`.os-plan-report ${tag}:not([class])`).exists(), tag).toBe(false)
		expect(wrapper.find('.os-plan-report [onerror], .os-plan-report [onload], .os-plan-report [href]').exists()).toBe(false)
		expect(wrapper.text()).toContain(hostile)
		expect(wrapper.text()).toContain('<svg onload=alert(3)>')
		expect(wrapper.text()).toContain('<a href="javascript:alert(4)">x</a>')
		expect(wrapper.text()).toContain('deb <b>x</b>')
		expect(text('.os-plan-removal')).toContain('<i>1</i>')
		expect(source).not.toMatch(/v-html|v-dompurify-html|innerHTML/)
	})

	// the message format's own syntax in a name is a name, not a placeholder or a link
	it('puts a name that looks like a placeholder in the sentence as it is', async () => {
		await opened(planWith({ problems: [{ code: 'dist_kept_back', severity: 'blocked', data: { names: ['{names} @:Operating system | x'] } }], verdict: 'blocked' }))

		expect(text('.os-plan-item-sentence')).toBe('After the full upgrade, these packages would still stay at the version they have now: {names} @:Operating system | x. apt does not always count such packages as kept back. The upgrade would not be complete with them, so it is blocked.')
	})

	it('has no secret of an address on the screen, whatever the core sent', async () => {
		await opened(planWith({ sources: { files: [{ file: 'a.list', action: 'rewritten', lines: [{ n: 1, before: 'deb https://user:s3cret@h.example/d?key=abc bullseye main', after: 'deb https://user:s3cret@h.example/d?key=abc bookworm main', why: 'suite' }] }] } }))

		expect(wrapper.text()).not.toMatch(/s3cret|key=abc/)
		expect(wrapper.text()).toContain('deb https://***@h.example/d?*** bookworm main')
	})
})

describe('copying the plan', () => {
	it('copies the text that is built from the plan, in English, and says so', async () => {
		copy.mockResolvedValue(undefined)
		await opened()
		const toast = vi.spyOn(wrapper.vm.$buefy.toast, 'open').mockImplementation(() => {})

		await wrapper.find('.os-plan-copy').trigger('click')
		await tick()

		expect(copy).toHaveBeenCalledTimes(1)
		expect(copy).toHaveBeenCalledWith(planText(real))
		expect(copy.mock.calls[0][0]).toContain('verdict: needs_acceptance')
		expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Copied to clipboard', type: 'is-success' }))
		expect(wrapper.find('.os-plan-text').exists()).toBe(false)
	})

	it('copies no secret, and none of the runbook', async () => {
		copy.mockResolvedValue(undefined)
		await opened(planWith({ sources: { files: [{ file: 'a.list', action: 'rewritten', lines: [{ n: 1, before: 'deb https://user:s3cret@h.example/d?key=abc bullseye main', after: 'deb https://user:s3cret@h.example/d?key=abc bookworm main', why: 'suite' }] }] } }))
		vi.spyOn(wrapper.vm.$buefy.toast, 'open').mockImplementation(() => {})

		await wrapper.find('.os-plan-copy').trigger('click')
		await tick()

		expect(copy.mock.calls[0][0]).not.toMatch(/s3cret|key=abc/)
		expect(copy.mock.calls[0][0]).not.toContain('#!/bin/sh')
		expect(getOsRunbook).not.toHaveBeenCalled()
	})

	it('shows the text selected, to copy by hand, when the browser refuses the clipboard', async () => {
		copy.mockRejectedValue(new Error('denied'))
		await open(done(), { attachTo: document.body })
		const toast = vi.spyOn(wrapper.vm.$buefy.toast, 'open').mockImplementation(() => {})
		const select = vi.spyOn(HTMLTextAreaElement.prototype, 'select')

		await wrapper.find('.os-plan-copy').trigger('click')
		await tick()

		expect(toast).not.toHaveBeenCalled()
		const area = wrapper.find('.os-plan-text textarea')
		expect(area.exists()).toBe(true)
		expect(area.element.value).toBe(planText(real))
		expect(area.attributes('readonly')).toBeDefined()
		expect(area.attributes('aria-label')).toBe('The plan, as text')
		expect(document.activeElement).toBe(area.element)
		// selected, as the sentence says: Ctrl+C copies it
		expect(select).toHaveBeenCalledTimes(1)
		expect(select.mock.contexts[0]).toBe(area.element)
		select.mockRestore()
		expect(text('.os-plan-text p')).toBe('Your browser did not allow copying. The text is selected: copy it with Ctrl+C.')
	})
})

describe('the runbook', () => {
	it('is not asked for before it is opened, and is folded away, with the honest sentence in it', async () => {
		await opened()

		const details = wrapper.find('details.os-plan-runbook')
		expect(details.exists()).toBe(true)
		expect(details.element.open).toBe(false)
		expect(details.find('summary').text()).toBe('Runbook to do it by hand')
		expect(getOsRunbook).not.toHaveBeenCalled()
		expect(text('.os-plan-runbook-honest')).toBe('This text is for you to run on the machine, in a console, after taking a snapshot of the machine. ReCasaOS does not run it for you. It was written for exactly this machine and this plan: if the machine changes, make a new plan.')
		expect(text('.os-plan-runbook-secret')).toBe('It holds the lines of your package sources as the files have them, a password in an address included: keep it to yourself.')
	})

	it('asks for it when it is opened, once, says it is being written, and lists its blocks with what to know of each', async () => {
		const wait = deferred()
		getOsRunbook.mockReturnValueOnce(wait.promise)
		await opened()
		await openRunbook()
		expect(text('.os-plan-runbook-loading')).toBe('Writing the runbook')

		wait.resolve({ data: { data: runbook() } })
		await tick()

		expect(getOsRunbook).toHaveBeenCalledTimes(1)
		expect(wrapper.find('.os-plan-runbook-loading').exists()).toBe(false)
		const blocks = wrapper.findAll('.os-plan-block')
		expect(blocks.map(block => block.text())).toEqual([
			'Block 0: check that this is the machine of the plan, and that it is ready',
			'Block 1: stop the timers of apt and unattended-upgrades',
			'Block 2: write down the state of the machine',
			'Block 3: write the sources of Debian 12, and read the plan again',
			'Block 4: download the packages of the minimal upgrade, while the applications run',
			'Block 5: THE POINT OF NO RETURN: the minimal upgrade, then the protected packages Point of no return',
			'Block 6: the full upgrade, and until nothing is left to do',
			'Block 7: check that the machine will start, then restart it yourself Restart the machine after this block',
			'Block 8: after the restart: look at the machine, then put the sources and the timers back',
		])
		expect(blocks[5].find('.is-no-return').exists()).toBe(true)
		expect(blocks[7].find('.is-reboot').exists()).toBe(true)
		expect(buttons()).toEqual(expect.arrayContaining(['Copy the runbook', 'Download .sh', 'Show the text']))

		// closed and opened again: not asked again
		await openRunbook()
		expect(getOsRunbook).toHaveBeenCalledTimes(1)
	})

	it('does not ask for it when the toggle says it was closed, or when the plan has no id to match it with', async () => {
		await opened()
		const details = wrapper.find('.os-plan-runbook')
		details.element.open = false
		await details.trigger('toggle')
		await tick()
		expect(getOsRunbook).not.toHaveBeenCalled()

		// a plan with an id that is not the core's form has no runbook that can be said to be its own
		close()
		getOsRunbook.mockReturnValueOnce(answer(runbook()))
		await opened(planWith({ plan_id: 'not an id' }))
		await openRunbook()
		expect(text('.os-plan-runbook-failure')).toContain('This runbook is for another plan')
		expect(wrapper.find('.os-plan-runbook-download').exists()).toBe(false)
	})

	it('copies the plan, and not the runbook, when the runbook has been read too', async () => {
		copy.mockResolvedValue(undefined)
		getOsRunbook.mockReturnValueOnce(answer(runbook()))
		await opened()
		await openRunbook()
		vi.spyOn(wrapper.vm.$buefy.toast, 'open').mockImplementation(() => {})

		await wrapper.find('.os-plan-copy').trigger('click')
		await tick()

		expect(copy).toHaveBeenCalledWith(planText(real))
		expect(copy.mock.calls[0][0]).not.toContain('#!/bin/sh')
	})

	it('copies the text of the runbook as it is, and says so', async () => {
		copy.mockResolvedValue(undefined)
		getOsRunbook.mockReturnValueOnce(answer(runbook()))
		await opened()
		await openRunbook()
		const toast = vi.spyOn(wrapper.vm.$buefy.toast, 'open').mockImplementation(() => {})

		await wrapper.find('.os-plan-runbook-copy').trigger('click')
		await tick()

		expect(copy).toHaveBeenCalledWith(TEXT)
		expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Copied to clipboard', type: 'is-success' }))
		expect(wrapper.find('.os-plan-runbook-text').exists()).toBe(false)
	})

	it('shows the text selected, to copy by hand, when the browser refuses the clipboard', async () => {
		copy.mockRejectedValue(new Error('denied'))
		getOsRunbook.mockReturnValueOnce(answer(runbook()))
		await opened()
		await openRunbook()
		const select = vi.spyOn(HTMLTextAreaElement.prototype, 'select')

		await wrapper.find('.os-plan-runbook-copy').trigger('click')
		await tick()

		const area = wrapper.find('.os-plan-runbook-text textarea')
		expect(area.element.value).toBe(TEXT)
		expect(area.attributes('aria-label')).toBe('The runbook, as text')
		// selected, as the sentence says: Ctrl+C copies it
		expect(select).toHaveBeenCalledTimes(1)
		expect(select.mock.contexts[0]).toBe(area.element)
		select.mockRestore()
		expect(text('.os-plan-runbook-text p')).toBe('Your browser did not allow copying. The text is selected: copy it with Ctrl+C.')
	})

	it('shows and hides the text on a button of its own', async () => {
		getOsRunbook.mockReturnValueOnce(answer(runbook()))
		await opened()
		await openRunbook()
		expect(wrapper.find('.os-plan-runbook-text').exists()).toBe(false)

		await wrapper.find('.os-plan-runbook-show').trigger('click')
		expect(wrapper.find('.os-plan-runbook-text textarea').element.value).toBe(TEXT)
		expect(text('.os-plan-runbook-show')).toBe('Hide the text')
		expect(wrapper.find('.os-plan-runbook-text p').exists()).toBe(false)

		await wrapper.find('.os-plan-runbook-show').trigger('click')
		expect(wrapper.find('.os-plan-runbook-text').exists()).toBe(false)
		expect(text('.os-plan-runbook-show')).toBe('Show the text')
	})

	it('downloads it as a file of its own, from the text on the screen, named after the plan', async () => {
		getOsRunbook.mockReturnValueOnce(answer(runbook()))
		await opened()
		await openRunbook()

		await wrapper.find('.os-plan-runbook-download').trigger('click')
		await tick()

		expect(saveAs).toHaveBeenCalledTimes(1)
		const [blob, name] = saveAs.mock.calls[0]
		expect(name).toBe(`casaos-os-upgrade-${ID}.sh`)
		expect(blob).toBeInstanceOf(Blob)
		expect(blob.type).toBe('text/x-shellscript;charset=utf-8')
		expect(await blob.text()).toBe(TEXT)
	})

	// the core's own answer, with its text of some hundred kilobytes: it is read whole, copied as it is, and downloaded under the name of the plan
	it('takes the core\'s own answer whole: its nine blocks, its text to copy and to download as it is, and a file named after the plan', async () => {
		copy.mockResolvedValue(undefined)
		getOsRunbook.mockReturnValueOnce(answer(runbookAnswer))
		await opened()
		await openRunbook()
		const toast = vi.spyOn(wrapper.vm.$buefy.toast, 'open').mockImplementation(() => {})

		expect(runbookAnswer.plan_id).toBe(ID)
		expect(wrapper.findAll('.os-plan-block')).toHaveLength(9)
		await wrapper.find('.os-plan-runbook-copy').trigger('click')
		await tick()
		expect(copy).toHaveBeenCalledWith(runbookAnswer.text)
		expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Copied to clipboard' }))

		await wrapper.find('.os-plan-runbook-download').trigger('click')
		await tick()
		const [blob, name] = saveAs.mock.calls[0]
		expect(name).toBe(`casaos-os-upgrade-${ID}.sh`)
		expect(await blob.text()).toBe(runbookAnswer.text)
	})

	it('says a block\'s title as text', async () => {
		getOsRunbook.mockReturnValueOnce(answer(runbook({ blocks: [{ id: 'x', title: '<img src=x onerror=alert(1)>', reboot: false, point_of_no_return: false }] })))
		await opened()
		await openRunbook()

		expect(text('.os-plan-block')).toBe('Block 0: <img src=x onerror=alert(1)>')
		expect(wrapper.find('.os-plan-block img').exists()).toBe(false)
	})

	// the text of the runbook numbers its blocks from 0 (BLOCK 0 to BLOCK 8, and says "block 3" and "block 5" in its stops and its table): the
	// window says the same numbers, or the owner is told to restore in "block 4" while the text calls it block 3
	it('numbers the blocks as the text of the runbook does, from 0: the sources are block 3 and the point of no return is block 5', async () => {
		getOsRunbook.mockReturnValueOnce(answer(runbook()))
		await opened()
		await openRunbook()

		expect(BLOCKS.map(block => block.id)).toEqual(['verify', 'timers', 'snapshot', 'sources', 'download', 'minimal', 'full', 'prereboot', 'after'])
		const blocks = wrapper.findAll('.os-plan-block')
		const block = id => blocks[BLOCKS.findIndex(item => item.id === id)]
		expect(blocks.map(item => item.text().match(/^Block (\d+): /)?.[1])).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8'])
		expect(block('sources').text()).toMatch(/^Block 3: write the sources of Debian 12/)
		expect(block('minimal').text()).toMatch(/^Block 5: THE POINT OF NO RETURN/)
		expect(block('prereboot').text()).toMatch(/^Block 7: check that the machine will start/)
		// the badges are on those blocks and on no other
		expect(blocks.map(item => item.find('.is-no-return').exists())).toEqual([false, false, false, false, false, true, false, false, false])
		expect(blocks.map(item => item.find('.is-reboot').exists())).toEqual([false, false, false, false, false, false, false, true, false])
		// the list has no marker of its own, which would count from 1 beside the number that is written
		expect(source).toMatch(/\.os-plan-blocks\s*\{[^}]*list-style:\s*none/)
	})

	it('numbers a block by its place in the core\'s list, whatever its id', async () => {
		getOsRunbook.mockReturnValueOnce(answer(runbook({ blocks: [{ id: 'a', title: 'first' }, 7, { id: 'b', title: 'second' }, { title: 'third' }] })))
		await opened()
		await openRunbook()

		expect(texts('.os-plan-block')).toEqual(['Block 0: first', 'Block 2: second', 'Block 3: third'])
	})

	it('does not offer a runbook that has no id either, for a plan whose own id is not the core\'s form', async () => {
		getOsRunbook.mockReturnValueOnce(answer(runbook({ plan_id: 'not the core\'s form either' })))
		await opened(planWith({ plan_id: 'not an id' }))
		await openRunbook()

		expect(text('.os-plan-runbook-failure')).toContain('This runbook is for another plan')
		expect(wrapper.find('.os-plan-runbook-copy').exists()).toBe(false)
		expect(wrapper.find('.os-plan-runbook-download').exists()).toBe(false)
	})

	it('asks for the runbook once when "Try again" is pressed twice before the text comes', async () => {
		getOsRunbook.mockImplementationOnce(failure({ code: 'ECONNABORTED' }))
		await opened()
		await openRunbook()
		expect(text('.os-plan-runbook-failure')).toContain('The request took too long. Try again.')

		const wait = deferred()
		getOsRunbook.mockReturnValueOnce(wait.promise)
		const retry = wrapper.find('.os-plan-runbook-retry').element
		retry.click()
		retry.click()
		wait.resolve({ data: { data: runbook() } })
		await tick()

		expect(getOsRunbook).toHaveBeenCalledTimes(2)
		expect(wrapper.findAll('.os-plan-block')).toHaveLength(BLOCKS.length)
	})

	it.each([
		['expired', 'The plan has expired. Make a new one.'],
		['blocked', 'The plan is blocked, so it has no runbook.'],
		['idle', 'There is no plan to write it from. Make the plan first.'],
		['running', 'A plan is being made: wait for it to end.'],
		['failed', 'The last plan failed. Make it again.'],
	])('says that the core has no plan to write it from (%s), and lets the owner ask again', async (reason, sentence) => {
		getOsRunbook.mockImplementationOnce(failure(refused('no_plan', { reason })))
		await opened()
		await openRunbook()

		expect(text('.os-plan-runbook-failure')).toContain(sentence)
		expect(wrapper.find('.os-plan-runbook-copy').exists()).toBe(false)
		expect(wrapper.find('.os-plan-runbook-download').exists()).toBe(false)

		getOsRunbook.mockReturnValueOnce(answer(runbook()))
		await wrapper.find('.os-plan-runbook-retry').trigger('click')
		await tick()
		expect(wrapper.find('.os-plan-runbook-failure').exists()).toBe(false)
		expect(wrapper.findAll('.os-plan-block')).toHaveLength(BLOCKS.length)
	})

	it.each([
		['the text could not be written safely', refused('no_runbook', { reason: 'runbook_unsafe' }), 'The text could not be written safely: a line of your package sources holds what ends a block of it. Nothing was written.'],
		['the text is too large', refused('no_runbook', { reason: 'runbook_too_large' }), 'The text would be too large to hand out: shorten the comments in your package sources and the number of third-party source files, then make the plan again. Nothing was written.'],
		['a core that has no such route', { response: { status: 404 } }, 'This version of ReCasaOS cannot make this plan yet. Update ReCasaOS, then try again.'],
		['a call that took too long', { code: 'ECONNABORTED' }, 'The request took too long. Try again.'],
		['no network', {}, 'The request could not be completed. Try again.'],
	])('says %s', async (_, error, sentence) => {
		getOsRunbook.mockImplementationOnce(failure(error))
		await opened()
		await openRunbook()

		expect(text('.os-plan-runbook-failure')).toContain(sentence)
	})

	it('says an answer that is not a runbook as one that could not be read, and gives no buttons', async () => {
		for (const bad of [undefined, 'text', { plan_id: ID }, { plan_id: ID, text: '' }]) {
			close()
			getOsRunbook.mockReturnValueOnce(answer(bad))
			await opened()
			await openRunbook()

			expect(text('.os-plan-runbook-failure')).toContain('The runbook could not be read. Try again.')
			expect(wrapper.find('.os-plan-runbook-copy').exists()).toBe(false)
		}
	})

	// the text is for the plan on the screen: another plan's is not offered, and its id is never a file name
	it.each([
		['of another plan', 'p1-0123456789abcdef0123456789abcdef'],
		['with no id', undefined],
		['with an id that is not the core\'s form', '../../etc/cron.d/x'],
	])('does not offer a runbook %s', async (_, planId) => {
		getOsRunbook.mockReturnValueOnce(answer(runbook({ plan_id: planId })))
		await opened()
		await openRunbook()

		expect(text('.os-plan-runbook-failure')).toContain('This runbook is for another plan: a newer one was made. Look at the plan again.')
		expect(wrapper.find('.os-plan-runbook-copy').exists()).toBe(false)
		expect(wrapper.find('.os-plan-runbook-download').exists()).toBe(false)
		expect(saveAs).not.toHaveBeenCalled()
		// asking for the same text again says the same: the button is the one that looks at the plan
		expect(wrapper.find('.os-plan-runbook-retry').exists()).toBe(false)
		expect(buttons()).not.toContain('Try again')
		expect(text('.os-plan-runbook-look')).toBe('Look at the plan again')
	})

	describe('when the text is not for the plan on the screen', () => {
		const NEWER = 'p1-0123456789abcdef0123456789abcdef'
		const newer = () => planWith({ plan_id: NEWER, made_at: '2026-10-12T09:50:00Z', expires_at: '2026-10-13T09:50:00Z' })

		it('asks the core for the plan again, and takes in the newer plan, with a runbook area of its own', async () => {
			getOsRunbook.mockReturnValueOnce(answer(runbook({ plan_id: NEWER })))
			await opened()
			await openRunbook()
			expect(text('.os-plan-meta')).toContain('p1-5787acb2')

			getOsPlan.mockReturnValueOnce(answer(done(newer())))
			await wrapper.find('.os-plan-runbook-look').trigger('click')
			await tick()

			expect(getOsPlan).toHaveBeenCalledTimes(2)
			expect(text('.os-plan-meta')).toContain('p1-01234567')
			expect(wrapper.find('.os-plan-runbook-failure').exists()).toBe(false)
			expect(wrapper.find('.os-plan-runbook').element.open).toBe(false)
			expect(getOsRunbook).toHaveBeenCalledTimes(1)
			getOsRunbook.mockReturnValueOnce(answer(runbook({ plan_id: NEWER })))
			await openRunbook()
			expect(wrapper.findAll('.os-plan-block')).toHaveLength(BLOCKS.length)
			expect(wrapper.find('.os-plan-runbook-failure').exists()).toBe(false)
		})

		it('says what the core says of the plan when it is no longer a plan', async () => {
			getOsRunbook.mockReturnValueOnce(answer(runbook({ plan_id: NEWER })))
			await opened()
			await openRunbook()

			getOsPlan.mockReturnValueOnce(answer(IDLE))
			await wrapper.find('.os-plan-runbook-look').trigger('click')
			await tick()

			expect(wrapper.find('.os-plan-report').exists()).toBe(false)
			expect(wrapper.find('.os-plan-withdrawn').exists()).toBe(true)
		})

		it('asks for the runbook again when the plan it looks at is the one on the screen', async () => {
			getOsRunbook.mockReturnValueOnce(answer(runbook({ plan_id: NEWER })))
			await opened()
			await openRunbook()

			getOsPlan.mockReturnValueOnce(answer(done()))
			getOsRunbook.mockReturnValueOnce(answer(runbook()))
			await wrapper.find('.os-plan-runbook-look').trigger('click')
			await tick()

			expect(getOsPlan).toHaveBeenCalledTimes(2)
			expect(getOsRunbook).toHaveBeenCalledTimes(2)
			expect(wrapper.find('.os-plan-runbook-failure').exists()).toBe(false)
			expect(wrapper.findAll('.os-plan-block')).toHaveLength(BLOCKS.length)
		})

		it('says that the core did not answer, and leaves the button, when it does not', async () => {
			getOsRunbook.mockReturnValueOnce(answer(runbook({ plan_id: NEWER })))
			await opened()
			await openRunbook()

			getOsPlan.mockImplementationOnce(failure({ code: 'ECONNABORTED' }))
			await wrapper.find('.os-plan-runbook-look').trigger('click')
			await tick()

			expect(text('.os-plan-call-failure')).toBe('The request could not be completed. Try again.')
			expect(text('.os-plan-runbook-look')).toBe('Look at the plan again')
			expect(wrapper.find('.os-plan-report').exists()).toBe(true)

			// and when the core answers the next time, the message of the call that failed goes
			getOsPlan.mockReturnValueOnce(answer(done(newer())))
			await wrapper.find('.os-plan-runbook-look').trigger('click')
			await tick()
			expect(wrapper.find('.os-plan-call-failure').exists()).toBe(false)
			expect(text('.os-plan-meta')).toContain('p1-01234567')
		})

		it('asks the core once when it is pressed twice before the answer comes', async () => {
			getOsRunbook.mockReturnValueOnce(answer(runbook({ plan_id: NEWER })))
			await opened()
			await openRunbook()

			const wait = deferred()
			getOsPlan.mockReturnValueOnce(wait.promise)
			const look = wrapper.find('.os-plan-runbook-look').element
			look.click()
			look.click()
			wait.resolve({ data: { data: done(newer()) } })
			await tick()

			expect(getOsPlan).toHaveBeenCalledTimes(2)
		})

		it('says it in French', async () => {
			i18n.global.locale = 'fr_fr'
			getOsRunbook.mockReturnValueOnce(answer(runbook({ plan_id: NEWER })))
			await open(done(), { props: { locale: 'fr_fr' } })
			await openRunbook()

			expect(text('.os-plan-runbook-look')).toBe('Revoir le plan')
			expect(buttons()).not.toContain('Réessayer')
		})
	})

	// a text that cannot be written for this plan will not be written by asking again: only a new plan, made when the cause is mended, can have one
	it.each([
		['it could not be written safely', refused('no_runbook', { reason: 'runbook_unsafe' })],
		['it is too large', refused('no_runbook', { reason: 'runbook_too_large' })],
		['the core says no reason that this window knows', refused('no_runbook', { reason: 'from-the-future' })],
		['the core says no reason', refused('no_runbook')],
	])('has no button to ask again when %s', async (_, error) => {
		getOsRunbook.mockImplementationOnce(failure(error))
		await opened()
		await openRunbook()

		expect(wrapper.find('.os-plan-runbook-failure p').exists()).toBe(true)
		expect(wrapper.find('.os-plan-runbook-retry').exists()).toBe(false)
		expect(wrapper.find('.os-plan-runbook-look').exists()).toBe(false)
		expect(wrapper.find('.os-plan-runbook-failure button').exists()).toBe(false)
		// the plan can be made again, which is what the sentence says to do
		expect(buttons()).toContain('Make the plan again')
		expect(getOsRunbook).toHaveBeenCalledTimes(1)
	})

	it('says what to do when the text is too large, in French too', async () => {
		i18n.global.locale = 'fr_fr'
		getOsRunbook.mockImplementationOnce(failure(refused('no_runbook', { reason: 'runbook_too_large' })))
		await open(done(), { props: { locale: 'fr_fr' } })
		await openRunbook()

		expect(text('.os-plan-runbook-failure')).toBe('Le texte serait trop volumineux pour être remis : raccourcissez les commentaires de vos sources de paquets et le nombre de fichiers de sources tierces, puis refaites le plan. Rien n\'a été écrit.')
		expect(wrapper.find('.os-plan-runbook-failure button').exists()).toBe(false)
	})

	// the buttons that can still help: a call that failed, and a core that has no plan to write it from
	it.each([
		['a call that took too long', failure({ code: 'ECONNABORTED' })],
		['a core that has no such route', failure({ response: { status: 404 } })],
		['a core that has no plan to write it from', failure(refused('no_plan', { reason: 'running' }))],
	])('keeps the button to ask again for %s', async (_, call) => {
		getOsRunbook.mockImplementationOnce(call)
		await opened()
		await openRunbook()

		expect(text('.os-plan-runbook-retry')).toBe('Try again')
		expect(wrapper.find('.os-plan-runbook-look').exists()).toBe(false)
	})

	it('has none for a plan that is blocked, and says why', async () => {
		await opened(planWith({ verdict: 'blocked', problems: [{ code: 'disk_short', severity: 'blocked', data: {} }] }))

		expect(wrapper.find('.os-plan-runbook').exists()).toBe(false)
		expect(text('.os-plan-no-runbook')).toBe('A blocked plan has no runbook: the findings above say why.')
	})

	it('has none for a plan whose verdict it does not know', async () => {
		await opened(planWith({ verdict: 'from-the-future', problems: [] }))

		expect(wrapper.find('.os-plan-runbook').exists()).toBe(false)
		expect(wrapper.find('.os-plan-no-runbook').exists()).toBe(true)
	})

	it('is forgotten when the plan is made again', async () => {
		getOsRunbook.mockReturnValueOnce(answer(runbook()))
		await opened()
		await openRunbook()
		expect(wrapper.findAll('.os-plan-block')).toHaveLength(BLOCKS.length)

		await start(running('sources'))
		getOsPlan.mockReturnValueOnce(answer(done()))
		await tick(1000)

		expect(wrapper.findAll('.os-plan-block')).toHaveLength(0)
		expect(wrapper.find('details.os-plan-runbook').exists()).toBe(true)
	})

	it('drops a runbook that comes after the plan was made again: it is not the one on the screen', async () => {
		const late = deferred()
		getOsRunbook.mockReturnValueOnce(late.promise)
		await opened()
		await openRunbook()
		expect(text('.os-plan-runbook-loading')).toBe('Writing the runbook')

		await start(running('sources'))
		getOsPlan.mockReturnValueOnce(answer(done()))
		await tick(1000)
		late.resolve({ data: { data: runbook() } })
		await tick()

		expect(wrapper.findAll('.os-plan-block')).toHaveLength(0)
		expect(wrapper.find('.os-plan-runbook-copy').exists()).toBe(false)
		expect(wrapper.find('.os-plan-runbook-loading').exists()).toBe(false)
		expect(wrapper.find('.os-plan-runbook-failure').exists()).toBe(false)

		// and the runbook of the new plan can be asked for
		getOsRunbook.mockReturnValueOnce(answer(runbook()))
		await openRunbook()
		expect(wrapper.findAll('.os-plan-block')).toHaveLength(BLOCKS.length)
	})

	it('has nobody to tell when the window closed before the runbook came', async () => {
		const late = deferred()
		getOsRunbook.mockReturnValueOnce(late.promise)
		await opened()
		await openRunbook()
		const vm = wrapper.vm
		close()

		late.resolve({ data: { data: runbook() } })
		await tick()
		expect(vm.runbook.loading).toBe(true)
	})
})

describe('a plan that is made again', () => {
	it('keeps the plan on the screen, and its runbook, when the request is refused, or fails and no job began', async () => {
		getOsRunbook.mockReturnValueOnce(answer(runbook()))
		await opened()
		await openRunbook()
		expect(wrapper.findAll('.os-plan-block')).toHaveLength(BLOCKS.length)

		startOsPlan.mockImplementationOnce(failure(refused('busy', {})))
		await wrapper.find('.os-plan-start').trigger('click')
		await tick()
		expect(text('.os-plan-failure-title')).toBe('Another package manager is at work on this machine. Wait for it to end, then try again.')
		expect(wrapper.find('.os-plan-report').exists()).toBe(true)
		expect(wrapper.findAll('.os-plan-block')).toHaveLength(BLOCKS.length)
		expect(wrapper.find('.os-plan-runbook-copy').exists()).toBe(true)
		expect(wrapper.find('details.os-plan-runbook').element.open).toBe(true)

		// a request that did not get there, and a core that says no job began (the same plan is there)
		startOsPlan.mockImplementationOnce(failure({ code: 'ECONNABORTED' }))
		getOsPlan.mockReturnValueOnce(answer(done()))
		await wrapper.find('.os-plan-start').trigger('click')
		await tick()
		expect(text('.os-plan-call-failure')).toBe('The request took too long. Try again.')
		expect(wrapper.find('.os-plan-report').exists()).toBe(true)
		expect(wrapper.findAll('.os-plan-block')).toHaveLength(BLOCKS.length)
		expect(getOsRunbook).toHaveBeenCalledTimes(1)
	})

	it('keeps the text of the plan that was shown selected, to copy by hand, when the request is refused', async () => {
		copy.mockRejectedValue(new Error('denied'))
		await open(done(), { attachTo: document.body })
		vi.spyOn(wrapper.vm.$buefy.toast, 'open').mockImplementation(() => {})
		await wrapper.find('.os-plan-copy').trigger('click')
		await tick()
		expect(wrapper.find('.os-plan-text textarea').exists()).toBe(true)

		startOsPlan.mockImplementationOnce(failure(refused('busy', {})))
		await wrapper.find('.os-plan-start').trigger('click')
		await tick()
		expect(wrapper.find('.os-plan-text textarea').exists()).toBe(true)

		// and gives place to the new plan when a job does take its place
		await start(running('sources'))
		expect(wrapper.find('.os-plan-text').exists()).toBe(false)

		// the text that was shown for the old plan is not shown again for the new one
		getOsPlan.mockReturnValueOnce(answer(done()))
		await tick(1000)
		expect(wrapper.find('.os-plan-report').exists()).toBe(true)
		expect(wrapper.find('.os-plan-text').exists()).toBe(false)
	})
})

describe('on a phone', () => {
	it('lets the buttons of the runbook go on a second line, and each table scroll in a box of its own that keeps its words whole', async () => {
		getOsRunbook.mockReturnValueOnce(answer(runbook()))
		await opened()
		await openRunbook()

		expect(wrapper.find('.os-plan-runbook-buttons').classes()).toContain('is-flex-wrap-wrap')
		for (const table of ['.os-plan-counts', '.os-plan-removals', '.os-plan-disk'])
			expect(wrapper.find(table).element.parentElement.classList.contains('os-plan-scroll'), table).toBe(true)
		// the words of a table are not cut to make it narrower (that is what `anywhere` does): the style of the box says `break-word`
		expect(source).toMatch(/\.os-plan-scroll\s*\{[^}]*overflow-wrap:\s*break-word/)
		expect(source).toMatch(/\.os-plan-scroll\s*\{[^}]*overflow-x:\s*auto/)
	})
})

describe('a plan that runs out while the window is open', () => {
	const gone = { plannable: true, state: 'idle', expired: true, expires_at: real.expires_at }
	const EXPIRES = Date.parse(real.expires_at)

	it('says it has expired when its time is up, and drops the plan with its runbook and its buttons', async () => {
		getOsRunbook.mockReturnValueOnce(answer(runbook()))
		await opened()
		await openRunbook()
		expect(wrapper.findAll('.os-plan-block')).toHaveLength(BLOCKS.length)

		getOsPlan.mockReturnValueOnce(answer(gone))
		await tick(EXPIRES - NOW.getTime())

		expect(getOsPlan).toHaveBeenCalledTimes(2)
		expect(wrapper.find('.os-plan-report').exists()).toBe(false)
		expect(wrapper.find('.os-plan-runbook-copy').exists()).toBe(false)
		expect(text('[role="status"] .os-plan-expired')).toBe('The last plan has expired. Make a new one.')
		expect(text('.os-plan-start')).toBe('See what the upgrade would do')
		// and a new plan can be made
		await start(running('sources'))
		expect(wrapper.find('.os-plan-expired').exists()).toBe(false)
		expect(wrapper.find('.os-plan-step').exists()).toBe(true)
	})

	it('does not say it before its time is up', async () => {
		await opened()
		await tick(EXPIRES - NOW.getTime() - 1000)

		expect(getOsPlan).toHaveBeenCalledTimes(1)
		expect(wrapper.find('.os-plan-report').exists()).toBe(true)
	})

	// the clock of the machine the window runs on is not the core's
	it('asks the core first, and keeps the plan the core still holds, when its clock is what is wrong', async () => {
		await opened()
		getOsPlan.mockReturnValueOnce(answer(done()))
		await tick(25 * HOUR)

		expect(getOsPlan).toHaveBeenCalledTimes(2)
		expect(wrapper.find('.os-plan-report').exists()).toBe(true)
		expect(wrapper.find('.os-plan-expired').exists()).toBe(false)
	})

	it('asks the core once, and no more, for a plan that is due by this machine\'s clock the moment it is shown', async () => {
		// the window opens on it (the first answer), and the core is asked about it at once (the second)
		const due = planWith({ expires_at: '2026-10-12T08:00:00Z' })
		getOsPlan.mockReturnValueOnce(answer(done(due)))
		await opened(due)
		await tick(10000)

		expect(getOsPlan).toHaveBeenCalledTimes(2)
		expect(wrapper.find('.os-plan-report').exists()).toBe(true)
	})

	it('shows the plan the core holds when it is another one, and forgets the runbook of the one it replaces', async () => {
		getOsRunbook.mockReturnValueOnce(answer(runbook()))
		await opened()
		await openRunbook()
		const newer = planWith({ plan_id: 'p1-0123456789abcdef0123456789abcdef', expires_at: '2026-10-14T09:30:00Z' })
		getOsPlan.mockReturnValueOnce(answer(done(newer)))
		await tick(25 * HOUR)

		expect(text('.os-plan-meta')).toContain('Plan p1-01234567,')
		expect(wrapper.findAll('.os-plan-block')).toHaveLength(0)
		expect(wrapper.find('.os-plan-expired').exists()).toBe(false)
		expect(wrapper.find('.os-plan-withdrawn').exists()).toBe(false)
	})

	// the runbook area that was open for the plan that went is not left open and blank for the one that came: it is closed, as a new one, and
	// asks for its own text when it is opened
	it('gives the plan that takes the place of another a runbook area of its own, closed, which asks for its own text', async () => {
		getOsRunbook.mockReturnValueOnce(answer(runbook()))
		await opened()
		await openRunbook()
		expect(wrapper.find('details.os-plan-runbook').element.open).toBe(true)
		const first = wrapper.find('details.os-plan-runbook').element

		const newer = planWith({ plan_id: 'p1-0123456789abcdef0123456789abcdef', expires_at: '2026-10-14T09:30:00Z' })
		getOsPlan.mockReturnValueOnce(answer(done(newer)))
		await tick(25 * HOUR)

		const details = wrapper.find('details.os-plan-runbook')
		expect(details.element).not.toBe(first)
		expect(details.element.open).toBe(false)
		expect(getOsRunbook).toHaveBeenCalledTimes(1)

		getOsRunbook.mockReturnValueOnce(answer(runbook({ plan_id: newer.plan_id })))
		await openRunbook()
		expect(getOsRunbook).toHaveBeenCalledTimes(2)
		expect(wrapper.findAll('.os-plan-block')).toHaveLength(BLOCKS.length)
		expect(wrapper.find('.os-plan-runbook-failure').exists()).toBe(false)
	})

	it('does not offer a plan that may have run out when the core cannot be reached to say', async () => {
		await opened()
		getOsPlan.mockImplementationOnce(failure({ code: 'ERR_NETWORK' }))
		await tick(25 * HOUR)

		expect(wrapper.find('.os-plan-report').exists()).toBe(false)
		expect(text('.os-plan-expired')).toBe('The last plan has expired. Make a new one.')

		// a new job takes the message away, as it does the core's own word of an expired plan
		await start(running('sources'))
		expect(wrapper.find('.os-plan-expired').exists()).toBe(false)
		expect(wrapper.find('.os-plan-step').exists()).toBe(true)
	})

	// the clock of the machine the window runs on was set back after the window opened: the timer, which counts what it was told, ran 2
	// seconds before the plan's time by the clock that is now
	it('sets its timer again for what is left when it ran before the time, because the clock was set back', async () => {
		await opened()
		vi.setSystemTime(NOW.getTime() - 2000)
		await tick(EXPIRES - NOW.getTime())

		// by this clock the plan has 2 seconds left: it is still there, and the core was not asked
		expect(getOsPlan).toHaveBeenCalledTimes(1)
		expect(wrapper.find('.os-plan-report').exists()).toBe(true)

		getOsPlan.mockReturnValueOnce(answer(gone))
		await tick(2000)
		expect(getOsPlan).toHaveBeenCalledTimes(2)
		expect(wrapper.find('.os-plan-report').exists()).toBe(false)
		expect(wrapper.find('.os-plan-expired').exists()).toBe(true)
	})

	// a delay above 2147483647 ms (24.8 days) makes a browser fire the timer at once, and the plan is still in its time: it would arm itself again, and again
	describe('when the clock of this machine is more than 24.8 days behind the core\'s', () => {
		const MAX_DELAY = 2147483647
		const DAYS = 24 * HOUR
		const far = () => planWith({ expires_at: new Date(NOW.getTime() + 30 * DAYS).toISOString() })
		let timeouts

		beforeEach(() => {
			timeouts = vi.spyOn(globalThis, 'setTimeout')
		})

		afterEach(() => {
			timeouts.mockRestore()
		})

		const delays = () => timeouts.mock.calls.map(call => call[1]).filter(delay => typeof delay === 'number')

		it('never sets a timer for more than a timer can hold, and does not loop', async () => {
			await open(done(far()))
			const armed = delays().length
			expect(armed).toBeGreaterThan(0)
			expect(Math.max(...delays())).toBeLessThanOrEqual(MAX_DELAY)

			await tick(1000)
			expect(delays().length).toBe(armed)
			expect(getOsPlan).toHaveBeenCalledTimes(1)
		})

		it('sets the timer again for what is left when the first one runs, and keeps the plan without asking the core', async () => {
			await open(done(far()))
			await tick(MAX_DELAY)

			expect(getOsPlan).toHaveBeenCalledTimes(1)
			expect(wrapper.find('.os-plan-report').exists()).toBe(true)
			expect(delays().at(-1)).toBeLessThanOrEqual(30 * DAYS - MAX_DELAY)
			expect(delays().at(-1)).toBeGreaterThan(30 * DAYS - MAX_DELAY - 5000)
			expect(Math.max(...delays())).toBeLessThanOrEqual(MAX_DELAY)

			// and when the time is up, the core is asked
			getOsPlan.mockReturnValueOnce(answer({ plannable: true, state: 'idle', expired: true }))
			await tick(30 * DAYS - MAX_DELAY)
			expect(getOsPlan).toHaveBeenCalledTimes(2)
			expect(wrapper.find('.os-plan-expired').exists()).toBe(true)
		})

		it('keeps the delay of a plan that is near, as it is', async () => {
			await opened()
			expect(delays()).toContain(EXPIRES - NOW.getTime())
		})
	})

	// a core that was restarted has no plan, and says no more than that: it is not a plan that ran out
	it('says the plan is no longer on the machine when the core has none and does not say that it ran out', async () => {
		await opened()
		getOsPlan.mockReturnValueOnce(answer(IDLE))
		await tick(EXPIRES - NOW.getTime())

		expect(getOsPlan).toHaveBeenCalledTimes(2)
		expect(wrapper.find('.os-plan-report').exists()).toBe(false)
		const sentence = 'The plan is no longer on the machine: ReCasaOS may have restarted since it was made. Make a new one.'
		expect(text('.os-plan-withdrawn')).toBe(sentence)
		expect(text('[role="status"] .os-plan-withdrawn')).toBe(sentence)
		expect(wrapper.find('.os-plan-expired').exists()).toBe(false)
		expect(wrapper.find('.os-plan-vanished').exists()).toBe(false)
		expect(text('.os-plan-start')).toBe('Make the plan again')

		// and a job that begins takes the message away
		await start(running('sources'))
		expect(wrapper.find('.os-plan-withdrawn').exists()).toBe(false)
		expect(wrapper.find('.os-plan-step').exists()).toBe(true)
	})

	it('does not say it when the core says that the plan ran out, nor for a job that is gone', async () => {
		await opened()
		getOsPlan.mockReturnValueOnce(answer(gone))
		await tick(EXPIRES - NOW.getTime())
		expect(wrapper.find('.os-plan-withdrawn').exists()).toBe(false)
		expect(wrapper.find('.os-plan-expired').exists()).toBe(true)

		// the window is asked once more, and still says it ran out
		await start(running('sources'))
		getOsPlan.mockReturnValueOnce(answer(IDLE))
		await tick(1000)
		expect(wrapper.find('.os-plan-withdrawn').exists()).toBe(false)
		expect(wrapper.find('.os-plan-vanished').exists()).toBe(true)
	})

	// the core is asked about a plan that is due, and the owner starts another job meanwhile: what the core answers of the old one is not for the screen
	it('gives nothing of a plan that a new job took the place of while the core was being asked, though the core still says it is good', async () => {
		copy.mockResolvedValue(undefined)
		await opened()
		vi.spyOn(wrapper.vm.$buefy.toast, 'open').mockImplementation(() => {})
		vi.setSystemTime(EXPIRES + HOUR)
		const late = deferred()
		getOsPlan.mockReturnValueOnce(late.promise)
		await wrapper.find('.os-plan-copy').trigger('click')

		await start(running('sources'))
		late.resolve({ data: { data: done() } })
		await tick()

		expect(copy).not.toHaveBeenCalled()
		expect(wrapper.find('.os-plan-step').exists()).toBe(true)
		expect(wrapper.find('.os-plan-report').exists()).toBe(false)
	})

	it('asks nothing when the window closed before the time was up', async () => {
		await opened()
		close()
		await tick(48 * HOUR)

		expect(getOsPlan).toHaveBeenCalledTimes(1)
	})

	it('has nobody to tell when the window closed while the core was asked', async () => {
		await opened()
		const late = deferred()
		getOsPlan.mockReturnValueOnce(late.promise)
		await tick(25 * HOUR)
		const vm = wrapper.vm
		close()

		late.resolve({ data: { data: gone } })
		await tick()
		expect(vm.status.state).toBe('done')
	})

	// a machine that was asleep: the time passed and the timer did not run
	describe('when it is copied or downloaded after its time', () => {
		async function laterWith(answerOfCore) {
			copy.mockResolvedValue(undefined)
			getOsRunbook.mockReturnValueOnce(answer(runbook()))
			await opened()
			await openRunbook()
			vi.spyOn(wrapper.vm.$buefy.toast, 'open').mockImplementation(() => {})
			vi.setSystemTime(EXPIRES + HOUR)
			getOsPlan.mockReturnValueOnce(answer(answerOfCore))
		}

		it.each([
			['the plan', '.os-plan-copy'],
			['the runbook', '.os-plan-runbook-copy'],
			['the file of the runbook', '.os-plan-runbook-download'],
		])('does not give %s, and says the plan has expired', async (_, button) => {
			await laterWith(gone)
			await wrapper.find(button).trigger('click')
			await tick()

			expect(copy).not.toHaveBeenCalled()
			expect(saveAs).not.toHaveBeenCalled()
			expect(wrapper.find('.os-plan-report').exists()).toBe(false)
			expect(wrapper.find('.os-plan-expired').exists()).toBe(true)
		})

		it.each([
			['the plan', '.os-plan-copy', () => expect(copy).toHaveBeenCalledWith(planText(real))],
			['the runbook', '.os-plan-runbook-copy', () => expect(copy).toHaveBeenCalledWith(TEXT)],
			['the file of the runbook', '.os-plan-runbook-download', () => expect(saveAs).toHaveBeenCalledTimes(1)],
		])('gives %s all the same when the core says the plan is still good', async (_, button, given) => {
			await laterWith(done())
			await wrapper.find(button).trigger('click')
			await tick()

			given()
			expect(wrapper.find('.os-plan-report').exists()).toBe(true)
		})

		// a core that was restarted: no plan, and no word that it ran out
		it.each([
			['the plan', '.os-plan-copy'],
			['the runbook', '.os-plan-runbook-copy'],
			['the file of the runbook', '.os-plan-runbook-download'],
		])('does not give %s, and says the plan is no longer on the machine, when the core has none', async (_, button) => {
			await laterWith(IDLE)
			await wrapper.find(button).trigger('click')
			await tick()

			expect(copy).not.toHaveBeenCalled()
			expect(saveAs).not.toHaveBeenCalled()
			expect(wrapper.find('.os-plan-report').exists()).toBe(false)
			expect(wrapper.find('.os-plan-withdrawn').exists()).toBe(true)
			expect(wrapper.find('.os-plan-expired').exists()).toBe(false)
		})

		it('gives them without asking the core while the plan is in its time', async () => {
			copy.mockResolvedValue(undefined)
			getOsRunbook.mockReturnValueOnce(answer(runbook()))
			await opened()
			await openRunbook()
			vi.spyOn(wrapper.vm.$buefy.toast, 'open').mockImplementation(() => {})
			await wrapper.find('.os-plan-runbook-download').trigger('click')
			await wrapper.find('.os-plan-runbook-copy').trigger('click')
			await wrapper.find('.os-plan-copy').trigger('click')
			await tick()

			expect(saveAs).toHaveBeenCalledTimes(1)
			expect(copy).toHaveBeenCalledTimes(2)
			expect(getOsPlan).toHaveBeenCalledTimes(1)
		})
	})
})

describe('in French', () => {
	beforeEach(() => {
		i18n.global.locale = 'fr_fr'
	})

	// as the readiness section of the same window says it
	it('says Docker\'s packages as held (retenus), and a room that could not be read', async () => {
		await open(done(planWith({
			verdict: 'blocked',
			problems: [
				{ code: 'disk_short', severity: 'blocked', data: { path: '/', need: 536870912, unknown: true } },
				{ code: 'docker_held', severity: 'info', data: { names: ['docker-ce'] } },
			],
			disk: [{ path: '/', need: 536870912, ok: false, unknown: true }],
		})), { props: { locale: 'fr_fr' } })

		expect(texts('.os-plan-item-sentence')).toEqual([
			'La place libre sur / n\'a pas pu être lue (512 Mio nécessaires). Cela bloque la mise à niveau.',
			'Les paquets de Docker sont retenus (docker-ce). C\'est normal : la mise à niveau n\'y touche pas, et la source de paquets de Docker est mise de côté pendant qu\'elle a lieu.',
		])
	})

	it('says the files of apt\'s configuration that a failure says were left out, in French', async () => {
		await open(core.status_failed_update_many, { props: { locale: 'fr_fr' } })

		expect(text('.os-plan-failure-conf > p')).toBe('Ces fichiers de la configuration d\'apt n\'ont pas servi pour le plan, qui ne lit que des réglages simples du réseau et des paquets recommandés. Si un proxy était réglé dans l\'un d\'eux, le plan n\'a pas pu l\'utiliser, et c\'est peut-être pour cela qu\'il a échoué.')
		expect(texts('.os-plan-failure-conf li').slice(0, 3)).toEqual([
			'01autoremove : Il n\'est pas fait de réglages simples, un par ligne.',
			'15update-stamp : Il n\'est pas fait de réglages simples, un par ligne.',
			'20auto-upgrades : Il règle autre chose que le réseau ou les paquets recommandés.',
		])
		expect(text('.os-plan-failure-conf-cut')).toBe('La liste est coupée : il y en a d\'autres.')
	})

	it('says what to do about a source whose own is not known, in French', async () => {
		await open(failed({ code: 'sources_format', phase: 'sources', detail: '', data: { file: 'x.list', line: 1, reason: 'undecided' } }), { props: { locale: 'fr_fr' } })

		expect(text('.os-plan-reason')).toBe('Le plan n\'a pas pu dire si cette source est celle de la distribution elle-même. Mettez d\'abord à jour les listes de paquets (apt-get update, ou la fenêtre Paquets système), puis refaites le plan.')
	})

	it('says a package that the full upgrade leaves behind, in French', async () => {
		await open(done(core.silent), { props: { locale: 'fr_fr' } })

		expect(text('.os-plan-item-sentence')).toBe('Après la mise à niveau complète, ces paquets resteraient à la version qu\'ils ont maintenant : osp-k. apt ne compte pas toujours ces paquets comme conservés en l\'état. La mise à niveau ne serait pas complète avec eux : elle est donc bloquée.')
	})

	it('says when the plan stopped, and the files of apt\'s configuration that were left out, in French', async () => {
		await open(failed({ code: 'timeout', phase: 'update', detail: '', data: {} }), { props: { locale: 'fr_fr' } })
		expect(text('.os-plan-failed-on')).toMatch(/^Le plan s'est arrêté le .*oct.*2026.*\.$/)

		close()
		await open(done(), { props: { locale: 'fr_fr' } })
		expect(text('.os-plan-conf > p')).toContain('Ces fichiers de la configuration d\'apt n\'ont pas servi pour ce plan')
		expect(texts('.os-plan-conf-files li')).toEqual(['15update-stamp : Il n\'est pas fait de réglages simples, un par ligne.'])
	})

	it('says it all in French, with the date and the sizes in French', async () => {
		getOsRunbook.mockReturnValueOnce(answer(runbook()))
		await open(done(), { props: { locale: 'fr_fr' } })

		expect(text('.os-plan-title')).toBe('Que ferait la mise à niveau ?')
		expect(text('.os-plan-start')).toBe('Refaire le plan')
		expect(text('.os-plan-result')).toBe('Le plan a trouvé des points que vous devriez d\'abord accepter.')
		expect(text('.os-plan-meta')).toMatch(/^Plan p1-5787acb2, établi le .*oct.*2026.*, valable jusqu'au .*oct.*2026.*\.$/)
		expect(text('.os-plan-item-badge')).toBe('Demande votre accord')
		expect(text('.os-plan-item-sentence')).toBe('La mise à niveau supprimerait fuse (2.9.9-5), un paquet installé à la main, pour autant que ReCasaOS puisse le dire. Vous devriez l\'accepter.')
		expect(texts('.os-plan-file > summary')[0]).toBe('sources.list : Réécrit pour la version suivante')
		expect(text('.os-plan-docker')).toBe('La source de paquets de Docker (docker.list) est mise de côté pendant la mise à niveau. Elle est remise en place ensuite si Docker a publié la nouvelle version ; sinon elle reste de côté jusqu\'à ce que vous la remettiez.')
		expect(wrapper.findAll('.os-plan-counts tbody tr').map(cells)[0]).toEqual(['Mis à niveau', '384', '274'])
		expect(text('.os-plan-download')).toBe('Téléchargement : 133 Mio')
		expect(wrapper.findAll('.os-plan-disk tbody tr').map(cells)[1]).toEqual(['/usr', '1,5 Gio', '8 Gio'])
		expect(buttons()).toEqual(expect.arrayContaining(['Refaire le plan', 'Copier le plan']))
		expect(text('details.os-plan-runbook summary')).toBe('Marche à suivre pour le faire à la main')

		await openRunbook()
		expect(buttons()).toEqual(expect.arrayContaining(['Copier la marche à suivre', 'Télécharger le .sh', 'Afficher le texte']))
		expect(text('.os-plan-block .is-no-return')).toBe('Point de non-retour')
		// numbered as the text of the runbook numbers its blocks, from 0
		expect(texts('.os-plan-block').map(title => title.match(/^Bloc (\d) : /)?.[1])).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8'])
	})

	it('says the failures in French', async () => {
		await open(IDLE, { props: { locale: 'fr_fr' } })
		startOsPlan.mockImplementationOnce(failure(refused('no_room', { path: '/var/tmp', need: 671088640, free: 104857600 })))
		await wrapper.find('.os-plan-start').trigger('click')
		await tick()

		expect(text('.os-plan-failure-title')).toBe('Il n\'y a pas assez de place dans /var/tmp pour le dossier temporaire du plan : 640 Mio nécessaires, 100 Mio libres. Libérez de la place, puis réessayez.')
	})

	it('says the step in French', async () => {
		await open(running('update'), { props: { locale: 'fr_fr' } })

		expect(text('.os-plan-step')).toBe('Étape 2 sur 6 : Téléchargement des listes de paquets de la version suivante')
	})
})

// What a screen reader reads, and where the focus goes.
describe('for a screen reader and for the keyboard', () => {
	it('says in words which of the two forms of a line is the one before and the one after, and says nothing of the kind for a line that has one', async () => {
		await opened()
		const lines = wrapper.findAll('.os-plan-file')[0].findAll('.os-plan-line')
		const parts = line => Array.from(line.element.children).map(child => [child.textContent.trim(), child.getAttribute('aria-hidden'), child.className.includes('is-sr-only')])

		expect(parts(lines[2])).toEqual([
			['Line 3', null, false],
			['Before', null, true],
			['deb http://archive.debian.org/debian-security bullseye-security main', null, false],
			['→', 'true', false],
			['After', null, true],
			['deb http://deb.debian.org/debian-security bookworm-security main', null, false],
			['(release name, address)', null, false],
		])
		// a line of a file that is put aside has no second form: there is nothing to tell apart
		const docker = wrapper.findAll('.os-plan-file')[1].findAll('.os-plan-line')[0]
		expect(docker.find('.is-sr-only').exists()).toBe(false)
		expect(docker.find('.os-plan-after').exists()).toBe(false)
	})

	it('says which form is which in French', async () => {
		i18n.global.locale = 'fr_fr'
		await open(done(), { props: { locale: 'fr_fr' } })

		expect(wrapper.findAll('.os-plan-file')[0].findAll('.os-plan-line')[2].findAll('.is-sr-only').map(word => word.text())).toEqual(['Avant', 'Après'])
	})

	it('gives every column of the tables a name, the empty ones by a label', async () => {
		await opened()

		const headers = wrapper.findAll('table th')
		expect(headers.length).toBeGreaterThan(8)
		for (const header of headers)
			expect(header.text() || header.attributes('aria-label'), header.html()).toBeTruthy()
		expect(wrapper.find('.os-plan-counts thead th').attributes('aria-label')).toBe('Packages')
		expect(wrapper.findAll('.os-plan-removals thead th')[2].attributes('aria-label')).toBe('Notes')
	})

	it('names the columns in French too', async () => {
		i18n.global.locale = 'fr_fr'
		await open(done(), { props: { locale: 'fr_fr' } })

		expect(wrapper.find('.os-plan-counts thead th').attributes('aria-label')).toBe('Paquets')
		expect(wrapper.findAll('.os-plan-removals thead th')[2].attributes('aria-label')).toBe('Remarques')
	})

	describe('the focus, when the button that was pressed goes with its answer', () => {
		it('goes to the button that takes the place of the message that the machine could not be asked, once it can be', async () => {
			await open(core.status_unknown, { attachTo: document.body })
			const retry = wrapper.find('.os-plan-ask-again').element
			retry.focus()
			expect(document.activeElement).toBe(retry)

			getOsPlan.mockReturnValueOnce(answer(IDLE))
			await wrapper.find('.os-plan-ask-again').trigger('click')
			await tick()

			expect(wrapper.find('.os-plan-ask-again').exists()).toBe(false)
			expect(document.activeElement).toBe(wrapper.find('.os-plan-start').element)
		})

		it('stays on the button while the machine cannot be asked, and where the owner put it when the answer comes', async () => {
			await open(core.status_unknown, { attachTo: document.body })
			const retry = wrapper.find('.os-plan-ask-again').element
			retry.focus()
			getOsPlan.mockReturnValueOnce(answer(core.status_unknown))
			await wrapper.find('.os-plan-ask-again').trigger('click')
			await tick()
			expect(document.activeElement).toBe(retry)

			// the owner went somewhere else while the answer was out: the focus is not taken from there
			const elsewhere = document.createElement('button')
			document.body.append(elsewhere)
			const out = deferred()
			getOsPlan.mockReturnValueOnce(out.promise)
			await wrapper.find('.os-plan-ask-again').trigger('click')
			elsewhere.focus()
			out.resolve({ data: { data: IDLE } })
			await tick()

			expect(wrapper.find('.os-plan-start').exists()).toBe(true)
			expect(document.activeElement).toBe(elsewhere)
			elsewhere.remove()
		})

		it('goes to the blocks of the runbook that "Try again" brought, and to the button of a failure that came again', async () => {
			getOsRunbook.mockImplementationOnce(failure({ code: 'ECONNABORTED' }))
			await open(done(), { attachTo: document.body })
			await openRunbook()
			wrapper.find('.os-plan-runbook-retry').element.focus()

			getOsRunbook.mockImplementationOnce(failure({ code: 'ECONNABORTED' }))
			await wrapper.find('.os-plan-runbook-retry').trigger('click')
			await tick()
			expect(text('.os-plan-runbook-failure')).toContain('The request took too long.')
			expect(document.activeElement).toBe(wrapper.find('.os-plan-runbook-retry').element)

			getOsRunbook.mockReturnValueOnce(answer(runbook()))
			await wrapper.find('.os-plan-runbook-retry').trigger('click')
			await tick()
			expect(wrapper.find('.os-plan-runbook-failure').exists()).toBe(false)
			expect(document.activeElement).toBe(wrapper.find('.os-plan-runbook-blocks').element)
			expect(wrapper.find('.os-plan-runbook-blocks').attributes('tabindex')).toBe('-1')
			expect(text('.os-plan-runbook-blocks')).toBe('Blocks, in order')
		})

		it('goes to the plan that took the place of the one the runbook was not for, when the button that was pressed goes with it', async () => {
			const NEWER = 'p1-0123456789abcdef0123456789abcdef'
			getOsRunbook.mockReturnValueOnce(answer(runbook({ plan_id: NEWER })))
			await open(done(), { attachTo: document.body })
			await openRunbook()
			const look = wrapper.find('.os-plan-runbook-look').element
			look.focus()
			expect(document.activeElement).toBe(look)

			getOsPlan.mockReturnValueOnce(answer(done(planWith({ plan_id: NEWER }))))
			await wrapper.find('.os-plan-runbook-look').trigger('click')
			await tick()

			expect(wrapper.find('.os-plan-runbook-look').exists()).toBe(false)
			expect(document.activeElement).toBe(wrapper.find('.os-plan-result').element)
		})

		it('leaves the focus where the owner put it while the answer was out, when the plan it looks at is the same', async () => {
			getOsRunbook.mockReturnValueOnce(answer(runbook({ plan_id: 'p1-0123456789abcdef0123456789abcdef' })))
			await open(done(), { attachTo: document.body })
			await openRunbook()
			const elsewhere = document.createElement('button')
			document.body.append(elsewhere)
			const out = deferred()
			getOsPlan.mockReturnValueOnce(out.promise)
			await wrapper.find('.os-plan-runbook-look').trigger('click')
			elsewhere.focus()
			getOsRunbook.mockReturnValueOnce(answer(runbook()))
			out.resolve({ data: { data: done() } })
			await tick()

			expect(wrapper.findAll('.os-plan-block')).toHaveLength(BLOCKS.length)
			expect(document.activeElement).toBe(elsewhere)
			elsewhere.remove()
		})

		it('is not moved when the runbook is opened, where the summary has it', async () => {
			getOsRunbook.mockReturnValueOnce(answer(runbook()))
			await open(done(), { attachTo: document.body })
			const summary = wrapper.find('details.os-plan-runbook summary').element
			summary.focus()
			await openRunbook()

			expect(wrapper.findAll('.os-plan-block')).toHaveLength(BLOCKS.length)
			expect(document.activeElement).toBe(summary)
		})
	})
})

// A language without the sentences reads them in English.
describe('in a language that has no translation yet', () => {
	it('reads English', async () => {
		i18n.global.locale = 'de_de'
		await opened()

		expect(text('.os-plan-title')).toBe('What would the upgrade do?')
		expect(text('.os-plan-result')).toBe('The plan found things you would have to accept first.')
	})
})

describe('the language files', () => {
	// the keys the component asks for directly: its own sentences, and the ones it picks between with a word of its own
	const asked = [...source.matchAll(/\$t\(\s*'((?:[^'\\]|\\.)*)'/g)].map(match => match[1].replace(/\\'/g, '\''))
	const either = [...source.matchAll(/\$t\(\w+ \? '((?:[^'\\]|\\.)*)' : '((?:[^'\\]|\\.)*)'/g)].flatMap(match => [match[1], match[2]].map(key => key.replace(/\\'/g, '\'')))
	const keys = [...new Set([...asked, ...either])]

	it('has them all, and a good many', () => {
		expect(keys.length).toBeGreaterThanOrEqual(45)
		for (const key of ['What would the upgrade do?', 'See what the upgrade would do', 'Make the plan again', 'Download .sh', 'Hide the text', 'Disk space the upgrade would free: {size}'])
			expect(keys).toContain(key)
	})

	it.each(keys)('says "%s" in English and French', (key) => {
		expect(en[key]).toBe(key)
		expect(fr[key]).toBeTruthy()
		// a word that is the same in both languages has nothing to translate
		if (/\s/.test(key))
			expect(fr[key]).not.toBe(key)
		// in the order of the English
		expect(fr[key].match(/\{\w+\}/g) || []).toEqual(key.match(/\{\w+\}/g) || [])
		// French sets a space before : ? ! ; and a percent sign, and the English text has none to copy
		expect(fr[key]).not.toMatch(/\S[:?!;]/)
		expect(fr[key]).not.toMatch(/[^\s%]%/)
	})
})

// The plan that the section which starts the upgrade is handed: the one on the screen, as the core sent it, and none when there is none
describe('the plan handed to the section that starts the upgrade', () => {
	const handed = () => (wrapper.emitted('plan') ?? []).map(args => args[0])

	it('is nothing until a plan is on the screen, and then the plan as the core sent it', async () => {
		await open()
		await start(running('parse'))
		expect(handed()).toEqual([])

		getOsPlan.mockReturnValueOnce(answer(done()))
		await tick(1000)
		expect(handed()).toEqual([real])
	})

	it('is the plan of a window that opens on one', async () => {
		await opened()

		expect(handed()).toEqual([real])
	})

	it('is none again while a new plan is being made', async () => {
		await opened()
		await start(running('sources'))

		expect(handed()).toEqual([real, null])
	})

	it('is none once the plan has run out, by the clock of this machine and the word of the core', async () => {
		await opened()
		await tick(25 * HOUR)

		expect(handed()).toEqual([real, null])
	})

	it('is none when the readiness report says that there is no plan to offer', async () => {
		await opened()
		await wrapper.setProps({ readinessState: 'latest' })

		expect(handed()).toEqual([real, null])
	})
})
