// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import Buefy, { BModal } from 'buefy'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import OsUpgradeRun from './OsUpgradeRun.vue'
import { ACK_TEXTS, BUTTONS, BUTTON_LABELS, POLL_MS, RESTART_LOOK_AFTER_MS, SAFETY_NET_TEXTS, TEXT, statusView } from './osUpgrade'
import real from './__fixtures__/os-plan-d11-12.json'
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

// From the project root: import.meta.url is not a file URL under happy-dom.
const source = readFileSync('src/components/settings/OsUpgradeRun.vue', 'utf8')

// ---- what the core answers ----------------------------------------------------------------------------------------------

const NOW = new Date('2026-10-17T12:00:00Z')
const SINCE = '2026-10-17T10:00:00Z'
const RUN = '0b9cbd61-5d2c-4a39-9c3e-2f7c0a1d6a11'
const BK = '/var/backups/casaos-os-upgrade-p1-0123456789abcdef0123456789abcdef'
const ACK_WORD = 'I-KNOW-THIS-MACHINE-IS-HALF-UPGRADED'

// a status as the core makes it
function status(changes = {}) {
	return {
		beta_enabled: true,
		state: 'idle',
		hop: 'debian-11-12',
		attempt: 0,
		pnr: false,
		reversible: true,
		half_upgraded: false,
		busy: false,
		since: null,
		last_activity_at: null,
		manual: { blocks_done: [], pnr: false, bk_path: '' },
		actions: [],
		boot_unknown: false,
		ignored_markers: 0,
		log_tail: [],
		...changes,
	}
}

const block = (index, id, title = '') => ({ index, id, title })
const hint = { bk_path: BK, log: `/var/lib/casaos/os-upgrade/${RUN}/output.log`, commands: ['uname -r', 'systemctl --failed --no-pager', 'dpkg --audit', `ls ${BK}`], block8: '# block 8\necho after' }
const barrierOk = { ok: true, checks: [{ code: 'fstab_unresolved', ok: true, severity: 'ok' }, { code: 'fstab_network', ok: true, severity: 'ok' }] }
const barrierRed = { ok: false, checks: [{ code: 'fstab_unresolved', ok: false, severity: 'refuse' }, { code: 'fstab_network', ok: true, severity: 'ok' }, { code: 'prereboot_warning', ok: true, severity: 'warn', arg: 'initrd_small' }] }

// One status for each state of the core (osrun.States), with the buttons the core lists for it (osrun.ActionsFor) and the group of the page it
// belongs to. This table mirrors the core's: the list of states in osUpgrade.spec.js pins it.
const CASES = {
	idle: { group: 'idle', actions: [] },
	refreshing: { group: 'working', extra: { kind: 'refresh', phase: 'refresh', block: block(2, 'rsources'), busy: true }, actions: ['abort'] },
	reboot_first: { group: 'waiting', extra: { kind: 'refresh', busy: true, since: SINCE }, actions: ['reboot', 'acknowledge'] },
	refreshed: { group: 'done', extra: { kind: 'refresh', since: SINCE }, actions: ['acknowledge'] },
	rehearsing: { group: 'working', extra: { kind: 'rehearsal', phase: 'rehearse', block: block(3, 'snapshot'), busy: true }, actions: ['abort'] },
	rehearsed: { group: 'waiting', extra: { kind: 'rehearsal', busy: true, expires_at: '2026-10-17T10:30:00Z' }, actions: ['discard'] },
	rehearsal_done: { group: 'done', extra: { kind: 'rehearsal' }, actions: ['acknowledge'] },
	running: { group: 'working', extra: { kind: 'hop', phase: 'run', block: block(7, 'full', 'the full upgrade, and until nothing is left to do'), busy: true, pnr: true, half_upgraded: true }, actions: [] },
	unwinding: { group: 'working', extra: { kind: 'hop', phase: 'unwind', busy: true }, actions: [] },
	recovering: { group: 'working', extra: { kind: 'hop', phase: 'recover', block: block(1, 'forward'), busy: true, pnr: true, half_upgraded: true }, actions: [] },
	awaiting_reboot: { group: 'waiting', extra: { kind: 'hop', busy: true, pnr: true, barrier: barrierOk, after_reboot_hint: hint }, actions: ['reboot', 'takeover'] },
	rebooting: { group: 'working', extra: { kind: 'hop', busy: true, pnr: true, reboot: { requested_at: SINCE, stalled: false }, barrier: barrierOk, after_reboot_hint: hint }, actions: [] },
	reboot_stalled: { group: 'waiting', extra: { kind: 'hop', busy: true, pnr: true, reboot: { requested_at: SINCE, stalled: true }, barrier: barrierOk, after_reboot_hint: hint }, actions: ['reboot', 'takeover'] },
	resuming: { group: 'working', extra: { kind: 'hop', busy: true, pnr: true }, actions: [] },
	verifying: { group: 'working', extra: { kind: 'hop', phase: 'verify', block: block(1, 'after'), busy: true, pnr: true }, actions: [] },
	succeeded: { group: 'done', extra: { kind: 'hop', pnr: true }, actions: ['acknowledge'] },
	succeeded_with_findings: { group: 'done', extra: { kind: 'hop', pnr: true, findings: [{ code: 'ports_missing', severity: 'warn', arg: '8080/tcp' }] }, actions: ['resume', 'acknowledge'] },
	failed: { group: 'stopped', extra: { kind: 'hop', reason: 'network', failure: { stage: 'download', class: 'network', rc: 100, detail_line: 'STOP: could not download' } }, actions: ['acknowledge', 'discard'] },
	interrupted: { group: 'stopped', extra: { kind: 'hop', cause: 'killed', busy: true }, actions: [] },
	stopped_at_waypoint: { group: 'stopped', extra: { kind: 'hop', pnr: true, half_upgraded: true, busy: true, ack_word: ACK_WORD, failure: { stage: 'full', class: 'disk', rc: 1, detail_line: 'STOP: no space left' } }, actions: ['resume', 'acknowledge', 'takeover'] },
	needs_attention: { group: 'attention', extra: { kind: 'hop', reason: 'run_damaged', busy: true, half_upgraded: true, ack_word: ACK_WORD }, actions: ['acknowledge', 'takeover'] },
	manual: { group: 'manual', extra: { kind: 'hop', busy: true, pnr: true, half_upgraded: true, ack_word: ACK_WORD, manual: { blocks_done: ['verify', 'timers'], next_block: 'snapshot', pnr: false, bk_path: BK } }, actions: ['acknowledge'] },
	manual_done: { group: 'manual', extra: { kind: 'hop', pnr: true }, actions: ['acknowledge'] },
}
const STATES = Object.keys(CASES)
const caseOf = (state, extra = {}) => status({ state, run_id: state === 'idle' ? '' : RUN, ...CASES[state].extra, actions: CASES[state].actions, ...extra })

// the plan of the measured box: one removal (fuse, installed by hand) and one source put aside (docker.list)
const planWith = (changes = {}) => ({ ...structuredClone(real), ...changes })
const PLAIN = planWith({ problems: [], removals: [], paused: [] })

// a refusal of the core: a 409 with its code in data.error_code
const refused = (error_code, data, code = 409) => ({ response: { status: code, data: { success: code, message: 'x', data: { error_code, error: 'a sentence of the core', data } } } })

// ---- the mocked client --------------------------------------------------------------------------------------------------

const calls = Object.fromEntries(['getOsUpgradeStatus', 'setOsUpgradeBeta', 'startOsRefresh', 'startOsUpgrade', 'rebootOsUpgrade', 'resumeOsUpgrade', 'abortOsUpgrade', 'ackOsUpgrade', 'getOsUpgradeRunbook'].map(name => [name, vi.fn()]))
const getStatus = calls.getOsUpgradeStatus
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

// the time moves, and every answer that is waiting for it is let in, and the page drawn
async function tick(ms = 0) {
	await vi.advanceTimersByTimeAsync(ms)
	await nextTick()
}

// the core says `first` (and then the same again)
function serve(first) {
	getStatus.mockReset()
	getStatus.mockImplementation(() => answer(first))
}

// the window opened, and the core's first answer in
async function open(first = status(), props = {}, options = {}) {
	if (first)
		serve(first)
	wrapper = mount(OsUpgradeRun, {
		attachTo: document.body,
		props: { locale: 'en_us', canCheck: true, ...props },
		global: { plugins: [Buefy, i18n], mocks: { $api: { sys: calls } } },
		...options,
	})
	await tick()
	return wrapper
}

function close() {
	wrapper?.unmount()
	wrapper = null
}

// the control characters but the end of a line and the tab, and the marks that turn a text round
function unsafeIn(value) {
	return [...value].filter((char) => {
		const code = char.codePointAt(0)
		return (code < 32 && char !== String.fromCharCode(10) && char !== String.fromCharCode(9)) || (code >= 127 && code <= 159) || (code >= 0x202A && code <= 0x202E) || (code >= 0x2066 && code <= 0x2069)
	})
}

const text = selector => wrapper.find(selector).text()
const texts = selector => wrapper.findAll(selector).map(item => item.text())
const buttonLabels = () => texts('.os-run-button')
const dialog = () => wrapper.find('.os-run-dialog')

// a button pressed, and the page drawn
async function press(selector) {
	await wrapper.find(selector).trigger('click')
	await tick()
}

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(NOW)
	i18n.global.locale = 'en_us'
	for (const fn of [...Object.values(calls), copy])
		fn.mockReset()
	for (const name of ['setOsUpgradeBeta', 'startOsRefresh', 'startOsUpgrade', 'rebootOsUpgrade', 'resumeOsUpgrade', 'abortOsUpgrade', 'ackOsUpgrade'])
		calls[name].mockImplementation(() => answer({}))
	delete document.hidden
})

afterEach(() => {
	close()
	document.body.innerHTML = ''
	vi.useRealTimers()
})

// ---- when it is there -----------------------------------------------------------------------------------------------------

describe('the run section, when it is shown', () => {
	it('is not there before the core has answered, and asks once on its own', async () => {
		const first = deferred()
		getStatus.mockReturnValue(first.promise)
		wrapper = mount(OsUpgradeRun, { attachTo: document.body, props: { canCheck: true }, global: { plugins: [Buefy, i18n], mocks: { $api: { sys: calls } } } })
		await tick()

		expect(wrapper.find('.os-run').exists()).toBe(false)
		expect(getStatus).toHaveBeenCalledTimes(1)
		first.resolve({ data: { data: status() } })
		await tick()
		expect(wrapper.find('.os-run').exists()).toBe(true)
	})

	it('says nothing when no run is open and the machine cannot be checked', async () => {
		await open(status(), { canCheck: false })

		expect(wrapper.find('.os-run').exists()).toBe(false)
		expect(wrapper.text()).toBe('')
	})

	it('is there for a run that is open, whether or not the machine can be checked', async () => {
		await open(caseOf('succeeded'), { canCheck: false })

		expect(text('.os-run-title')).toBe('Upgrade of the operating system')
		expect(text('.os-run-state-title')).toBe('Upgrade done')
	})

	it('is there for a machine that can be checked, with nothing open: the switch, and the state in words', async () => {
		await open(status({ beta_enabled: false }))

		expect(text('.os-run-state-title')).toBe('No upgrade is open')
		expect(text('.os-run-beta-state')).toBe('The upgrade is switched off.')
		expect(wrapper.find('.os-run-button').exists()).toBe(false)
		// switched off: nothing that starts anything is offered
		expect(wrapper.find('.os-run-refresh').exists()).toBe(false)
		expect(wrapper.find('.os-run-start').exists()).toBe(false)
	})

	it('is hidden when the core does not have the route (404), and goes on asking', async () => {
		serve(null)
		getStatus.mockImplementation(failure({ response: { status: 404 } }))
		await open(null)

		expect(wrapper.find('.os-run').exists()).toBe(false)
		expect(wrapper.text()).toBe('')
		await tick(POLL_MS.error)
		expect(getStatus).toHaveBeenCalledTimes(2)
	})

	it('says it could not read the state, when a machine that can be checked gets no answer at the start', async () => {
		getStatus.mockImplementation(failure({}))
		await open(null)

		expect(text('.os-run-outage-message')).toBe('The state of the upgrade could not be read just now. This page tries again by itself.')
		expect(wrapper.find('.os-run-state').exists()).toBe(false)
	})

	it('is the same after a 404 while a run is open: the core is away, not older', async () => {
		await open(caseOf('rebooting'))
		getStatus.mockImplementation(failure({ response: { status: 404 } }))
		await tick(POLL_MS.open)

		expect(wrapper.find('.os-run').exists()).toBe(true)
		expect(text('.os-run-outage-message')).toBe('The machine is restarting. This page goes on by itself.')
	})
})

// ---- the states -----------------------------------------------------------------------------------------------------------

describe('the state card', () => {
	it.each(STATES)('shows %s: its title, its group in words, and exactly the buttons of the server, in its order', async (state) => {
		const raw = caseOf(state)
		const view = statusView(raw)
		await open(raw)

		expect(text('.os-run-state-title')).toBe(view.title)
		expect(wrapper.find('.os-run-state').classes()).toContain(`is-group-${CASES[state].group}`)
		expect(text('.os-run-group')).toBe(TEXT.groups[CASES[state].group])
		expect(text('.os-run-what')).toBe(view.what)
		expect(buttonLabels()).toEqual(CASES[state].actions.map(action => view.buttons.find(button => button.action === action).label))
		expect(wrapper.findAll('.os-run-button')).toHaveLength(CASES[state].actions.length)
		// a state is told by words and not by colour alone, and its code is there for support
		expect(text('.os-run-codes')).toContain(state)
	})

	it('shows no button that the server did not list, and none for a list that is empty', async () => {
		await open(caseOf('running', { actions: [] }))
		expect(wrapper.find('.os-run-button').exists()).toBe(false)
		close()

		// a state whose usual buttons are others: the page shows what it is told
		await open(caseOf('running', { actions: ['reboot'] }))
		expect(buttonLabels()).toEqual(['Restart the machine now'])
		close()

		// an action the page does not know has no button; one named twice is shown once
		await open(caseOf('failed', { actions: ['launch_missiles', 'discard', 'discard', 'acknowledge'] }))
		expect(buttonLabels()).toEqual(['Close this run and drop the plan', 'Close this run'])
	})

	it('says the point of no return, the half upgraded machine and the held backups as banners', async () => {
		await open(caseOf('stopped_at_waypoint'))

		expect(texts('.os-run-banner')).toEqual([
			'The point of no return is behind: there is no way back except your snapshot.',
			'The machine is half upgraded.',
			'Backups and automatic updates are held while this goes on.',
		])
		close()
		await open(caseOf('rehearsing'))
		expect(texts('.os-run-banner')).toEqual(['Backups and automatic updates are held while this goes on.'])
	})

	it('has the summary line: the kind, the path, the block that runs with a progress bar that has a name, and the moments', async () => {
		await open(caseOf('running', { last_activity_at: '2026-10-17T10:05:00Z', since: SINCE }))

		expect(texts('.os-run-fact')).toEqual([
			'Kind of run: Upgrade',
			'Upgrade path: debian-11-12',
			'Step 7 of 8: the full upgrade, and until nothing is left to do',
			expect.stringMatching(/^Since: /),
			expect.stringMatching(/^Last activity: /),
		])
		const progress = wrapper.find('progress.os-run-progress')
		expect(progress.attributes('aria-label')).toBe('Progress of the upgrade: step 7 of 8')
		expect(progress.attributes('value')).toBe('7')
		expect(progress.attributes('max')).toBe('8')
	})

	it('says the title of a block in French when the language has it', async () => {
		i18n.global.locale = 'fr_fr'
		await open(caseOf('running', { block: block(7, 'full', 'the full upgrade, and until nothing is left to do') }), { locale: 'fr_fr' })

		expect(text('.os-run-fact.is-block')).not.toContain('the full upgrade')
		expect(text('.os-run-fact.is-block')).toContain('Étape 7 sur 8')
	})

	it('says a state it does not know as such, with the raw state as text and no button', async () => {
		await open(status({ state: 'teleporting', run_id: RUN, actions: ['reboot', 'abort', 'acknowledge'] }))

		expect(text('.os-run-state-title')).toBe('This page does not know this state')
		expect(text('.os-run-unknown')).toBe('teleporting')
		expect(wrapper.find('.os-run-button').exists()).toBe(false)
		expect(wrapper.find('.os-run-word').exists()).toBe(false)
	})

	it('says why a run stopped, what to do, and the line of the output as text', async () => {
		await open(caseOf('failed'))

		expect(text('.os-run-failure-title')).toBe('Why it stopped')
		expect(text('.os-run-failure-what')).toBe('A download or an update did not go through.')
		expect(text('.os-run-failure-next')).toBe('What you do: Check the network and the name server of the machine, then go on.')
		expect(text('.os-run-failure-stage')).toBe('Stopped in: download')
		expect(text('.os-run-failure-rc')).toBe('Exit status: 100')
		expect(text('.os-run-failure-detail')).toBe('The line of the output of the upgrade that says why: STOP: could not download')
	})

	it('lists the checks that stand before the restart, and holds the restart back in words', async () => {
		await open(caseOf('awaiting_reboot', { barrier: barrierRed }))

		expect(text('.os-run-barrier .os-run-list-title')).toBe('Before the restart')
		const items = texts('.os-run-barrier .os-run-item')
		expect(items).toHaveLength(2)
		expect(items[0]).toContain('Error')
		expect(items[0]).toContain('A disk or partition listed in /etc/fstab cannot be found')
		expect(items[0]).toContain('fstab_unresolved')
		expect(items[1]).toContain('Warning')
		expect(items[1]).toContain('The initramfs of the new kernel is under 5 MiB')
		expect(text('.os-run-barrier-blocked')).toBe('The restart is not offered until this is mended.')
	})

	it('lists the findings, what was not judged and the containers that did not come back, with the codes beside as text', async () => {
		await open(caseOf('succeeded_with_findings', {
			findings: [{ code: 'ports_missing', severity: 'warn', arg: '8080/tcp' }, { code: 'kernel_unexpected', severity: 'error' }, { code: 'never_heard_of', severity: 'info' }],
			not_judged: ['dns', 'bk:/var/backups/x', 'moon_phase'],
			not_returned: [{ container: 'nextcloud', policy: 'always' }, { container: 'orphan' }],
		}))

		const findings = texts('.os-run-findings .os-run-item')
		// the errors first
		expect(findings[0]).toContain('The machine runs another kernel than the one the upgrade installed.')
		expect(findings[0]).toContain('Error')
		expect(findings[1]).toContain('Ports that were listened on before the upgrade are not listened on now.')
		expect(findings[1]).toContain('8080/tcp')
		expect(findings[2]).toContain('A finding this page does not know: never_heard_of.')
		expect(texts('.os-run-not-judged .os-run-item')).toEqual([
			'the name resolver',
			'a note that the upgrade took before the restart/var/backups/x',
			'a fact this page does not know: moon_phase',
		])
		expect(texts('.os-run-not-returned .os-run-item')).toEqual([
			'The container nextcloud does not run (restart policy always).',
			'The container orphan does not run.',
		])
	})

	it('says where a run taken over stands', async () => {
		await open(caseOf('manual'))

		expect(text('.os-run-manual-done')).toBe('Blocks done: Block 0, Block 1')
		expect(text('.os-run-manual-next')).toBe('Next block: Block 2')
		expect(text('.os-run-manual-pnr')).toBe('The point of no return is not reached')
		expect(text('.os-run-manual-folder')).toBe(`Backup folder: ${BK}`)
	})

	it('shows the information of a unit that has gone quiet, with its commands to copy and no button that stops it', async () => {
		const commands = ['journalctl -u casaos-os-upgrade -n 50', 'ps aux | grep apt']
		await open(caseOf('running', { actions: ['abort'], hint: { code: 'unit_quiet', quiet_seconds: 1800, commands } }))

		expect(text('.os-run-hint-message')).toContain('The upgrade has printed nothing for 30 minutes.')
		expect(texts('.os-run-hint .os-copy-text')).toEqual(commands)
		expect(text('.os-run-hint-note')).toBe('ReCasaOS never runs these for you.')
		expect(buttonLabels()).toEqual(['Stop and put the machine back'])
		await wrapper.find('.os-run-hint .os-copy-button').trigger('click')
		await tick()
		expect(copy).toHaveBeenCalledWith(commands[0])
	})

	it('shows the end of the output of the upgrade as text in a box of its own, and says so when there is none yet', async () => {
		await open(caseOf('running', { log_tail: ['Setting up libc6', 'Processing triggers'] }))
		expect(text('.os-run-log-text')).toBe('Setting up libc6\nProcessing triggers')
		close()

		await open(caseOf('running'))
		expect(text('.os-run-log-empty')).toBe('The upgrade has printed nothing yet.')
	})
})

// ---- the core's words are text ----------------------------------------------------------------------------------------------

describe('what the core says', () => {
	// short enough to be kept whole by the shortest of the cuts the page makes
	const HTML = '<img src=x onerror=window.p=1><b>b</b>'

	it('is shown as text in every field, never as HTML', async () => {
		await open(caseOf('stopped_at_waypoint', {
			hop: HTML,
			block: block(5, 'minimal', HTML),
			kind: 'hop',
			failure: { stage: HTML, class: 'apt_failed', rc: 100, detail_line: HTML },
			log_tail: [HTML],
			findings: [{ code: 'ports_missing', severity: 'warn', arg: HTML, apps: [HTML] }],
			not_judged: [`bk:${HTML}`],
			not_returned: [{ container: HTML, policy: HTML }],
			manual: { blocks_done: [HTML], next_block: HTML, pnr: true, bk_path: HTML },
			after_reboot_hint: { bk_path: HTML, log: HTML, commands: [HTML], block8: HTML },
			hint: { code: 'unit_quiet', quiet_seconds: 120, commands: [HTML] },
			barrier: { ok: false, checks: [{ code: HTML, ok: false, arg: HTML }, { code: 'prereboot_warning', ok: true, arg: HTML }] },
		}))

		const section = wrapper.find('.os-run')
		expect(section.findAll('img, script, b, a, svg, iframe')).toHaveLength(0)
		expect(section.html()).not.toMatch(/<(img|script|b|iframe)[\s>]/)
		expect(window.p).toBeUndefined()
		// the text of it is there: it is not dropped
		expect(text('.os-run-failure-detail')).toContain(HTML)
		expect(text('.os-run-fact.is-hop')).toContain(HTML)
		expect(text('.os-run-log-text')).toContain(HTML)
		expect(text('.os-run-item-arg')).toContain(HTML)
	})

	it('is cleaned of the control characters and the marks that turn a text round', async () => {
		const flip = String.fromCharCode(0x202E)
		const [bell, nul, esc] = [7, 0, 27].map(code => String.fromCharCode(code))
		await open(caseOf('failed', { failure: { stage: 'download', class: 'network', rc: 1, detail_line: `STOP${bell} ${flip}evil${nul} line` }, log_tail: [`a${esc}[31mred${flip}`] }))

		expect(text('.os-run-failure-detail')).toContain('STOP')
		expect(unsafeIn(wrapper.text())).toEqual([])
		expect(unsafeIn(wrapper.html())).toEqual([])
	})

	it('is cut when it is huge, and does not stop the page', async () => {
		const huge = 'x'.repeat(2_000_000)
		await open(caseOf('failed', { failure: { stage: huge, class: huge, rc: 1, detail_line: huge }, log_tail: [huge, huge], hop: huge }))

		expect(wrapper.find('.os-run-state').exists()).toBe(true)
		expect(wrapper.html().length).toBeLessThan(20000)
	})

	it('never reaches a toast: the page has no call to one with the core\'s words', () => {
		// a toast renders its message as HTML: the only toast of the page says "Copied to clipboard", from the language file
		expect(source.match(/toast\.open/g) ?? []).toHaveLength(0)
		expect(readFileSync('src/components/settings/OsUpgradeCopyable.vue', 'utf8').match(/toast\.open\(\{ message: this\.\$t\('Copied to clipboard'\)/g)).toHaveLength(1)
		expect(source).not.toMatch(/v-html|innerHTML|insertAdjacentHTML|\$buefy\.dialog/)
	})

	it('has refusals that are sentences of the page, with what they name as text', async () => {
		await open(caseOf('failed'))
		calls.ackOsUpgrade.mockImplementation(failure(refused('acks_missing', { missing: ['no_way_back', HTML] })))
		await press('.os-run-button.is-acknowledge')

		expect(text('.os-run-call-sentence')).toBe('Tick every box that the upgrade asks for.')
		expect(wrapper.find('.os-run-call').findAll('img, script, b')).toHaveLength(0)
		expect(text('.os-run-call-items')).toContain(ACK_TEXTS.no_way_back)
		expect(text('.os-run-call-items')).toContain(HTML)
	})
})

// ---- the clicks ---------------------------------------------------------------------------------------------------------------

describe('the buttons', () => {
	it('go on: one click makes one call, with an empty body, and the core is asked for the status at once', async () => {
		await open(caseOf('stopped_at_waypoint', { ack_word: '' }))
		const asked = getStatus.mock.calls.length
		await press('.os-run-button.is-resume')

		expect(calls.resumeOsUpgrade).toHaveBeenCalledTimes(1)
		expect(calls.resumeOsUpgrade).toHaveBeenCalledWith({})
		// not after the next poll: at once
		expect(getStatus.mock.calls.length).toBe(asked + 1)
	})

	it('closes a run with its word: the button stays shut until the word is the one the core asks for', async () => {
		await open(caseOf('stopped_at_waypoint'))
		const button = () => wrapper.find('.os-run-button.is-acknowledge')

		expect(text('.os-run-word-help')).toContain(ACK_WORD)
		expect(button().attributes('disabled')).toBeDefined()
		for (const wrong of ['', 'i-know-this-machine-is-half-upgraded', `${ACK_WORD}-`, 'I-KNOW']) {
			await wrapper.find('.os-run-word-input').setValue(wrong)
			expect(button().attributes('disabled')).toBeDefined()
		}
		await wrapper.find('.os-run-word-input').setValue(`  ${ACK_WORD} `)
		expect(button().attributes('disabled')).toBeUndefined()
		await press('.os-run-button.is-acknowledge')

		expect(calls.ackOsUpgrade).toHaveBeenCalledTimes(1)
		expect(calls.ackOsUpgrade).toHaveBeenCalledWith({ action: 'acknowledge', word: ACK_WORD })
	})

	it('closes a run that needs no word with the word empty, and drops a plan without being asked for one', async () => {
		await open(caseOf('failed'))
		expect(wrapper.find('.os-run-word').exists()).toBe(false)

		await press('.os-run-button.is-acknowledge')
		await press('.os-run-button.is-discard')

		expect(calls.ackOsUpgrade.mock.calls).toEqual([[{ action: 'acknowledge', word: '' }], [{ action: 'discard', word: '' }]])
	})

	it('does not send the typed word with a take-over or a discard: the word is for closing', async () => {
		await open(caseOf('stopped_at_waypoint', { actions: ['acknowledge', 'discard', 'takeover'] }))
		await wrapper.find('.os-run-word-input').setValue(ACK_WORD)
		await press('.os-run-button.is-takeover')
		await press('.os-run-dialog-ok')
		expect(calls.ackOsUpgrade.mock.calls).toEqual([[{ action: 'manual', word: '' }]])

		// the word was for the state it was typed in: it is typed again
		await wrapper.find('.os-run-word-input').setValue(ACK_WORD)
		await press('.os-run-button.is-discard')
		expect(calls.ackOsUpgrade.mock.calls).toEqual([[{ action: 'manual', word: '' }], [{ action: 'discard', word: '' }]])
	})

	it('names the check again, and the putting back, as the buttons they are', async () => {
		await open(caseOf('succeeded_with_findings'))
		expect(buttonLabels()).toEqual([BUTTON_LABELS.checkAgain, BUTTONS.acknowledge.label])
		close()
		await open(caseOf('rehearsed'))
		expect(buttonLabels()).toEqual([BUTTON_LABELS.putBack])
	})

	it('make one call and not two for a second click while the first is out', async () => {
		await open(caseOf('stopped_at_waypoint', { ack_word: '' }))
		const out = deferred()
		calls.resumeOsUpgrade.mockReturnValue(out.promise)
		const element = wrapper.find('.os-run-button.is-resume').element

		// two clicks in the same breath, before the page has drawn the disabled button
		element.click()
		element.click()
		await tick()
		element.click()
		await tick()

		expect(calls.resumeOsUpgrade).toHaveBeenCalledTimes(1)
		const resume = wrapper.find('.os-run-button.is-resume')
		expect(resume.attributes('disabled')).toBeDefined()
		expect(resume.classes()).toContain('is-loading')
		// the other buttons wait too: one request at a time
		expect(wrapper.find('.os-run-button.is-acknowledge').attributes('disabled')).toBeDefined()
		out.resolve({ data: { data: {} } })
		await tick()
		expect(wrapper.find('.os-run-button.is-resume').attributes('disabled')).toBeUndefined()
	})

	it('make one call for a second click on the refresh and on the switch, which have no window to ask first', async () => {
		await open(status())
		const out = deferred()
		calls.startOsRefresh.mockReturnValue(out.promise)
		const refresh = wrapper.find('.os-run-refresh-button').element
		refresh.click()
		refresh.click()
		// and the switch, in the same breath, is not another call
		wrapper.find('.os-run-beta-switch').element.click()
		await tick()

		expect(calls.startOsRefresh).toHaveBeenCalledTimes(1)
		expect(calls.setOsUpgradeBeta).not.toHaveBeenCalled()
		expect(wrapper.find('.os-run-refresh-button').classes()).toContain('is-loading')
		out.resolve({ data: { data: {} } })
		await tick()
		expect(wrapper.find('.os-run-refresh-button').classes()).not.toContain('is-loading')
	})

	it('stay shut after a call until the status that follows it is in, so that the old state cannot be acted on twice', async () => {
		await open(caseOf('stopped_at_waypoint', { ack_word: '' }))
		const followUp = deferred()
		getStatus.mockImplementationOnce(() => followUp.promise)
		await press('.os-run-button.is-resume')

		// the call is done, the status is not: the page still shows the old state, and its buttons are shut
		expect(calls.resumeOsUpgrade).toHaveBeenCalledTimes(1)
		const resume = wrapper.find('.os-run-button.is-resume')
		expect(resume.attributes('disabled')).toBeDefined()
		expect(wrapper.find('.os-run-button.is-takeover').attributes('disabled')).toBeDefined()
		resume.element.click()
		await tick()
		expect(calls.resumeOsUpgrade).toHaveBeenCalledTimes(1)

		followUp.resolve({ data: { data: caseOf('resuming') } })
		await tick()
		expect(wrapper.find('.os-run-button').exists()).toBe(false)
		expect(text('.os-run-state-title')).toBe('Getting ready to check')
	})

	it('keep the window of a confirmation open, with its button busy, until the status that follows is in', async () => {
		await open(caseOf('awaiting_reboot'))
		await press('.os-run-button.is-reboot')
		const followUp = deferred()
		getStatus.mockImplementationOnce(() => followUp.promise)
		await press('.os-run-dialog-ok')

		expect(calls.rebootOsUpgrade).toHaveBeenCalledTimes(1)
		expect(dialog().exists()).toBe(true)
		expect(wrapper.find('.os-run-dialog-ok').classes()).toContain('is-loading')
		wrapper.find('.os-run-dialog-ok').element.click()
		await tick()
		expect(calls.rebootOsUpgrade).toHaveBeenCalledTimes(1)

		followUp.resolve({ data: { data: caseOf('rebooting') } })
		await tick()
		expect(dialog().exists()).toBe(false)
		expect(calls.rebootOsUpgrade).toHaveBeenCalledTimes(1)
	})

	it('give back the promise of the whole of the asks when they only ask to be followed', async () => {
		await open(caseOf('running'))
		const out = deferred()
		const again = deferred()
		getStatus.mockReturnValueOnce(out.promise).mockReturnValueOnce(again.promise)
		await tick(POLL_MS.open)
		let done = false
		wrapper.vm.poll().then(() => {
			done = true
		})
		await tick()
		expect(done).toBe(false)

		// the ask that was out comes back, and the one that was asked for after it is out in its turn
		out.resolve({ data: { data: caseOf('running') } })
		await tick()
		expect(done).toBe(false)
		expect(getStatus).toHaveBeenCalledTimes(3)
		again.resolve({ data: { data: caseOf('running') } })
		await tick()
		expect(done).toBe(true)
	})

	it('open no window for a click that comes while a call is out', async () => {
		await open(caseOf('stopped_at_waypoint', { ack_word: '', actions: ['resume', 'takeover'] }))
		calls.resumeOsUpgrade.mockReturnValue(deferred().promise)

		wrapper.find('.os-run-button.is-resume').element.click()
		wrapper.find('.os-run-button.is-takeover').element.click()
		await tick()

		expect(calls.resumeOsUpgrade).toHaveBeenCalledTimes(1)
		expect(dialog().exists()).toBe(false)
	})

	it('say a refusal in a sentence of the page, by its code, and ask the core what it says now', async () => {
		await open(caseOf('failed'))
		calls.ackOsUpgrade.mockImplementation(failure(refused('not_terminal', {})))
		const asked = getStatus.mock.calls.length
		await press('.os-run-button.is-acknowledge')

		expect(text('.os-run-call-sentence')).toBe('The upgrade is not in a state that this button is for. The state it is in now is shown above.')
		expect(text('.os-run-call-code')).toBe('not_terminal')
		expect(wrapper.find('.os-run-call').attributes('role')).toBe('alert')
		expect(getStatus.mock.calls.length).toBe(asked + 1)
	})

	it.each([
		['reboot', 'awaiting_reboot', 'rebootOsUpgrade'],
		['resume', 'stopped_at_waypoint', 'resumeOsUpgrade'],
		['abort', 'rehearsing', 'abortOsUpgrade'],
		['acknowledge', 'failed', 'ackOsUpgrade'],
	])('say that %s may have gone through when the network gave no answer at all', async (action, state, call) => {
		await open(caseOf(state, { ack_word: '' }))
		calls[call].mockImplementation(failure({ message: 'Network Error' }))
		await press(`.os-run-button.is-${action}`)
		if (dialog().exists())
			await press('.os-run-dialog-ok')

		expect(text('.os-run-call-sentence')).toBe('The request took too long. It may have gone through: the state above is what the machine says now.')
	})

	it('say a start that got no answer at all in the same words, in its window', async () => {
		await open(status(), { plan: real })
		calls.startOsUpgrade.mockImplementation(failure({ message: 'Network Error' }))
		await press('.os-run-hop')
		await wrapper.find('input[name="os-run-safety-net"][value="snapshot"]').setValue(true)
		await wrapper.find('#os-run-hostname').setValue('stagevet-box')
		for (const ack of ['no_interruption', 'no_way_back', 'sources_paused', 'removals_read'])
			await wrapper.find(`input[type="checkbox"][value="${ack}"]`).setValue(true)
		await press('.os-run-dialog-ok')

		expect(text('.os-run-dialog .os-run-call-sentence')).toContain('It may have gone through')
	})

	it('take away the words of a call that may have gone through once the state shows that it did', async () => {
		await open(caseOf('failed'))
		calls.ackOsUpgrade.mockImplementation(failure({ code: 'ECONNABORTED' }))
		// the close was done all the same
		serve(status())
		await press('.os-run-button.is-acknowledge')

		expect(text('.os-run-state-title')).toBe('No upgrade is open')
		expect(wrapper.find('.os-run-call').exists()).toBe(false)
	})

	it('take away the words of a call that may have gone through at the next answer after the one that follows it, when the state did not change', async () => {
		await open(caseOf('failed'))
		calls.ackOsUpgrade.mockImplementation(failure({ code: 'ECONNABORTED' }))
		await press('.os-run-button.is-acknowledge')
		expect(text('.os-run-call-sentence')).toContain('The request took too long.')
		expect(wrapper.find('.os-run-call').attributes('role')).toBe('alert')

		await tick(POLL_MS.open)
		expect(wrapper.find('.os-run-call').exists()).toBe(false)
	})

	it('keep the words of a refusal until the next call, whatever the polls say', async () => {
		await open(caseOf('failed'))
		calls.ackOsUpgrade.mockImplementation(failure(refused('not_terminal', {})))
		await press('.os-run-button.is-acknowledge')
		serve(caseOf('succeeded'))
		await tick(POLL_MS.open * 4)

		expect(text('.os-run-call-sentence')).toBe('The upgrade is not in a state that this button is for. The state it is in now is shown above.')
	})

	it('say a code they do not know with the code as text, and a call that did not go through in its own words', async () => {
		await open(caseOf('failed'))
		calls.ackOsUpgrade.mockImplementation(failure(refused('<b>strange</b>', {})))
		await press('.os-run-button.is-acknowledge')
		expect(text('.os-run-call-sentence')).toBe('The core refused: <b>strange</b>')
		expect(wrapper.find('.os-run-call b').exists()).toBe(false)

		calls.ackOsUpgrade.mockImplementation(failure({ response: { status: 401 } }))
		await press('.os-run-button.is-acknowledge')
		expect(text('.os-run-call-sentence')).toBe('Your session has ended. Sign in again, then try again.')

		calls.ackOsUpgrade.mockImplementation(failure(refused('close_failed', {}, 500)))
		await press('.os-run-button.is-acknowledge')
		expect(text('.os-run-call-sentence')).toBe('The backup folder of the upgrade could not be put away, so the run stays as it was. Try again, or look at the folder.')

		// the next call clears it
		calls.ackOsUpgrade.mockImplementation(() => answer({}))
		await press('.os-run-button.is-acknowledge')
		expect(wrapper.find('.os-run-call').exists()).toBe(false)
	})
})

// ---- the confirmation windows -------------------------------------------------------------------------------------------------

describe('the confirmation windows', () => {
	it('open for a restart: say what happens, take the focus on the heading and not on the button that acts, and call nothing yet', async () => {
		await open(caseOf('awaiting_reboot'))
		const opener = wrapper.find('.os-run-button.is-reboot').element
		opener.focus()
		await press('.os-run-button.is-reboot')

		expect(text('.os-run-dialog-title')).toBe('Restart the machine now?')
		expect(texts('.os-run-dialog-line')).toEqual([
			'The machine restarts into the new release and is away for a few minutes. This page goes on by itself when it is back.',
			'Be where you can see the screen of the machine: a machine that does not come back cannot show this page.',
		])
		expect(document.activeElement).toBe(wrapper.find('.os-run-dialog-title').element)
		expect(document.activeElement).not.toBe(wrapper.find('.os-run-dialog-ok').element)
		expect(wrapper.find('.os-run-dialog-ok').classes()).toContain('is-danger')
		expect(wrapper.find('.modal').attributes('role')).toBe('dialog')
		expect(wrapper.find('.modal').attributes('aria-label')).toBe('Restart the machine now?')
		expect(calls.rebootOsUpgrade).not.toHaveBeenCalled()

		await press('.os-run-dialog-cancel')
		expect(dialog().exists()).toBe(false)
		expect(calls.rebootOsUpgrade).not.toHaveBeenCalled()
		// the focus is back on the button that opened it
		expect(document.activeElement).toBe(opener)
	})

	it('take a refusal said in the window away with it when they are cancelled', async () => {
		await open(caseOf('awaiting_reboot'))
		calls.rebootOsUpgrade.mockImplementation(failure(refused('not_awaiting_reboot', {})))
		await press('.os-run-button.is-reboot')
		await press('.os-run-dialog-ok')
		expect(text('.os-run-dialog .os-run-call-sentence')).toBe('The machine is not waiting for its restart.')

		await press('.os-run-dialog-cancel')
		expect(dialog().exists()).toBe(false)
		expect(wrapper.find('.os-run-call').exists()).toBe(false)
	})

	it('make the call once when confirmed, and close', async () => {
		await open(caseOf('awaiting_reboot'))
		await press('.os-run-button.is-reboot')
		await press('.os-run-dialog-ok')

		expect(calls.rebootOsUpgrade).toHaveBeenCalledTimes(1)
		expect(dialog().exists()).toBe(false)
	})

	it('stay open with the sentence when the core refuses, and say what stands before the restart', async () => {
		await open(caseOf('awaiting_reboot'))
		calls.rebootOsUpgrade.mockImplementation(failure(refused('barrier_failed', { checks: [{ code: 'fstab_unresolved', ok: false }] })))
		await press('.os-run-button.is-reboot')
		await press('.os-run-dialog-ok')

		expect(dialog().exists()).toBe(true)
		expect(text('.os-run-dialog .os-run-call-sentence')).toBe('Something that stands before the restart is not well. Mend it first.')
		expect(text('.os-run-dialog .os-run-call-items')).toContain('A disk or partition listed in /etc/fstab cannot be found')
		// said once, in the window
		expect(wrapper.findAll('.os-run-call-sentence')).toHaveLength(1)
	})

	it('say what an abort puts back, and a take-over that ReCasaOS stops acting', async () => {
		await open(caseOf('rehearsing'))
		await press('.os-run-button.is-abort')
		expect(texts('.os-run-dialog-line')[0]).toContain('the machine is put back as it was')
		await press('.os-run-dialog-ok')
		expect(calls.abortOsUpgrade).toHaveBeenCalledTimes(1)
		close()

		await open(caseOf('awaiting_reboot'))
		await press('.os-run-button.is-takeover')
		expect(text('.os-run-dialog-title')).toBe('Take the run over?')
		expect(texts('.os-run-dialog-line')[0]).toBe('ReCasaOS stops acting on this run: nothing is launched from now on.')
		await press('.os-run-dialog-ok')
		expect(calls.ackOsUpgrade).toHaveBeenCalledWith({ action: 'manual', word: '' })
	})

	it('close at Escape, the window that is on top and not the one it stands on, and then the one below at the next', async () => {
		const Outer = {
			data: () => ({ open: true }),
			render() {
				const props = { 'modelValue': this.open, 'hasModalCard': true, 'canCancel': ['escape'], 'onUpdate:modelValue': (value) => {
					this.open = value
				} }
				return h(BModal, props, {
					default: () => h('div', { class: 'modal-card outer-card' }, [h(OsUpgradeRun, { canCheck: true, locale: 'en_us' })]),
				})
			},
		}
		serve(caseOf('awaiting_reboot'))
		wrapper = mount(Outer, { attachTo: document.body, global: { plugins: [Buefy, i18n], mocks: { $api: { sys: calls } } } })
		await tick()
		await press('.os-run-button.is-reboot')
		expect(dialog().exists()).toBe(true)

		document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
		await tick()
		expect(dialog().exists()).toBe(false)
		expect(wrapper.vm.open).toBe(true)
		expect(wrapper.find('.outer-card').exists()).toBe(true)

		document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
		await tick()
		expect(wrapper.vm.open).toBe(false)
	})

	it('hand the focus back to the state when the button that opened it has gone', async () => {
		await open(caseOf('awaiting_reboot'))
		await press('.os-run-button.is-reboot')
		serve(caseOf('rebooting'))
		await press('.os-run-dialog-ok')
		await tick()

		expect(dialog().exists()).toBe(false)
		expect(wrapper.find('.os-run-button').exists()).toBe(false)
		expect(document.activeElement).toBe(wrapper.find('.os-run-state-title').element)
	})

	it('leave the page locked while the window they stand in is open, and do not lock it when it is not', async () => {
		const Outer = {
			data: () => ({ open: true }),
			render() {
				const props = { 'modelValue': this.open, 'hasModalCard': true, 'scroll': 'keep', 'canCancel': ['escape'], 'onUpdate:modelValue': (value) => {
					this.open = value
				} }
				return h(BModal, props, {
					default: () => h('div', { class: 'modal-card outer-card' }, [h(OsUpgradeRun, { canCheck: true, locale: 'en_us' })]),
				})
			},
		}
		const locked = () => document.body.classList.contains('is-noscroll')
		serve(caseOf('awaiting_reboot'))
		wrapper = mount(Outer, { attachTo: document.body, global: { plugins: [Buefy, i18n], mocks: { $api: { sys: calls } } } })
		await tick()
		expect(locked()).toBe(true)

		await press('.os-run-button.is-reboot')
		expect(dialog().exists()).toBe(true)
		expect(locked()).toBe(true)
		await press('.os-run-dialog-cancel')
		expect(dialog().exists()).toBe(false)
		expect(wrapper.vm.open).toBe(true)
		// the window the person is in is still open: the page behind it does not scroll
		expect(locked()).toBe(true)
		await press('.os-run-button.is-reboot')
		document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
		await tick()
		expect(locked()).toBe(true)
	})

	it('say why a window closed when the step is not offered any more, and hand the focus to the title of the section', async () => {
		await open(status(), { plan: real })
		wrapper.find('.os-run-hop').element.focus()
		await press('.os-run-hop')
		expect(dialog().exists()).toBe(true)
		serve(caseOf('rehearsing'))
		await tick(POLL_MS.idle)

		expect(dialog().exists()).toBe(false)
		expect(text('.os-run-call-sentence')).toBe('An upgrade is open. Finish it or close it first.')
		expect(wrapper.find('.os-run-call').attributes('role')).toBe('alert')
		expect(document.activeElement).toBe(wrapper.find('.os-run-title').element)
	})

	it.each([
		['the switch', () => status({ beta_enabled: false }), '.os-run-beta-switch', () => caseOf('failed'), 'An upgrade is open. Finish it or close it first.'],
		['a start, when the upgrade was switched off', () => status(), '.os-run-hop', () => status({ beta_enabled: false }), 'The upgrade is switched off. Switch it on first.'],
		['a step', () => caseOf('awaiting_reboot'), '.os-run-button.is-reboot', () => caseOf('rebooting'), 'The upgrade is not in a state that this button is for. The state it is in now is shown above.'],
	])('say why the window of %s closed', async (_, first, opener, later, sentence) => {
		await open(first(), { plan: real })
		await press(opener)
		expect(dialog().exists()).toBe(true)
		serve(later())
		await tick(POLL_MS.idle)

		expect(dialog().exists()).toBe(false)
		expect(text('.os-run-call-sentence')).toBe(sentence)
	})

	it('say nothing of a window that closes because of the call it was opened for', async () => {
		await open(caseOf('awaiting_reboot'))
		await press('.os-run-button.is-reboot')
		serve(caseOf('rebooting'))
		await press('.os-run-dialog-ok')

		expect(dialog().exists()).toBe(false)
		expect(wrapper.find('.os-run-call').exists()).toBe(false)
	})

	it('cannot be cancelled by the button, by Escape or by a click outside while their call is out: the step would go on without a window', async () => {
		await open(caseOf('awaiting_reboot'))
		await press('.os-run-button.is-reboot')
		const out = deferred()
		calls.rebootOsUpgrade.mockReturnValue(out.promise)
		await press('.os-run-dialog-ok')

		expect(wrapper.find('.os-run-dialog-cancel').attributes('disabled')).toBeDefined()
		wrapper.find('.os-run-dialog-cancel').element.click()
		document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
		await wrapper.find('.modal-background').trigger('click')
		await tick()
		expect(dialog().exists()).toBe(true)

		// and they can once the call is done and the state is in
		out.resolve({ data: { data: {} } })
		serve(caseOf('awaiting_reboot'))
		await tick()
		expect(dialog().exists()).toBe(false)
		expect(calls.rebootOsUpgrade).toHaveBeenCalledTimes(1)
	})

	it('are cancelled by the button, Escape and a click outside as long as nothing is out', async () => {
		await open(caseOf('awaiting_reboot'))
		await press('.os-run-button.is-reboot')
		expect(wrapper.find('.os-run-dialog-cancel').attributes('disabled')).toBeUndefined()
		document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
		await tick()
		expect(dialog().exists()).toBe(false)

		await press('.os-run-button.is-reboot')
		await wrapper.find('.modal-background').trigger('click')
		await tick()
		expect(dialog().exists()).toBe(false)
		expect(calls.rebootOsUpgrade).not.toHaveBeenCalled()
	})

	it('keep their button shut while the state on the screen is an old one, and say why', async () => {
		await open(caseOf('awaiting_reboot'))
		await press('.os-run-button.is-reboot')
		expect(wrapper.find('.os-run-dialog-stale').exists()).toBe(false)
		getStatus.mockImplementation(failure({}))
		await tick(POLL_MS.open)

		expect(dialog().exists()).toBe(true)
		expect(wrapper.find('.os-run-dialog-ok').attributes('disabled')).toBeDefined()
		expect(text('.os-run-dialog-stale')).toBe('This is the last state that was read. It may be out of date.')
		wrapper.find('.os-run-dialog-ok').element.click()
		await tick()
		expect(calls.rebootOsUpgrade).not.toHaveBeenCalled()

		// and opens again when the core answers
		serve(caseOf('awaiting_reboot'))
		await tick(POLL_MS.error)
		expect(wrapper.find('.os-run-dialog-ok').attributes('disabled')).toBeUndefined()
		expect(wrapper.find('.os-run-dialog-stale').exists()).toBe(false)
	})

	it('close by themselves when the step is not offered any more', async () => {
		await open(caseOf('awaiting_reboot'))
		await press('.os-run-button.is-reboot')
		serve(caseOf('reboot_stalled', { actions: ['takeover'] }))
		await tick(POLL_MS.open)

		expect(dialog().exists()).toBe(false)
	})
})

// ---- the switch, the refresh --------------------------------------------------------------------------------------------------

describe('the switch and the refresh', () => {
	it('asks before it switches the upgrade on, and says it is a beta with a snapshot', async () => {
		await open(status({ beta_enabled: false }))
		await press('.os-run-beta-switch')

		expect(text('.os-run-dialog-title')).toBe('Switch the upgrade on?')
		expect(texts('.os-run-dialog-line').join(' ')).toContain('snapshot')
		expect(calls.setOsUpgradeBeta).not.toHaveBeenCalled()
		await press('.os-run-dialog-ok')

		expect(calls.setOsUpgradeBeta).toHaveBeenCalledTimes(1)
		expect(calls.setOsUpgradeBeta).toHaveBeenCalledWith(true)
	})

	it('switches it off at once', async () => {
		await open(status())
		expect(text('.os-run-beta-state')).toBe('The upgrade is switched on.')
		await press('.os-run-beta-switch')

		expect(dialog().exists()).toBe(false)
		expect(calls.setOsUpgradeBeta).toHaveBeenCalledWith(false)
	})

	it('says run_open when a run is open', async () => {
		await open(status({ beta_enabled: false }))
		calls.setOsUpgradeBeta.mockImplementation(failure(refused('run_open', { state: 'failed' })))
		await press('.os-run-beta-switch')
		await press('.os-run-dialog-ok')

		expect(text('.os-run-dialog .os-run-call-sentence')).toBe('An upgrade is open. Finish it or close it first.')
	})

	it('offers the refresh when nothing is open, and starts it without the option', async () => {
		await open(status())
		expect(text('.os-run-refresh-about')).toContain('apt-get update')
		expect(wrapper.find('.os-run-refresh-accept').exists()).toBe(false)
		await press('.os-run-refresh-button')

		expect(calls.startOsRefresh).toHaveBeenCalledTimes(1)
		expect(calls.startOsRefresh).toHaveBeenCalledWith(false)
	})

	it('offers the option of a changed release information only to a refresh that stopped for it, and asks first', async () => {
		const stopped = extra => caseOf('failed', { kind: 'refresh', reason: 'network', actions: ['acknowledge'], failure: { stage: 'rsources', class: 'identity', rc: 100, detail_line: 'E: Repository changed', hint: 'releaseinfo_change', ...extra } })
		await open(stopped())

		expect(text('.os-run-failure-hint')).toContain('you can run the refresh again and accept it')
		expect(wrapper.find('.os-run-refresh-button').exists()).toBe(false)
		expect(text('.os-run-refresh-accept')).toBe('Run it again and accept the change')
		await press('.os-run-refresh-accept')
		expect(text('.os-run-dialog-title')).toBe('Accept the change of a package source?')
		expect(calls.startOsRefresh).not.toHaveBeenCalled()
		await press('.os-run-dialog-ok')
		expect(calls.startOsRefresh).toHaveBeenCalledWith(true)
		close()

		// another reason to stop: no option
		await open(stopped({ hint: undefined }))
		expect(wrapper.find('.os-run-refresh-accept').exists()).toBe(false)
	})
})

// ---- starting -----------------------------------------------------------------------------------------------------------------

describe('the start of a rehearsal and of the upgrade', () => {
	const fill = async ({ net = 'snapshot', host = 'stagevet-box', acks = ['no_interruption', 'no_way_back', 'sources_paused', 'removals_read'] } = {}) => {
		if (net)
			await wrapper.find(`input[name="os-run-safety-net"][value="${net}"]`).setValue(true)
		await wrapper.find('#os-run-hostname').setValue(host)
		for (const ack of acks)
			await wrapper.find(`input[type="checkbox"][value="${ack}"]`).setValue(true)
	}

	it('offers nothing to start without the plan that was read, and says to make it', async () => {
		await open(status())

		expect(wrapper.find('.os-run-hop').attributes('disabled')).toBeDefined()
		expect(wrapper.find('.os-run-rehearsal').attributes('disabled')).toBeDefined()
		expect(text('.os-run-start-hint')).toBe('There is no plan to start from. Make the plan first.')
	})

	it('offers nothing to start from a plan that nothing can accept', async () => {
		await open(status(), { plan: planWith({ verdict: 'blocked' }) })

		expect(wrapper.find('.os-run-hop').attributes('disabled')).toBeDefined()
		expect(text('.os-run-start-hint')).toBe('The plan has a problem that nothing can accept. Read the plan.')
	})

	it('asks, for the upgrade, the safety net, the name of the machine and every box, with the removals and the sources put aside as text', async () => {
		await open(status(), { plan: real })
		await press('.os-run-hop')

		expect(text('.os-run-dialog-title')).toBe('Start the upgrade')
		expect(texts('.os-run-dialog-line')).toHaveLength(2)
		expect(texts('.os-run-dialog-line')[1]).toContain('Be at the console of the machine')
		expect(texts('.os-run-radio')).toEqual(Object.values(SAFETY_NET_TEXTS))
		expect(texts('.os-run-ack')).toEqual([ACK_TEXTS.no_interruption, ACK_TEXTS.no_way_back, ACK_TEXTS.sources_paused, ACK_TEXTS.removals_read])
		expect(texts('.os-run-removals li')).toEqual(['fuse'])
		expect(texts('.os-run-paused li')).toEqual(['docker.list'])
		expect(wrapper.find('.os-run-dialog-ok').attributes('disabled')).toBeDefined()
		expect(text('.os-run-dialog-missing')).toBe('Fill in what is asked and tick every box to start.')
		expect(document.activeElement).toBe(wrapper.find('.os-run-dialog-title').element)
	})

	it('starts the upgrade with the body of the core and nothing else, once everything is given', async () => {
		await open(status(), { plan: real })
		await press('.os-run-hop')
		await fill({ net: 'console_and_backup', host: ' stagevet-box ' })

		expect(wrapper.find('.os-run-dialog-ok').attributes('disabled')).toBeUndefined()
		expect(wrapper.find('.os-run-dialog-missing').exists()).toBe(false)
		await press('.os-run-dialog-ok')

		expect(calls.startOsUpgrade).toHaveBeenCalledTimes(1)
		const body = calls.startOsUpgrade.mock.calls[0][0]
		expect(Object.keys(body).sort()).toEqual(['accept_removals', 'acks', 'hostname', 'paused_sources', 'plan_id', 'rehearsal', 'safety_net'])
		expect(body).toEqual({
			plan_id: real.plan_id,
			rehearsal: false,
			safety_net: 'console_and_backup',
			hostname: 'stagevet-box',
			accept_removals: ['fuse'],
			paused_sources: ['docker.list'],
			acks: ['no_interruption', 'no_way_back', 'sources_paused', 'removals_read'],
		})
		expect(dialog().exists()).toBe(false)
	})

	it('shows the names of the plan cleaned, and sends them as the plan lists them', async () => {
		const flip = String.fromCharCode(0x202E)
		const name = `fuse${flip}${String.fromCharCode(7)}-2`
		const plan = planWith({
			problems: [{ code: 'removal_manual', severity: 'needs_acceptance', data: { name, version: '2.9.9-5' } }],
			paused: [{ file: `docker${flip}.list`, hosts: [], docker: true }],
		})
		await open(status(), { plan })
		await press('.os-run-hop')

		expect(unsafeIn(wrapper.find('.os-run-dialog').text())).toEqual([])
		expect(text('.os-run-removals li')).toMatch(/^fuse\s+-2$/)
		await fill()
		await press('.os-run-dialog-ok')

		// what the core compares is what it wrote
		const body = calls.startOsUpgrade.mock.calls[0][0]
		expect(body.accept_removals).toEqual([name])
		expect(body.paused_sources).toEqual([`docker${flip}.list`])
	})

	it('keeps the button shut while one thing is missing, whichever it is', async () => {
		await open(status(), { plan: real })
		await press('.os-run-hop')
		const shut = () => wrapper.find('.os-run-dialog-ok').attributes('disabled') !== undefined

		await fill({ net: '' })
		expect(shut()).toBe(true)
		await wrapper.find('input[name="os-run-safety-net"][value="snapshot"]').setValue(true)
		expect(shut()).toBe(false)
		await wrapper.find('#os-run-hostname').setValue('not a name!')
		expect(shut()).toBe(true)
		await wrapper.find('#os-run-hostname').setValue('box')
		await wrapper.find('input[type="checkbox"][value="removals_read"]').setValue(false)
		expect(shut()).toBe(true)
	})

	it('asks a rehearsal for no safety net and no "no way back", and sends none', async () => {
		await open(status(), { plan: PLAIN })
		await press('.os-run-rehearsal')

		expect(text('.os-run-dialog-title')).toBe('Start a rehearsal')
		expect(wrapper.find('input[name="os-run-safety-net"]').exists()).toBe(false)
		expect(texts('.os-run-ack')).toEqual([ACK_TEXTS.no_interruption])
		expect(wrapper.find('.os-run-removals').exists()).toBe(false)
		expect(wrapper.find('.os-run-paused').exists()).toBe(false)
		await fill({ net: '', acks: ['no_interruption'] })
		await press('.os-run-dialog-ok')

		expect(calls.startOsUpgrade).toHaveBeenCalledWith({
			plan_id: PLAIN.plan_id,
			rehearsal: true,
			safety_net: '',
			hostname: 'stagevet-box',
			accept_removals: [],
			paused_sources: [],
			acks: ['no_interruption'],
		})
	})

	it('shows a refusal in the window and leaves it open', async () => {
		await open(status(), { plan: real })
		calls.startOsUpgrade.mockImplementation(failure(refused('hostname_mismatch', {})))
		await press('.os-run-hop')
		await fill()
		await press('.os-run-dialog-ok')

		expect(dialog().exists()).toBe(true)
		expect(text('.os-run-dialog .os-run-call-sentence')).toBe('The name you typed is not the name of this machine.')
	})

	it('closes the window when the plan on the screen is not the one it was opened for, and says so', async () => {
		await open(status(), { plan: real })
		await press('.os-run-hop')
		await fill()
		await wrapper.setProps({ plan: planWith({ plan_id: 'p1-00000000000000000000000000000000' }) })
		await tick()

		expect(dialog().exists()).toBe(false)
		expect(text('.os-run-call-sentence')).toBe('A newer plan replaced the one you read. Read the new one, then try again.')
		expect(calls.startOsUpgrade).not.toHaveBeenCalled()
	})

	it('offers nothing to start while a run is open', async () => {
		await open(caseOf('failed'), { plan: real })

		expect(wrapper.find('.os-run-start').exists()).toBe(false)
		expect(wrapper.find('.os-run-beta').exists()).toBe(false)
	})
})

// ---- the text of the run ------------------------------------------------------------------------------------------------------

describe('the text of the run', () => {
	const TEXT_OF_RUN = '#!/bin/sh\n# BLOCK 0\necho "<b>mine</b>"\ndeb https://user:pass@example.org/debian bookworm main\n'
	const runbook = (changes = {}) => answer({ plan_id: real.plan_id, hop: 'debian-11-12', text: TEXT_OF_RUN, blocks: [], from_run: RUN, ...changes })

	it('is read when the run is taken over, and shown in a box of its own as text, whole, with a copy button', async () => {
		calls.getOsUpgradeRunbook.mockImplementation(runbook)
		await open(caseOf('manual'))
		await tick()

		expect(calls.getOsUpgradeRunbook).toHaveBeenCalledTimes(1)
		const pre = wrapper.find('pre.os-copy-text')
		expect(pre.text()).toBe(TEXT_OF_RUN.trim())
		expect(pre.element.textContent).toBe(TEXT_OF_RUN)
		expect(pre.find('b').exists()).toBe(false)
		expect(wrapper.find('.os-run-runbook').element.open).toBe(true)
		await wrapper.find('.os-run-runbook .os-copy-button').trigger('click')
		await tick()
		expect(copy).toHaveBeenCalledWith(TEXT_OF_RUN)
	})

	it('is not read again by the polls, and is read again for another run', async () => {
		calls.getOsUpgradeRunbook.mockImplementation(runbook)
		await open(caseOf('manual'))
		await tick(POLL_MS.open * 3)
		expect(calls.getOsUpgradeRunbook).toHaveBeenCalledTimes(1)

		serve(caseOf('manual', { run_id: '11111111-2222-4333-8444-555555555555' }))
		await tick(POLL_MS.open)
		expect(calls.getOsUpgradeRunbook).toHaveBeenCalledTimes(2)
	})

	it('is read only when the person asks, for a run that is not taken over', async () => {
		calls.getOsUpgradeRunbook.mockImplementation(runbook)
		await open(caseOf('awaiting_reboot'))

		expect(wrapper.find('.os-run-runbook').element.open).toBe(false)
		expect(calls.getOsUpgradeRunbook).not.toHaveBeenCalled()
		wrapper.find('.os-run-runbook').element.open = true
		await wrapper.find('.os-run-runbook').trigger('toggle')
		await tick()

		expect(calls.getOsUpgradeRunbook).toHaveBeenCalledTimes(1)
		expect(text('pre.os-copy-text')).toContain('# BLOCK 0')
	})

	it('is not offered when no run is open', async () => {
		await open(status())
		expect(wrapper.find('.os-run-runbook').exists()).toBe(false)
	})

	it('says why it could not be read, and tries again when asked', async () => {
		calls.getOsUpgradeRunbook.mockImplementationOnce(failure(refused('run_unreadable', {})))
		await open(caseOf('manual'))
		await tick()

		expect(text('.os-run-runbook-failure')).toContain('The upgrade that is open cannot be read.')
		calls.getOsUpgradeRunbook.mockImplementation(runbook)
		await press('.os-run-runbook-retry')
		expect(wrapper.find('.os-run-runbook-failure').exists()).toBe(false)
		expect(wrapper.find('pre.os-copy-text').exists()).toBe(true)
	})

	it('shows the text selected, and says so, when the browser does not allow copying', async () => {
		calls.getOsUpgradeRunbook.mockImplementation(runbook)
		copy.mockImplementation(() => Promise.reject(new Error('denied')))
		await open(caseOf('manual'))
		await tick()
		await wrapper.find('.os-run-runbook .os-copy-button').trigger('click')
		await tick()

		expect(text('.os-copy-refused')).toBe('Your browser did not allow copying. The text is selected: copy it with Ctrl+C.')
		expect(window.getSelection().toString()).toContain('# BLOCK 0')
	})
})

// ---- a core that does not answer -----------------------------------------------------------------------------------------------

describe('a core that stops answering', () => {
	it('says the machine is restarting while a run is open, with the time, and keeps the last state marked as old', async () => {
		await open(caseOf('rebooting'))
		getStatus.mockImplementation(failure({}))
		await tick(POLL_MS.open)

		expect(text('.os-run-outage-message')).toBe('The machine is restarting. This page goes on by itself.')
		// the clock begins at the first ask that failed: there is nothing to say of the time yet
		expect(wrapper.find('.os-run-outage-elapsed').exists()).toBe(false)
		expect(text('.os-run-stale')).toBe('This is the last state that was read. It may be out of date.')
		expect(text('.os-run-state-title')).toBe('Restarting')
		// the next try is 10 seconds later
		await tick(POLL_MS.error)
		expect(text('.os-run-outage-elapsed')).toBe('No answer for 10 s.')
	})

	it('shuts the buttons while the state on the screen is an old one', async () => {
		await open(caseOf('awaiting_reboot'))
		getStatus.mockImplementation(failure({}))
		await tick(POLL_MS.open)

		expect(wrapper.find('.os-run-button.is-reboot').attributes('disabled')).toBeDefined()
		expect(wrapper.find('.os-run-button.is-takeover').attributes('disabled')).toBeDefined()
	})

	it('says to look at the machine after 15 minutes, with what the status carried for that case, each command to copy', async () => {
		await open(caseOf('rebooting'))
		getStatus.mockImplementation(failure({ response: { status: 502 } }))
		await tick(RESTART_LOOK_AFTER_MS - 60_000)
		expect(text('.os-run-outage-message')).toBe('The machine is restarting. This page goes on by itself.')
		expect(wrapper.find('.os-run-after').exists()).toBe(false)

		await tick(70_000)
		expect(text('.os-run-outage-message')).toMatch(/^The machine has not answered for 15 min \d\d s\. Look at its screen or console/)
		expect(text('.os-run-after h5')).toBe('If the machine does not come back, this is what you need')
		expect(text('.os-run-after-folder')).toBe(`Backup folder: ${BK}`)
		expect(text('.os-run-after-log')).toContain('output.log')
		expect(texts('.os-run-after .os-run-command .os-copy-text')).toEqual(hint.commands)
		expect(text('.os-run-after pre.os-copy-text')).toBe('# block 8\necho after')

		const buttons = wrapper.findAll('.os-run-after .os-run-command .os-copy-button')
		expect(buttons).toHaveLength(hint.commands.length)
		await buttons[2].trigger('click')
		await tick()
		expect(copy).toHaveBeenCalledWith('dpkg --audit')
	})

	it('goes back to the state when the core answers again', async () => {
		await open(caseOf('rebooting'))
		getStatus.mockImplementation(failure({}))
		await tick(POLL_MS.open + POLL_MS.error)
		expect(wrapper.find('.os-run-outage').exists()).toBe(true)

		serve(caseOf('verifying'))
		await tick(POLL_MS.error)
		expect(wrapper.find('.os-run-outage').exists()).toBe(false)
		expect(wrapper.find('.os-run-stale').exists()).toBe(false)
		expect(text('.os-run-state-title')).toBe('Checking the machine')
	})

	it('asks to sign in again for a 401, and does not call that a restart', async () => {
		await open(caseOf('rebooting'))
		getStatus.mockImplementation(failure({ response: { status: 401 } }))
		await tick(POLL_MS.open)

		expect(text('.os-run-outage-message')).toBe('Your session has ended. Sign in again to see the upgrade.')
		expect(wrapper.find('.os-run-outage-elapsed').exists()).toBe(false)
	})

	it('does not say the machine is restarting when no run is open', async () => {
		await open(status())
		getStatus.mockImplementation(failure({}))
		await tick(POLL_MS.idle)

		expect(text('.os-run-outage-message')).toBe('The state of the upgrade could not be read just now. This page tries again by itself.')
	})

	it('announces the outage once, and not at every try', async () => {
		await open(caseOf('rebooting'))
		const heard = []
		wrapper.vm.$watch('announced', value => heard.push(value))
		getStatus.mockImplementation(failure({}))
		await tick(POLL_MS.open + POLL_MS.error * 5)
		expect(heard).toEqual(['The machine is restarting. This page goes on by itself.'])

		// and once more when it turns to the screen of the machine, whose sentence has the time in it
		await tick(RESTART_LOOK_AFTER_MS)
		expect(heard).toHaveLength(2)
		expect(heard[1]).toMatch(/^The machine has not answered for 1\d min \d\d s\. Look at its screen/)
	})
})

// ---- the clock of an outage -----------------------------------------------------------------------------------------------------

describe('how long the core has been silent', () => {
	const RESTARTING = 'The machine is restarting. This page goes on by itself.'
	const UNREADABLE = 'The state of the upgrade could not be read just now. This page tries again by itself.'
	const hide = (hidden) => {
		if (hidden)
			Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
		else
			delete document.hidden
		document.dispatchEvent(new Event('visibilitychange'))
	}
	const offline = (value) => {
		Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
	}
	afterEach(() => {
		delete navigator.onLine
	})

	it('counts from the page being shown again, and not from the last answer, when the tab was hidden while the core went away', async () => {
		await open(caseOf('rebooting'))
		hide(true)
		await tick(20 * 60_000)
		expect(getStatus).toHaveBeenCalledTimes(1)
		getStatus.mockImplementation(failure({}))
		hide(false)
		await tick()

		expect(text('.os-run-outage-message')).toBe(RESTARTING)
		expect(wrapper.find('.os-run-outage-elapsed').exists()).toBe(false)
		// the 15 minutes are counted from there
		await tick(14 * 60_000)
		expect(text('.os-run-outage-message')).toBe(RESTARTING)
		await tick(2 * 60_000)
		expect(text('.os-run-outage-message')).toMatch(/^The machine has not answered for 1[56] min/)
	})

	it('counts again when the page was not asking for a long while and the document was not hidden: a closed lid', async () => {
		await open(caseOf('rebooting'))
		getStatus.mockImplementation(failure({}))
		await tick(POLL_MS.open)
		expect(text('.os-run-outage-message')).toBe(RESTARTING)
		vi.setSystemTime(new Date(Date.now() + 30 * 60_000))
		await tick(POLL_MS.error)

		expect(text('.os-run-outage-message')).toBe(RESTARTING)
		expect(wrapper.find('.os-run-outage-elapsed').exists()).toBe(false)
	})

	it('counts from the first ask that failed, and starts a new clock for a new outage', async () => {
		await open(caseOf('rebooting'))
		getStatus.mockImplementation(failure({}))
		await tick(POLL_MS.open + POLL_MS.error * 60)
		expect(text('.os-run-outage-elapsed')).toMatch(/^No answer for 10 min/)

		serve(caseOf('rebooting'))
		await tick(POLL_MS.error)
		expect(wrapper.find('.os-run-outage').exists()).toBe(false)
		getStatus.mockImplementation(failure({}))
		await tick(POLL_MS.open)
		expect(wrapper.find('.os-run-outage-elapsed').exists()).toBe(false)
		await tick(POLL_MS.error)
		expect(text('.os-run-outage-elapsed')).toBe('No answer for 10 s.')
	})

	it.each([
		['an answer that is not a status', () => answer('<html>Sign in to the gateway</html>')],
		['a 403', failure({ response: { status: 403 } })],
		['a 400', failure(refused('bad_request', {}, 400))],
	])('sends the person to the machine after 15 minutes of %s while a run is open, on the same clock', async (_, answerWith) => {
		await open(caseOf('rebooting'))
		getStatus.mockImplementation(answerWith)
		await tick(RESTART_LOOK_AFTER_MS - 60_000)
		// not a core that is away: it is not said to restart
		expect(text('.os-run-outage-message')).toBe(UNREADABLE)

		await tick(120_000)
		expect(text('.os-run-outage-message')).toMatch(/^The machine has not answered for 1[56] min \d\d s\. Look at its screen or console/)
		expect(text('.os-run-after-folder')).toBe(`Backup folder: ${BK}`)
	})

	it('does not send the person to the machine for an idle one that cannot be read', async () => {
		await open(status())
		getStatus.mockImplementation(failure({ response: { status: 403 } }))
		await tick(RESTART_LOOK_AFTER_MS + 120_000)

		expect(text('.os-run-outage-message')).toBe(UNREADABLE)
	})

	it('does not call the person\'s own network loss a machine that restarts', async () => {
		await open(caseOf('rebooting'))
		offline(false)
		getStatus.mockImplementation(failure({}))
		await tick(POLL_MS.open)

		expect(text('.os-run-outage-message')).toBe(UNREADABLE)
		await tick(POLL_MS.error * 3)
		expect(text('.os-run-outage-message')).toBe(UNREADABLE)
		// and it is the person's to go and look, all the same, when it lasts
		await tick(RESTART_LOOK_AFTER_MS)
		expect(text('.os-run-outage-message')).toMatch(/^The machine has not answered for/)
	})

	it('sends the person to the machine after 15 minutes when the page was loaded while the core was away', async () => {
		getStatus.mockImplementation(failure({}))
		await open(null)
		expect(text('.os-run-outage-message')).toBe(UNREADABLE)

		await tick(RESTART_LOOK_AFTER_MS - 60_000)
		expect(text('.os-run-outage-message')).toBe(UNREADABLE)
		await tick(120_000)
		expect(text('.os-run-outage-message')).toMatch(/^The machine has not answered for 1[56] min \d\d s\. Look at its screen or console/)
		// it read nothing, so it has nothing more to say
		expect(wrapper.find('.os-run-after').exists()).toBe(false)
	})

	it('goes on asking, and says it could not read, when it cannot make sense of an answer', async () => {
		await open(caseOf('running'))
		// a value that throws when it is read: the page has to survive what it is given
		const hostile = new Proxy({}, { get() {
			throw new Error('unreadable')
		} })
		getStatus.mockImplementation(() => answer(hostile))
		await tick(POLL_MS.open)

		expect(text('.os-run-outage-message')).toBe(UNREADABLE)
		expect(text('.os-run-state-title')).toBe('Upgrade running')
		const asked = getStatus.mock.calls.length
		await tick(POLL_MS.error)
		expect(getStatus.mock.calls.length).toBe(asked + 1)

		serve(caseOf('succeeded'))
		await tick(POLL_MS.error)
		expect(wrapper.find('.os-run-outage').exists()).toBe(false)
		expect(text('.os-run-state-title')).toBe('Upgrade done')
	})
})

// ---- the polling --------------------------------------------------------------------------------------------------------------

describe('the polling', () => {
	it('asks every 5 seconds while a run is open and every 15 when none is', async () => {
		await open(caseOf('running'))
		expect(getStatus).toHaveBeenCalledTimes(1)
		await tick(POLL_MS.open - 1)
		expect(getStatus).toHaveBeenCalledTimes(1)
		await tick(1)
		expect(getStatus).toHaveBeenCalledTimes(2)
		await tick(POLL_MS.open * 2)
		expect(getStatus).toHaveBeenCalledTimes(4)
		close()

		await open(status())
		expect(getStatus).toHaveBeenCalledTimes(1)
		await tick(POLL_MS.idle - 1)
		expect(getStatus).toHaveBeenCalledTimes(1)
		await tick(1)
		expect(getStatus).toHaveBeenCalledTimes(2)
	})

	it('asks 10 seconds after a failure, whatever else is true', async () => {
		await open(caseOf('running'))
		getStatus.mockImplementation(failure({}))
		await tick(POLL_MS.open)
		expect(getStatus).toHaveBeenCalledTimes(2)
		await tick(POLL_MS.error - 1)
		expect(getStatus).toHaveBeenCalledTimes(2)
		await tick(1)
		expect(getStatus).toHaveBeenCalledTimes(3)
	})

	it('has one request out at a time, however long the core takes', async () => {
		const slow = deferred()
		getStatus.mockReturnValue(slow.promise)
		wrapper = mount(OsUpgradeRun, { attachTo: document.body, props: { canCheck: true }, global: { plugins: [Buefy, i18n], mocks: { $api: { sys: calls } } } })
		await tick(120_000)

		expect(getStatus).toHaveBeenCalledTimes(1)
		slow.resolve({ data: { data: caseOf('running') } })
		await tick()
		expect(getStatus).toHaveBeenCalledTimes(1)
		await tick(POLL_MS.open)
		expect(getStatus).toHaveBeenCalledTimes(2)
	})

	it('waits for a later ask as it waits for the first: the next one is made 5 seconds after the answer, not after the last ask', async () => {
		await open(caseOf('running'))
		const slow = deferred()
		getStatus.mockReturnValue(slow.promise)
		await tick(POLL_MS.open)
		expect(getStatus).toHaveBeenCalledTimes(2)

		await tick(POLL_MS.open * 6)
		expect(getStatus).toHaveBeenCalledTimes(2)
		slow.resolve({ data: { data: caseOf('running') } })
		getStatus.mockImplementation(() => answer(caseOf('running')))
		await tick(POLL_MS.open - 1)
		expect(getStatus).toHaveBeenCalledTimes(2)
		await tick(1)
		expect(getStatus).toHaveBeenCalledTimes(3)
	})

	it('does not wait for the poll that is out to ask after a call, and does not ask twice at once', async () => {
		await open(caseOf('failed'))
		const slow = deferred()
		getStatus.mockReturnValueOnce(slow.promise)
		await tick(POLL_MS.open)
		expect(getStatus).toHaveBeenCalledTimes(2)

		await press('.os-run-button.is-acknowledge')
		// the poll that is out is not doubled: the next ask is made once it is back
		expect(getStatus).toHaveBeenCalledTimes(2)
		slow.resolve({ data: { data: caseOf('failed') } })
		await tick()
		expect(getStatus).toHaveBeenCalledTimes(3)
	})

	it('does not ask while the document is hidden, and asks at once when it is shown again', async () => {
		await open(caseOf('running'))
		Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
		document.dispatchEvent(new Event('visibilitychange'))
		await tick(POLL_MS.open * 10)
		expect(getStatus).toHaveBeenCalledTimes(1)

		delete document.hidden
		document.dispatchEvent(new Event('visibilitychange'))
		await tick()
		expect(getStatus).toHaveBeenCalledTimes(2)
	})

	it('does not ask at all before the document is shown, if it opens hidden', async () => {
		Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
		await open(caseOf('running'))
		await tick(POLL_MS.idle * 2)
		expect(getStatus).not.toHaveBeenCalled()
	})

	it('clears its timers when the window closes, and asks nothing more', async () => {
		await open(caseOf('running'))
		expect(vi.getTimerCount()).toBeGreaterThan(0)
		close()

		expect(vi.getTimerCount()).toBe(0)
		await tick(POLL_MS.idle * 5)
		expect(getStatus).toHaveBeenCalledTimes(1)
	})

	it('does not draw an answer that comes after the window closed, nor ask again', async () => {
		const late = deferred()
		getStatus.mockReturnValue(late.promise)
		wrapper = mount(OsUpgradeRun, { attachTo: document.body, props: { canCheck: true }, global: { plugins: [Buefy, i18n], mocks: { $api: { sys: calls } } } })
		await tick()
		close()
		late.resolve({ data: { data: caseOf('running') } })
		await tick(POLL_MS.idle * 3)

		expect(vi.getTimerCount()).toBe(0)
		expect(getStatus).toHaveBeenCalledTimes(1)
	})

	it('stops listening to the document and to the keys when the window closes with a window open', async () => {
		await open(caseOf('awaiting_reboot'))
		await press('.os-run-button.is-reboot')
		const remove = vi.spyOn(window, 'removeEventListener')
		const removeDocument = vi.spyOn(document, 'removeEventListener')
		close()

		expect(remove).toHaveBeenCalledWith('keyup', expect.any(Function), true)
		expect(removeDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
	})
})

// ---- the live region -----------------------------------------------------------------------------------------------------------

describe('the live region', () => {
	it('is polite, says nothing before the first state and announces a change once', async () => {
		await open(caseOf('awaiting_reboot'))
		const region = wrapper.find('.os-run-live')

		expect(region.attributes('aria-live')).toBe('polite')
		expect(region.text()).toBe('')
		const heard = []
		wrapper.vm.$watch('announced', value => heard.push(value))
		await tick(POLL_MS.open * 3)
		expect(heard).toEqual([])

		serve(caseOf('rebooting'))
		await tick(POLL_MS.open)
		expect(region.text()).toBe('Restarting')
		await tick(POLL_MS.open * 3)
		expect(heard).toEqual(['Restarting'])

		serve(caseOf('verifying'))
		await tick(POLL_MS.open)
		expect(region.text()).toBe('Checking the machine')
		expect(heard).toEqual(['Restarting', 'Checking the machine'])
	})

	it('is there before the section is, so that the first change is heard', async () => {
		await open(status(), { canCheck: false })
		expect(wrapper.find('.os-run-live').exists()).toBe(true)
		expect(wrapper.find('.os-run').exists()).toBe(false)

		serve(caseOf('failed'))
		await tick(POLL_MS.idle)
		expect(wrapper.find('.os-run-live').text()).toBe('The upgrade stopped')
	})
})

// ---- the language files --------------------------------------------------------------------------------------------------------

describe('the sentences of the components themselves', () => {
	// the keys that the templates and the scripts look up besides those of the tables of osUpgrade.js (which its own spec pins)
	const literals = ['OsUpgradeRun.vue', 'OsUpgradeCopyable.vue'].flatMap((file) => {
		const code = readFileSync(`src/components/settings/${file}`, 'utf8')
		return [...code.matchAll(/\$t\('([^']+)'/g)].map(match => match[1])
	})

	it('are few, and are all in English and in French', () => {
		const keys = [...new Set(literals)]
		expect(keys.sort()).toEqual(['Cancel', 'Copied to clipboard', 'Copy', 'Try again', 'Your browser did not allow copying. The text is selected: copy it with Ctrl+C.'])
		for (const key of keys) {
			expect(en[key], key).toBe(key)
			expect(fr[key], key).toBeTruthy()
			expect(fr[key], key).not.toBe(key)
		}
	})
})
