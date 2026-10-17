import { afterEach, describe, expect, it } from 'vitest'
import {
	ACK_TEXTS,
	BARRIER_CHECKS,
	BLOCK_NUMBERS,
	BLOCK_TITLES,
	BUTTONS,
	CALL_ERRORS,
	CLASS_TABLE,
	FINDINGS,
	NOT_JUDGED,
	PAUSE_GAP_MS,
	POLL_MS,
	PREREBOOT_WORDS,
	REFRESH_NETWORK_NOTE,
	REFUSALS,
	REFUSAL_UNKNOWN,
	RESTART_LOOK_AFTER_MS,
	ROUTES,
	SAFETY_NETS,
	SAFETY_NET_TEXTS,
	START_ACKS,
	STATE_TABLE,
	STATE_VARIANTS,
	TEXT,
	UPGRADE_KEYS,
	announcement,
	buttonBody,
	changeKey,
	failureOf,
	formatElapsed,
	hostnameOk,
	nextPoll,
	outageStart,
	outageView,
	powerRefusal,
	startBody,
	startNeeds,
	statusFailure,
	statusView,
	wordOk,
} from './osUpgrade'
import { READINESS_CHECKS } from './osReadiness'
import { sayEnglish } from './osPlan'
import real from './__fixtures__/os-plan-d11-12.json'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'

// ---- the core's words, pinned here ------------------------------------------------------------------------------------
// These lists MIRROR the core (the engine of v0.4.74): a code added to the core without a sentence in osUpgrade.js, or dropped from it, is noticed.

// pkg/osrun/vocab.go States
const STATES = ['idle', 'refreshing', 'reboot_first', 'refreshed', 'rehearsing', 'rehearsed', 'rehearsal_done', 'running', 'unwinding', 'recovering', 'awaiting_reboot', 'rebooting', 'reboot_stalled', 'resuming', 'verifying', 'succeeded', 'succeeded_with_findings', 'failed', 'interrupted', 'stopped_at_waypoint', 'needs_attention', 'manual', 'manual_done']
// pkg/osrun/vocab.go ActionNames, in the order the server lists them
const ACTION_NAMES = ['abort', 'reboot', 'resume', 'acknowledge', 'discard', 'takeover']
// pkg/osrun/vocab.go Classes
const CLASSES = ['busy', 'network', 'apt_failed', 'dpkg_broken', 'unknown', 'disk', 'plan', 'guard', 'converge', 'barrier_kernel', 'barrier_initrd', 'barrier_grub', 'barrier_sshd', 'barrier_resolver', 'barrier_other', 'identity', 'tools', 'unit', 'integrity', 'abort']
// pkg/osrun/vocab.go Reason* (a failed run), ReasonSystemdSilent / UnwindPartial / RunDamaged (a run that needs attention), Cause*
const FAILED_REASONS = ['start', 'verify', 'half', 'interrupted_power', 'interrupted_killed']
const ATTENTION_REASONS = ['systemd_silent', 'unwind_partial', 'run_damaged']
const CAUSES = ['power', 'killed']
// pkg/osrun/vocab.go RunKinds
const RUN_KINDS = ['refresh', 'rehearsal', 'hop']
// pkg/osrun/vocab.go BlockIDs, and Phases
const BLOCK_IDS = ['verify', 'timers', 'snapshot', 'sources', 'download', 'minimal', 'full', 'prereboot', 'after', 'forward', 'rcheck', 'rsources', 'rupgrade', 'rdone']
// pkg/osverify/judge.go Codes (errors first), and the facts of the judge (facts.go) that a verdict can say it did not look at
const FINDING_CODES = ['kernel_unexpected', 'casaos_unit_down', 'docker_down', 'mounts_missing', 'dpkg_not_quiet', 'system_not_ready', 'units_failed_new', 'ports_missing', 'samba_users_changed', 'route_missing', 'dns_missing', 'docker_version_changed', 'docker_source_unreachable', 'container_not_returned', 'facts_incomplete', 'docker_source_not_published', 'docker_source_paused', 'dpkg_dist_new', 'sources_left_paused', 'changed_since_snapshot', 'prereboot_warning']
const FINDING_SEVERITIES = { kernel_unexpected: 'error', casaos_unit_down: 'error', docker_down: 'error', mounts_missing: 'error', dpkg_not_quiet: 'error', system_not_ready: 'error', units_failed_new: 'warn', ports_missing: 'warn', samba_users_changed: 'warn', route_missing: 'warn', dns_missing: 'warn', docker_version_changed: 'warn', docker_source_unreachable: 'warn', container_not_returned: 'warn', facts_incomplete: 'warn', docker_source_not_published: 'info', docker_source_paused: 'info', dpkg_dist_new: 'info', sources_left_paused: 'info', changed_since_snapshot: 'info', prereboot_warning: 'info' }
const FACTS = ['kernel', 'system', 'dpkg', 'samba', 'mounts', 'route', 'dns', 'units', 'docker', 'containers', 'sources', 'listening', 'failed_units', 'all']
// service/system_os_upgrade_barrier.go osUpgradeBarrierChecks, and pkg/osplan/auto.go Warning*
const BARRIER_CODES = ['fstab_unresolved', 'fstab_network']
const WARNING_WORDS = ['initrd_small', 'grub_cfg_missing']
// service/system_os_upgrade.go OSUpgradeStartCodes, system_os_upgrade_refresh.go OSUpgradeRefreshCodes, system_os_upgrade_actions.go OSUpgradeActionCodes
const START_CODES = ['bad_request', 'beta_off', 'not_root', 'identity_unsupported', 'hop_not_planned', 'run_open', 'manual_run_found', 'no_plan', 'plan_changed', 'plan_blocked', 'plan_older_than_refresh', 'bad_safety_net', 'hostname_mismatch', 'acks_missing', 'removals_mismatch', 'paused_mismatch', 'sources_changed', 'readiness_refuses', 'busy', 'apps_busy', 'no_room', 'runbook_unsafe', 'runbook_too_large', 'start_failed']
const REFRESH_CODES = ['bad_request', 'beta_off', 'not_root', 'identity_unsupported', 'hop_not_planned', 'run_open', 'manual_run_found', 'readiness_refuses', 'busy', 'apps_busy', 'no_room', 'source_unrecognized', 'runbook_unsafe', 'runbook_too_large', 'start_failed']
const ACTION_CODES = ['no_run', 'run_unreadable', 'not_abortable', 'not_awaiting_reboot', 'barrier_failed', 'unit_active', 'dpkg_locked', 'reboot_failed', 'not_resumable', 'not_terminal', 'word_required', 'bad_word', 'close_failed', 'busy']
// route/v1/system_os_upgrade.go (a failure that no refusal covers), service/system_os_upgrade_power.go (the restart and the shutdown of the top bar)
const OTHER_CODES = ['internal', 'os_upgrade_open']
const ALL_REFUSALS = [...new Set([...START_CODES, ...REFRESH_CODES, ...ACTION_CODES, ...OTHER_CODES])]
// the statuses the core answers a refusal with (route/v1/system_os_upgrade.go osUpgradeFailed)
const STATUS_OF = { bad_request: 400, start_failed: 500, reboot_failed: 500, close_failed: 500, internal: 500 }
// service/system_os_upgrade.go osUpgradeSafetyNets, osUpgradeAcks
const CORE_SAFETY_NETS = ['snapshot', 'console_and_backup', 'reinstall_ok']
const CORE_ACKS = ['no_interruption', 'no_way_back', 'sources_paused', 'removals_read']
// osrun.AckWord
const ACK_WORD = 'I-KNOW-THIS-MACHINE-IS-HALF-UPGRADED'

const sorted = list => [...list].sort()

// ---- what the core answers ----------------------------------------------------------------------------------------------

const ID = real.plan_id
const SINCE = '2026-10-17T10:00:00Z'
const LATER = '2026-10-17T10:03:30Z'

// a status as the core makes it: every field the route has, the way osUpgradeStatusOf fills them
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
const view = (changes = {}, locale) => statusView(status(changes), locale)

const BK = '/var/backups/casaos-os-upgrade-p1-0123456789abcdef0123456789abcdef'
const RUN = '0b9cbd61-5d2c-4a39-9c3e-2f7c0a1d6a11'
const block = (index, id, title = '') => ({ index, id, title })
const hopBlock = id => block(Object.keys(BLOCK_NUMBERS).indexOf(id) + 1, id, BLOCK_TITLES[Object.keys(BLOCK_NUMBERS).indexOf(id)])
const hint = { bk_path: BK, log: `/var/lib/casaos/os-upgrade/${RUN}/output.log`, commands: ['uname -r', 'systemctl --failed --no-pager', 'dpkg --audit', `ls ${BK}`, 'tail -n 60 /var/lib/casaos/os-upgrade/x/output.log'], block8: '# block 8\necho after' }
const barrierOk = { ok: true, checks: [{ code: 'fstab_unresolved', ok: true, severity: 'ok' }, { code: 'fstab_network', ok: true, severity: 'ok' }] }
const barrierRed = { ok: false, checks: [{ code: 'fstab_unresolved', ok: false, severity: 'refuse' }, { code: 'fstab_network', ok: true, severity: 'ok' }, { code: 'prereboot_warning', ok: true, severity: 'warn', arg: 'initrd_small' }] }

// One status for each state of the core, as osrun.ActionsFor lists the buttons of it (pkg/osrun/action.go), and the group, the colour and
// the sentence it should have. `kind` is the kind of run the state comes with.
const CASES = {
	idle: { group: 'idle', actions: [] },
	refreshing: { group: 'working', extra: { kind: 'refresh', phase: 'refresh', block: block(2, 'rsources'), busy: true }, actions: ['abort'] },
	reboot_first: { group: 'waiting', extra: { kind: 'refresh', busy: true, since: SINCE }, actions: ['reboot', 'acknowledge'] },
	refreshed: { group: 'done', extra: { kind: 'refresh', since: SINCE }, actions: ['acknowledge'] },
	rehearsing: { group: 'working', extra: { kind: 'rehearsal', phase: 'rehearse', block: block(3, 'snapshot'), busy: true }, actions: ['abort'] },
	rehearsed: { group: 'waiting', extra: { kind: 'rehearsal', busy: true, expires_at: '2026-10-17T10:30:00Z' }, actions: ['discard'] },
	rehearsal_done: { group: 'done', extra: { kind: 'rehearsal' }, actions: ['acknowledge'] },
	running: { group: 'working', extra: { kind: 'hop', phase: 'run', block: hopBlock('full'), busy: true, pnr: true, half_upgraded: true }, actions: [] },
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
const caseOf = (state, extra = {}) => status({ state, run_id: state === 'idle' ? '' : RUN, ...CASES[state].extra, actions: CASES[state].actions, ...extra })

// the control characters but the end of a line and the tab, the marks that turn a text round and the marks that show nothing
function unsafeIn(text) {
	return [...text].filter((char) => {
		const code = char.codePointAt(0)
		return (code < 32 && char !== '\n' && char !== '\t') || (code >= 127 && code <= 159) || (code >= 0x202A && code <= 0x202E) || (code >= 0x2066 && code <= 0x2069)
			|| (code >= 0x200B && code <= 0x200F) || code === 0x061C || code === 0x2060 || code === 0xFEFF || code === 0x2028 || code === 0x2029 || code === 0xAD || (code >= 0xE0000 && code <= 0xE007F)
	})
}

// every string a value holds, with where it is
function stringsIn(value, path = '') {
	if (typeof value === 'string')
		return [[path, value]]
	if (Array.isArray(value))
		return value.flatMap((item, index) => stringsIn(item, `${path}[${index}]`))
	if (value && typeof value === 'object')
		return Object.entries(value).flatMap(([name, item]) => stringsIn(item, `${path}.${name}`))
	return []
}

// every language-file key a view says: its messages ({ key, params }) and the fields that are keys
function keysIn(value) {
	if (Array.isArray(value))
		return value.flatMap(keysIn)
	if (value && typeof value === 'object') {
		const own = typeof value.key === 'string' && value.params && typeof value.params === 'object' ? [value.key] : []
		return [...own, ...Object.entries(value).flatMap(([name, item]) => {
			// the title of a block is the core's own words, and its titleKey the key of them when the language files have one
			if (name === 'block')
				return item?.titleKey ? [item.titleKey] : []
			if (['title', 'what', 'next', 'label', 'groupLabel'].includes(name) && typeof item === 'string')
				return item ? [item] : []
			return keysIn(item)
		})]
	}
	return []
}

// ---- the tables, and the core's words ------------------------------------------------------------------------------------

describe('the tables, and the core\'s words', () => {
	it('says every state of the core, and no other', () => {
		expect(sorted(Object.keys(STATE_TABLE))).toEqual(sorted(STATES))
		expect(sorted(Object.keys(CASES))).toEqual(sorted(STATES))
	})

	it('says every kind of run of the core, and no other', () => {
		expect(sorted(Object.keys(TEXT.kinds))).toEqual(sorted(RUN_KINDS))
	})

	it('says every action of the core, and no other', () => {
		expect(sorted(Object.keys(BUTTONS))).toEqual(sorted(ACTION_NAMES))
	})

	it('says every class of a stop, and the reasons that stand in for one, and no other', () => {
		expect(sorted(Object.keys(CLASS_TABLE))).toEqual(sorted([...CLASSES, ...FAILED_REASONS.filter(reason => !CLASSES.includes(reason))]))
	})

	it('says every finding of the check, every check before the restart, every warning of block 7 and every fact, and no other', () => {
		expect(sorted(Object.keys(FINDINGS))).toEqual(sorted(FINDING_CODES))
		expect(sorted(Object.keys(BARRIER_CHECKS))).toEqual(sorted(BARRIER_CODES))
		expect(sorted(Object.keys(PREREBOOT_WORDS))).toEqual(sorted(WARNING_WORDS))
		expect(sorted(Object.keys(NOT_JUDGED))).toEqual(sorted(FACTS))
	})

	it('has a sentence for every code that a request can be refused with, and no other', () => {
		expect(sorted(Object.keys(REFUSALS))).toEqual(sorted(ALL_REFUSALS))
		// the lists of the three routes, in the core's order
		expect(START_CODES).toHaveLength(24)
		expect(REFRESH_CODES).toHaveLength(15)
		expect(ACTION_CODES).toHaveLength(14)
	})

	it('has the safety nets and the acknowledgements of the core, in its order', () => {
		expect(SAFETY_NETS).toEqual(CORE_SAFETY_NETS)
		expect(START_ACKS).toEqual(CORE_ACKS)
		expect(sorted(Object.keys(SAFETY_NET_TEXTS))).toEqual(sorted(CORE_SAFETY_NETS))
		expect(sorted(Object.keys(ACK_TEXTS))).toEqual(sorted(CORE_ACKS))
	})

	it('has a title for the blocks the core can run', () => {
		expect(Object.keys(BLOCK_NUMBERS)).toEqual(BLOCK_IDS.slice(0, 9))
		// the nine of the hop, the four of the refresh and the one that mends a hop
		expect(BLOCK_TITLES).toHaveLength(14)
	})

	// the last sentence of each code has no placeholder: a core that sent no data still gets its sentence
	const lists = (entry) => {
		const table = Array.isArray(entry) ? { text: entry } : entry
		return [table.text, ...Object.values(table.variants ?? {})]
	}
	it.each(Object.entries(REFUSALS))('ends %s on a sentence with no placeholder', (_, entry) => {
		for (const list of lists(entry))
			expect(list.at(-1)).not.toMatch(/\{\w+\}/)
	})

	it('has each key once, and a good many', () => {
		expect(new Set(UPGRADE_KEYS).size).toBe(UPGRADE_KEYS.length)
		expect(UPGRADE_KEYS.length).toBeGreaterThan(300)
		for (const key of [STATE_TABLE.awaiting_reboot.what, STATE_VARIANTS.failed_verify.next[0].key, CLASS_TABLE.barrier_sshd.what, FINDINGS.kernel_unexpected, REFUSALS.hostname_mismatch[0], BUTTONS.reboot.confirm.title, TEXT.banners.pnr, TEXT.outage.restarting, CALL_ERRORS.signin, ACK_TEXTS.no_way_back])
			expect(UPGRADE_KEYS).toContain(key)
	})
})

describe('the language files', () => {
	it.each(UPGRADE_KEYS)('say "%s" in English and in French', (key) => {
		expect(en[key]).toBe(key)
		expect(fr[key]).toBeTruthy()
		expect(fr[key]).not.toBe(key)
		// in the order of the English: {needed} and {free} are not interchangeable
		expect(fr[key].match(/\{\w+\}/g) || []).toEqual(key.match(/\{\w+\}/g) || [])
		// French sets a space before : ? ! ; and a percent sign, and the English text has none to copy
		expect(fr[key]).not.toMatch(/\S[:?!;]/)
		expect(fr[key]).not.toMatch(/[^\s%]%/)
		// the characters that vue-i18n reads as syntax are only ever the placeholders
		expect(key.replace(/\{\w+\}/g, '')).not.toMatch(/[{}|@$]/)
		expect(fr[key].replace(/\{\w+\}/g, '')).not.toMatch(/[{}|@$]/)
	})
})

// ---- the states -----------------------------------------------------------------------------------------------------------

describe('the view of each state', () => {
	it.each(STATES)('says %s: what it is and what to do, in both languages, and shows the server\'s buttons', (state) => {
		const raw = caseOf(state)
		const v = statusView(raw)
		expect(v).not.toBeNull()
		expect(v.known).toBe(true)
		expect(v.state).toBe(state)
		expect(v.group).toBe(CASES[state].group)
		expect(v.open).toBe(state !== 'idle')
		for (const key of [v.title, v.what, v.next, v.groupLabel]) {
			expect(UPGRADE_KEYS, key).toContain(key)
			expect(en[key]).toBe(key)
			expect(fr[key]).not.toBe(key)
		}
		expect(v.buttons.map(button => button.action)).toEqual(CASES[state].actions)
		// every sentence the view says is a key of the language files
		for (const key of keysIn(v))
			expect(UPGRADE_KEYS, key).toContain(key)
	})

	it.each(STATES)('says %s in French in the same way', (state) => {
		const v = statusView(caseOf(state), 'fr_fr')
		expect(fr[v.title]).toBeTruthy()
		expect(fr[v.what]).toBeTruthy()
		expect(fr[v.next]).toBeTruthy()
	})

	it('tells the groups, the colour and the label of a group', () => {
		expect(view({ state: 'running' }).tone).toBe('is-info')
		expect(view({ state: 'succeeded' }).tone).toBe('is-success')
		expect(view({ state: 'succeeded_with_findings' }).tone).toBe('is-warning')
		expect(view({ state: 'failed' }).tone).toBe('is-danger')
		// the colour is never alone: the group has its words
		expect(view({ state: 'failed' }).groupLabel).toBe(TEXT.groups.stopped)
		expect(view({ state: 'awaiting_reboot' }).groupLabel).toBe(TEXT.groups.waiting)
	})

	it('picks the sentence of a failed run by why it failed, and by its kind', () => {
		const pick = extra => view({ state: 'failed', ...extra })
		expect(pick({ kind: 'hop' }).title).toBe(STATE_TABLE.failed.title)
		expect(pick({ kind: 'refresh' }).title).toBe(STATE_VARIANTS.failed_refresh.title)
		expect(pick({ kind: 'rehearsal' }).title).toBe(STATE_VARIANTS.failed_rehearsal.title)
		expect(pick({ kind: 'hop', reason: 'verify', pnr: true }).title).toBe(STATE_VARIANTS.failed_verify.title)
		expect(pick({ kind: 'hop', reason: 'half', pnr: true }).title).toBe(STATE_VARIANTS.failed_half.title)
		expect(pick({ kind: 'hop', reason: 'start', pnr: true }).title).toBe(STATE_VARIANTS.failed_start.title)
		expect(pick({ kind: 'hop', reason: 'start', pnr: false }).title).toBe(STATE_VARIANTS.failed_not_started.title)
		// the class of a stop that the unit named: the sentence of the state stays
		expect(pick({ kind: 'hop', reason: 'network' }).title).toBe(STATE_TABLE.failed.title)
	})

	it('picks the sentence of a run that needs attention by why, and a generic one for a reason it does not know', () => {
		const pick = reason => view({ state: 'needs_attention', reason })
		expect(pick('systemd_silent').title).toBe(STATE_VARIANTS.needs_attention_systemd_silent.title)
		expect(pick('unwind_partial').title).toBe(STATE_VARIANTS.needs_attention_unwind_partial.title)
		expect(pick('run_damaged').title).toBe(STATE_VARIANTS.needs_attention_run_damaged.title)
		for (const reason of ['', 'from_the_future', 'constructor', '__proto__'])
			expect(pick(reason).title).toBe(STATE_TABLE.needs_attention.title)
		for (const reason of ATTENTION_REASONS)
			expect(pick(reason).known).toBe(true)
	})

	it('tells an interrupted run by whether the point of no return is behind it, and says how it was interrupted', () => {
		expect(view({ state: 'interrupted', pnr: false }).title).toBe(STATE_TABLE.interrupted.title)
		expect(view({ state: 'interrupted', pnr: true }).title).toBe(STATE_VARIANTS.interrupted_after.title)
		for (const cause of CAUSES) {
			const v = view({ state: 'interrupted', cause })
			expect(v.cause.key).toBe(TEXT.cause[cause])
		}
		// a boot that could not be told: the cause is a guess, and is not said as one
		expect(view({ state: 'interrupted', cause: 'killed', boot_unknown: true }).cause.key).toBe(TEXT.cause.unknown)
		expect(view({ state: 'interrupted', cause: 'from_the_future' }).cause.key).toBe(TEXT.cause.unknown)
		expect(view({ state: 'running' }).cause).toBeNull()
	})

	it('lists each code once for support, whatever the core repeats', () => {
		const v = view({ state: 'failed', reason: 'network', failure: { stage: 'download', class: 'network', rc: 100 } })
		expect(v.codes).toEqual(['failed', 'network', 'download'])
		expect(view({ state: 'failed', reason: 'full', failure: { stage: 'full', class: 'full' } }).codes).toEqual(['failed', 'full'])
		for (const state of STATES) {
			const codes = statusView(caseOf(state)).codes
			expect(new Set(codes).size, state).toBe(codes.length)
		}
	})

	it('says a class of stop for each class and each reason the core has', () => {
		for (const code of [...CLASSES, ...FAILED_REASONS]) {
			const v = view({ state: 'stopped_at_waypoint', pnr: true, actions: ['resume', 'acknowledge', 'takeover'], failure: { stage: 'full', class: code, rc: 1 } })
			expect(v.failure.what.key, code).toBe(CLASS_TABLE[code].what)
			// what to mend, then where the buttons lead: a reason is told by its state, and has neither
			const route = CLASS_TABLE[code].route === false ? [] : CLASS_TABLE[code].fix ? [ROUTES.goOn] : []
			expect(v.failure.next.map(message => message.key), code).toEqual([...CLASS_TABLE[code].route === false || !CLASS_TABLE[code].fix ? [] : [CLASS_TABLE[code].fix], ...route])
			expect(v.failure.code).toBe(code)
		}
		const unknown = view({ state: 'failed', failure: { stage: 'full', class: 'something_new', rc: 1 } })
		expect(unknown.failure.what.params).toEqual({ code: 'something_new' })
		expect(sayEnglish(unknown.failure.what)).toBe('The step stopped for a reason this page does not know: something_new.')
		for (const name of ['constructor', '__proto__', 'toString', ''])
			expect(view({ state: 'failed', failure: { class: name } }).failure.what.key).toBe(('The step stopped for a reason this page does not know: {code}.'))
	})

	it('says the exit status only when it tells something: the core sends 0 when no block exited', () => {
		const rc = failure => view({ state: 'failed', failure: { stage: 'full', class: 'network', ...failure } }).failure.rc
		expect(rc({ rc: 100 })).toBe(100)
		expect(rc({ rc: 1, detail_line: 'STOP: x' })).toBe(1)
		// a check that failed, a run that did not start: there is no status of a block to say
		expect(rc({ rc: 0 })).toBeNull()
		expect(rc({})).toBeNull()
		expect(rc({ rc: 0, detail_line: '   ' })).toBeNull()
		// a line that says why makes the 0 a thing that was said
		expect(rc({ rc: 0, detail_line: 'STOP: the block ended with no error' })).toBe(0)
		expect(rc({ rc: -1 })).toBe(-1)
	})

	it('says the line that stopped it as text, and the hint that goes with it', () => {
		const v = view({ state: 'failed', kind: 'refresh', failure: { stage: 'rsources', class: 'network', rc: 100, detail_line: 'STOP: E: Failed to fetch', hint: 'releaseinfo_change' } })
		expect(v.failure.detail).toBe('STOP: E: Failed to fetch')
		expect(v.failure.rc).toBe(100)
		expect(v.failure.stage).toBe('rsources')
		expect(v.failure.hintCode).toBe('releaseinfo_change')
		expect(UPGRADE_KEYS).toContain(v.failure.hint.key)
		// a hint it does not know says nothing
		expect(view({ state: 'failed', failure: { class: 'network', hint: 'from_the_future' } }).failure.hint).toBeNull()
	})
})

describe('a state this page does not know', () => {
	it('says so, with the state as text, and has no button whatever the server lists', () => {
		const v = view({ state: 'a_state_of_a_later_core', actions: ['abort', 'reboot', 'resume', 'acknowledge', 'discard', 'takeover'], busy: true, pnr: true })
		expect(v.known).toBe(false)
		expect(v.state).toBe('a_state_of_a_later_core')
		expect(v.title).toBe('This page does not know this state')
		expect(v.buttons).toEqual([])
		expect(v.group).toBe('unknown')
		// the banners stay: they are the machine's, not the state's
		expect(v.banners.map(banner => banner.id)).toEqual(['pnr', 'busy'])
		// and it counts as a run that is open: it is not guessed to be idle
		expect(v.open).toBe(true)
		expect(v.launch.start).toBe(false)
		expect(v.launch.switch).toBe(false)
	})

	it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', 'IDLE', ' idle', 'idle '])('does not take "%s" for a state', (state) => {
		const v = view({ state, actions: ['abort'] })
		expect(v.known).toBe(false)
		expect(v.buttons).toEqual([])
	})

	it('shows the state as text, cleaned and cut', () => {
		const v = view({ state: `<b>x</b>\u0007‮${'y'.repeat(500)}` })
		expect(v.state.length).toBeLessThanOrEqual(40)
		expect(unsafeIn(v.state)).toEqual([])
	})

	it.each([null, undefined, 42, true, 'running', [], [{ state: 'idle' }], {}, { state: null }, { state: 42 }, { state: '' }, { state: [] }, { state: {} }])('is not a status: %j', (raw) => {
		expect(statusView(raw)).toBeNull()
	})
})

// ---- what to do follows the buttons -----------------------------------------------------------------------------------------

describe('what the person is told to do follows the buttons the server offers', () => {
	const next = (state, actions, extra = {}) => statusView(caseOf(state, { actions, ...extra })).next
	const todo = (state, cls, actions, extra = {}) => statusView(caseOf(state, { actions, failure: { stage: 'full', class: cls, rc: 1 }, ...extra })).failure.next.map(sayEnglish)

	it('does not say "stop it" when there is no button that stops it', () => {
		for (const state of ['refreshing', 'rehearsing', 'running']) {
			expect(next(state, ['abort']), state).toContain('You can stop it')
			expect(next(state, []), state).not.toMatch(/stop/)
			expect(next(state, [])).toMatch(/^Wait, and do not run apt/)
		}
		// past the point of no return, the unit that runs cannot be called off
		expect(next('running', [], { pnr: true })).toBe('Wait, and do not run apt or restart the machine.')
	})

	it('does not say "take the run over" or "drop the plan" when the server offers neither', () => {
		expect(next('needs_attention', ['acknowledge', 'takeover'], { reason: 'run_damaged' })).toBe('Look at the machine first. Then take the run over, or close this run with the word.')
		expect(next('needs_attention', ['acknowledge'], { reason: 'run_damaged' })).toBe('Look at the machine first. Then close this run with the word.')
		expect(next('needs_attention', ['acknowledge'], { reason: 'unwind_partial' })).not.toMatch(/take the run over/)
		expect(next('needs_attention', ['acknowledge'], { reason: 'unwind_partial' })).toMatch(/close this run with the word/)
		expect(next('needs_attention', ['acknowledge'], { reason: '' })).toBe('Look at the machine, then close this run with the word.')
		expect(next('needs_attention', ['acknowledge', 'takeover'], { reason: '' })).toMatch(/take the run over/)
		expect(next('failed', ['acknowledge', 'discard'])).toBe('Read why below, then close this run or drop the plan.')
		expect(next('failed', ['acknowledge'])).toBe('Read why below, then close this run.')
		expect(next('stopped_at_waypoint', ['resume', 'acknowledge', 'takeover'])).toMatch(/Go on if it can be gone on from, or take the run over/)
		expect(next('stopped_at_waypoint', ['acknowledge', 'takeover'])).toBe('Read why below, then take the run over or close this run.')
		expect(next('stopped_at_waypoint', ['acknowledge'])).toBe('Read why below, then close this run.')
	})

	it('does not say "go on" when the server does not offer to go on', () => {
		expect(next('failed', ['acknowledge', 'takeover'], { reason: 'start', pnr: true })).toBe('Take the run over.')
		expect(next('failed', ['resume', 'takeover'], { reason: 'start', pnr: true })).toBe('Go on, or take the run over.')
		expect(next('failed', ['acknowledge', 'takeover'], { reason: 'half', pnr: true })).toBe('Take the run over.')
		expect(next('failed', ['acknowledge', 'takeover'], { reason: 'verify', pnr: true })).not.toMatch(/ask for the check again/)
		expect(next('failed', ['resume', 'acknowledge', 'takeover'], { reason: 'verify', pnr: true })).toMatch(/Ask for the check again/)
		expect(next('interrupted', ['acknowledge', 'takeover'], { pnr: true })).toBe('Take the run over, or close this run with the word.')
		expect(next('interrupted', ['acknowledge'], { pnr: true })).toBe('Close this run with the word.')
		expect(next('succeeded_with_findings', ['acknowledge'])).toBe('Read what the check found, then close this run.')
		expect(next('succeeded_with_findings', ['resume', 'acknowledge'])).toMatch(/ask for the check again/)
	})

	it('does not say "restart" when the restart is not offered, and says what is awaited', () => {
		expect(next('awaiting_reboot', ['reboot', 'takeover'])).toMatch(/^Restart the machine when you are ready/)
		expect(next('awaiting_reboot', ['takeover'])).toBe('The restart is not offered yet. Wait, or take the run over to finish by hand.')
		expect(next('awaiting_reboot', [])).toBe('Wait.')
		expect(next('reboot_stalled', ['reboot', 'takeover'])).toMatch(/ask for the restart again/)
		expect(next('reboot_stalled', ['takeover'])).toBe('Look at the screen of the machine.')
	})

	it('does not imply that the checks before the restart look at the network', () => {
		const sentence = next('awaiting_reboot', ['reboot', 'takeover'])
		expect(sentence).not.toMatch(/checks are green/)
		expect(sentence).toContain('do not look at the names of the network cards')
		expect(sentence).toContain('ip -br link')
	})

	it('does not say that the machine is half upgraded when it is not', () => {
		const what = extra => statusView(caseOf('failed', { reason: 'start', pnr: true, actions: ['takeover'], ...extra })).what
		expect(what({ half_upgraded: true })).toBe('The next step could not be started, and the machine is half upgraded.')
		expect(what({ half_upgraded: false })).toBe('The next step could not be started.')
		expect(what({})).toBe('The next step could not be started.')
	})

	it('has a sentence for every state and every set of buttons, in both languages', () => {
		const sets = [[], ACTION_NAMES, ['abort'], ['reboot'], ['takeover'], ['acknowledge'], ['resume'], ['discard'], ['resume', 'takeover'], ['acknowledge', 'takeover'], ['reboot', 'takeover']]
		const extras = [{}, { pnr: true }, { half_upgraded: true }, { reason: 'start', pnr: true }, { reason: 'verify', pnr: true }, { reason: 'half', pnr: true }, { reason: 'run_damaged' }, { reason: 'unwind_partial' }, { reason: 'systemd_silent' }]
		for (const state of STATES) {
			for (const actions of sets) {
				for (const extra of extras) {
					const v = statusView(caseOf(state, { actions, ...extra }))
					for (const key of [v.what, v.next].filter(Boolean)) {
						expect(UPGRADE_KEYS, `${state} ${actions} ${JSON.stringify(extra)}: ${key}`).toContain(key)
						expect(fr[key]).not.toBe(key)
					}
					expect(v.what, `${state} ${JSON.stringify(extra)}`).toBeTruthy()
				}
			}
		}
	})

	describe('after a stop', () => {
		it('tells a stop before the point of no return to be closed and tried again, with what is to be mended', () => {
			expect(todo('failed', 'disk', ['acknowledge', 'discard'])).toEqual(['Make room.', 'Close this run, then try again.'])
			expect(todo('failed', 'network', ['acknowledge', 'discard'])).toEqual(['Check the network and the name server of the machine.', 'Close this run, then try again.'])
			// nothing to mend: the machine was put back
			expect(todo('failed', 'plan', ['acknowledge', 'discard'])).toEqual(['Close this run, then try again.'])
			expect(todo('failed', 'abort', ['acknowledge', 'discard'])).toEqual(['Close this run, then try again.'])
			// and never "go on" or "take the run over" that the buttons do not offer
			for (const cls of CLASSES) {
				const said = todo('failed', cls, ['acknowledge', 'discard']).join(' ')
				expect(said, cls).not.toMatch(/go on|take the run over/i)
				expect(said, cls).toMatch(/Close this run, then try again\.$/)
			}
		})

		it('tells a stop after it to be gone on from when the server offers to, and only then', () => {
			expect(todo('stopped_at_waypoint', 'disk', ['resume', 'acknowledge', 'takeover'], { pnr: true })).toEqual(['Make room.', 'Then go on.'])
			expect(todo('stopped_at_waypoint', 'busy', ['resume', 'acknowledge', 'takeover'], { pnr: true })).toEqual(['Wait until the other package manager ends.', 'Then go on.'])
			expect(todo('stopped_at_waypoint', 'guard', ['acknowledge', 'takeover'], { pnr: true })).toEqual(['Take the run over.'])
			expect(todo('stopped_at_waypoint', 'plan', ['acknowledge', 'takeover'], { pnr: true })).toEqual(['Take the run over.'])
			expect(todo('stopped_at_waypoint', 'network', ['acknowledge', 'takeover'], { pnr: true })).toEqual(['Check the network and the name server of the machine.', 'Take the run over.'])
			expect(todo('stopped_at_waypoint', 'network', ['acknowledge'], { pnr: true })).toEqual(['Check the network and the name server of the machine.', 'Close this run.'])
			expect(todo('stopped_at_waypoint', 'network', [], { pnr: true })).toEqual(['Check the network and the name server of the machine.'])
		})

		it('says nothing to do about a stop it does not know, and none for a reason, which its state tells', () => {
			expect(todo('stopped_at_waypoint', 'something_new', ['resume', 'takeover'], { pnr: true })).toEqual([])
			for (const reason of FAILED_REASONS)
				expect(todo('failed', reason, ['acknowledge', 'takeover'], { pnr: true }), reason).toEqual([])
		})

		it('has the fix and the route of every class in the language files', () => {
			for (const entry of Object.values(CLASS_TABLE)) {
				for (const key of [entry.what, entry.fix].filter(Boolean))
					expect(UPGRADE_KEYS).toContain(key)
			}
			for (const key of Object.values(ROUTES))
				expect(UPGRADE_KEYS).toContain(key)
		})

		it('says the move of the security updates of Debian 11 to a refresh whose download did not go through, and to no other run', () => {
			const note = (kind, cls) => statusView(caseOf('failed', { kind, failure: { stage: 'rsources', class: cls, rc: 100 } })).failure.note
			expect(note('refresh', 'network')).toEqual({ key: REFRESH_NETWORK_NOTE, params: {} })
			expect(REFRESH_NETWORK_NOTE).toContain('archive.debian.org/debian-security')
			expect(note('hop', 'network')).toBeNull()
			expect(note('rehearsal', 'network')).toBeNull()
			expect(note('refresh', 'disk')).toBeNull()
			expect(UPGRADE_KEYS).toContain(REFRESH_NETWORK_NOTE)
		})
	})

	describe('the restart of a refresh', () => {
		const confirm = kind => statusView(caseOf('awaiting_reboot', { kind, actions: ['reboot'] })).buttons[0].confirm

		it('comes back on the same release, and the restart of the upgrade comes back on the new one', () => {
			const refresh = statusView(caseOf('reboot_first', { actions: ['reboot'] })).buttons[0].confirm
			expect(refresh.body.join(' ')).toContain('same release')
			expect(refresh.body.join(' ')).not.toMatch(/into the new release/)
			expect(refresh.danger).toBe(true)
			expect(confirm('hop').body[0]).toContain('into the new release')
			expect(confirm('hop').body[0]).not.toContain('same release')
			// keys the language files have
			for (const key of [refresh.title, ...refresh.body, refresh.ok]) {
				expect(UPGRADE_KEYS).toContain(key)
				expect(fr[key]).not.toBe(key)
			}
			// a status with no kind is the upgrade's
			expect(confirm(undefined).body[0]).toContain('into the new release')
		})
	})

	describe('the banner of the point of no return', () => {
		const banners = (state, extra = {}) => statusView(caseOf(state, { pnr: true, ...extra })).banners.map(banner => banner.id)

		it('is not on a run that ended well', () => {
			expect(banners('succeeded')).not.toContain('pnr')
			expect(banners('succeeded_with_findings')).not.toContain('pnr')
		})

		it('is on the others', () => {
			for (const state of STATES.filter(state => !['idle', 'succeeded', 'succeeded_with_findings'].includes(state)))
				expect(banners(state), state).toContain('pnr')
		})
	})

	describe('the machine that waits for its restart', () => {
		const pending = (state, extra = {}) => statusView(caseOf(state, extra)).barrierPending

		it('says that the checks are not made yet when the restart is not offered and the status carries none', () => {
			expect(pending('awaiting_reboot', { actions: ['takeover'], barrier: undefined })).toBe(true)
			expect(pending('reboot_stalled', { actions: ['takeover'], barrier: null })).toBe(true)
			expect(UPGRADE_KEYS).toContain(TEXT.lists.barrierPending)
		})

		it('does not, when the restart is offered, when the checks are there, or in another state', () => {
			expect(pending('awaiting_reboot', { actions: ['reboot', 'takeover'], barrier: undefined })).toBe(false)
			expect(pending('awaiting_reboot', { actions: ['takeover'], barrier: barrierRed })).toBe(false)
			expect(pending('awaiting_reboot', { actions: ['takeover'], barrier: barrierOk })).toBe(false)
			expect(pending('running', { actions: [], barrier: undefined })).toBe(false)
			expect(pending('rebooting', { actions: [], barrier: undefined })).toBe(false)
		})
	})
})

// ---- the buttons ---------------------------------------------------------------------------------------------------------

describe('the buttons are the server\'s list', () => {
	const names = raw => statusView(raw).buttons.map(button => button.action)

	it('shows exactly the list, in the server\'s order', () => {
		expect(names(caseOf('succeeded_with_findings', { actions: ['resume', 'acknowledge'] }))).toEqual(['resume', 'acknowledge'])
		// an order of the server's own, not ours
		expect(names(caseOf('awaiting_reboot', { actions: ['takeover', 'reboot'] }))).toEqual(['takeover', 'reboot'])
	})

	it('shows none for a state whose list is empty, whatever the state is', () => {
		for (const state of STATES)
			expect(names(caseOf(state, { actions: [] })), state).toEqual([])
	})

	it('shows no button for an action that is not in the list', () => {
		// a restart is not offered by a machine whose list does not have it, even when it waits for its restart
		expect(names(caseOf('awaiting_reboot', { actions: ['takeover'] }))).toEqual(['takeover'])
		expect(names(caseOf('awaiting_reboot', { actions: [], barrier: barrierRed }))).toEqual([])
		expect(names(caseOf('failed', { actions: ['acknowledge'] }))).toEqual(['acknowledge'])
		for (const action of ACTION_NAMES) {
			const others = ACTION_NAMES.filter(name => name !== action)
			expect(names(caseOf('failed', { actions: others })), action).toEqual(others)
		}
	})

	it('shows an action once, and none that it does not know', () => {
		expect(names(caseOf('failed', { actions: ['acknowledge', 'acknowledge', 'discard', 'acknowledge'] }))).toEqual(['acknowledge', 'discard'])
		expect(names(caseOf('failed', { actions: ['launch_rockets', 'acknowledge', '__proto__', 'constructor', 'toString', '', 7, null, {}, ['abort']] }))).toEqual(['acknowledge'])
		expect(names(caseOf('failed', { actions: ['ABORT', ' abort', 'abort '] }))).toEqual([])
	})

	it('shows none when the list is not a list', () => {
		for (const actions of [undefined, null, 'abort', 7, true, {}, { 0: 'abort' }])
			expect(names(caseOf('failed', { actions })), JSON.stringify(actions)).toEqual([])
	})

	it('shows at most the buttons that exist, whatever the length of the list', () => {
		const huge = Array.from({ length: 100000 }, (_, i) => ACTION_NAMES[i % 6])
		expect(names(caseOf('failed', { actions: huge }))).toEqual(ACTION_NAMES)
	})

	it('gives each button the call to make, the word it says, and a label in the language files', () => {
		const v = statusView(caseOf('failed', { actions: ACTION_NAMES }))
		const by = Object.fromEntries(v.buttons.map(button => [button.action, button]))
		expect(by.abort.call).toBe('abortOsUpgrade')
		expect(by.reboot.call).toBe('rebootOsUpgrade')
		expect(by.resume.call).toBe('resumeOsUpgrade')
		expect(by.acknowledge).toMatchObject({ call: 'ackOsUpgrade', ack: 'acknowledge' })
		expect(by.discard).toMatchObject({ call: 'ackOsUpgrade', ack: 'discard' })
		// taking over is `manual` for the core
		expect(by.takeover).toMatchObject({ call: 'ackOsUpgrade', ack: 'manual' })
		for (const button of v.buttons) {
			expect(UPGRADE_KEYS).toContain(button.label)
			expect(fr[button.label]).not.toBe(button.label)
		}
	})

	it('asks to confirm what cannot be undone, and puts the focus away from its main button', () => {
		const by = Object.fromEntries(statusView(caseOf('failed', { actions: ACTION_NAMES })).buttons.map(button => [button.action, button]))
		for (const action of ['abort', 'reboot', 'takeover']) {
			expect(by[action].confirm, action).toBeTruthy()
			expect(by[action].confirm.danger, action).toBe(true)
			for (const key of [by[action].confirm.title, ...by[action].confirm.body, by[action].confirm.ok])
				expect(UPGRADE_KEYS).toContain(key)
		}
		for (const action of ['resume', 'acknowledge', 'discard'])
			expect(by[action].confirm, action).toBeNull()
		// what is put back, and that it is the person's to be there, are said
		expect(by.abort.confirm.body.join(' ')).toMatch(/put back/)
		expect(by.reboot.confirm.body.join(' ')).toMatch(/screen of the machine/)
		expect(by.takeover.confirm.body.join(' ')).toMatch(/stops acting/)
	})

	it('names going on after a check as asking for the check again, and dropping a rehearsal as putting the machine back', () => {
		const label = (state, action, extra = {}) => statusView(caseOf(state, { actions: [action], ...extra })).buttons[0].label
		expect(label('succeeded_with_findings', 'resume')).toBe('Check the machine again')
		expect(label('failed', 'resume', { reason: 'verify', pnr: true })).toBe('Check the machine again')
		expect(label('failed', 'resume', { reason: 'half', pnr: true })).toBe('Go on with the upgrade')
		expect(label('stopped_at_waypoint', 'resume')).toBe('Go on with the upgrade')
		expect(label('rehearsed', 'discard')).toBe('Put the machine back')
		expect(label('failed', 'discard')).toBe('Close this run and drop the plan')
	})
})

describe('the word that closes a run', () => {
	it('asks for the word of the status on the button that closes a run, and on no other', () => {
		const v = statusView(caseOf('stopped_at_waypoint'))
		expect(v.wordNeeded).toBe(true)
		expect(v.ackWord).toBe(ACK_WORD)
		const by = Object.fromEntries(v.buttons.map(button => [button.action, button]))
		expect(by.acknowledge.needsWord).toBe(true)
		expect(by.takeover.needsWord).toBe(false)
		expect(by.resume.needsWord).toBe(false)
	})

	it('asks for none when the status has none', () => {
		const v = statusView(caseOf('succeeded'))
		expect(v.wordNeeded).toBe(false)
		expect(v.ackWord).toBe('')
		expect(v.buttons[0].needsWord).toBe(false)
	})

	it('enables the button only when the typed text is the word', () => {
		expect(wordOk(ACK_WORD, ACK_WORD)).toBe(true)
		// what is pasted with a space or a line end round it is the word
		expect(wordOk(`  ${ACK_WORD}\n`, ACK_WORD)).toBe(true)
		for (const typed of ['', ' ', 'I-KNOW', ACK_WORD.toLowerCase(), `${ACK_WORD}X`, `X${ACK_WORD}`, `${ACK_WORD} ${ACK_WORD}`, undefined, null, 7, [ACK_WORD]])
			expect(wordOk(typed, ACK_WORD), JSON.stringify(typed)).toBe(false)
	})

	it('never enables it for a status that has no word, or one the core does not make', () => {
		for (const word of ['', undefined, null, 7, 'a b', 'a'.repeat(65), '<b>x</b>', 'x\u0007'])
			expect(wordOk(typeof word === 'string' ? word : 'x', word), JSON.stringify(word)).toBe(false)
		expect(wordOk('', '')).toBe(false)
		// a word that the core does not make is not offered: the button stays shut
		const v = statusView(caseOf('stopped_at_waypoint', { ack_word: '<b>word</b>' }))
		expect(v.wordNeeded).toBe(true)
		expect(v.ackWord).toBe('')
		expect(wordOk('<b>word</b>', v.ackWord)).toBe(false)
	})

	it('sends the word with the closing, and only with it', () => {
		const by = Object.fromEntries(statusView(caseOf('stopped_at_waypoint')).buttons.map(button => [button.action, button]))
		expect(buttonBody(by.acknowledge, ` ${ACK_WORD} `)).toEqual({ action: 'acknowledge', word: ACK_WORD })
		expect(buttonBody(by.takeover, ACK_WORD)).toEqual({ action: 'manual', word: '' })
		expect(buttonBody(by.resume, ACK_WORD)).toEqual({})
		const plain = statusView(caseOf('failed')).buttons
		expect(buttonBody(plain.find(button => button.action === 'acknowledge'), 'anything')).toEqual({ action: 'acknowledge', word: '' })
		expect(buttonBody(plain.find(button => button.action === 'discard'))).toEqual({ action: 'discard', word: '' })
		expect(buttonBody(null)).toEqual({})
		expect(buttonBody(undefined, 'x')).toEqual({})
	})
})

// ---- the summary ---------------------------------------------------------------------------------------------------------

describe('the summary of a run', () => {
	it('says the kind, the path, the block that runs, the progress, and the moments', () => {
		const v = statusView(caseOf('running', { block: hopBlock('full'), since: SINCE, last_activity_at: LATER, attempt: 2 }), 'en_us')
		expect(v.kind).toEqual({ code: 'hop', label: 'Upgrade' })
		expect(v.hop).toBe('debian-11-12')
		expect(v.block).toMatchObject({ index: 7, id: 'full', number: 6, title: 'the full upgrade, and until nothing is left to do', titleKey: 'the full upgrade, and until nothing is left to do' })
		expect(v.progress).toMatchObject({ value: 7, max: 8 })
		expect(v.progress.label).toEqual({ key: TEXT.summary.progress, params: { index: 7, total: 8 } })
		expect(v.step).toEqual({ key: TEXT.summary.step, params: { index: 7, total: 8 } })
		expect(v.since).toMatch(/2026/)
		expect(v.lastActivity).toMatch(/2026/)
		expect(v.attempt).toBe(2)
	})

	it('says the moments in the language of the window', () => {
		const english = statusView(caseOf('rehearsed', { since: SINCE }), 'en_us')
		const french = statusView(caseOf('rehearsed', { since: SINCE }), 'fr_fr')
		expect(english.since).not.toBe(french.since)
		expect(french.expiresAt).toMatch(/2026/)
	})

	it.each([
		['refresh', 'rsources', 2, 4],
		['rehearse', 'snapshot', 3, 5],
		['run', 'minimal', 6, 8],
		['verify', 'after', 1, 1],
	])('counts the blocks of the %s phase: block %s is %i of %i', (phase, id, index, total) => {
		const v = view({ state: 'running', phase, block: block(index, id) })
		expect(v.progress).toMatchObject({ value: index, max: total })
	})

	it('has no progress for a phase whose list it cannot know, a block that is not placed, or a block that is not there', () => {
		expect(view({ state: 'recovering', phase: 'recover', block: block(2, 'minimal') }).progress).toBeNull()
		expect(view({ state: 'recovering', phase: 'recover', block: block(2, 'minimal') }).step).toEqual({ key: TEXT.summary.stepAlone, params: { index: 2 } })
		expect(view({ state: 'running', phase: 'run', block: block(0, 'verify') }).progress).toBeNull()
		expect(view({ state: 'running', phase: 'run', block: block(-3, 'verify') }).progress).toBeNull()
		expect(view({ state: 'running', phase: 'run' }).progress).toBeNull()
		expect(view({ state: 'running', phase: 'from_the_future', block: block(2, 'verify') }).progress).toBeNull()
	})

	it('never goes past the end of the bar', () => {
		expect(view({ state: 'running', phase: 'run', block: block(90, 'verify') }).progress).toMatchObject({ value: 8, max: 8 })
	})

	it('keeps the title of a block the language files do not have as the core\'s words, and a title it has as a key', () => {
		const known = view({ state: 'running', phase: 'run', block: { index: 1, id: 'verify', title: 'check that this is the machine of the plan, and that it is ready' } })
		expect(known.block.titleKey).toBe('check that this is the machine of the plan, and that it is ready')
		const unknown = view({ state: 'running', phase: 'run', block: { index: 1, id: 'verify', title: 'a title of a later core' } })
		expect(unknown.block.titleKey).toBe('')
		expect(unknown.block.title).toBe('a title of a later core')
		for (const title of BLOCK_TITLES)
			expect(view({ state: 'running', block: { index: 1, id: 'verify', title } }).block.titleKey).toBe(title)
	})

	it('numbers the blocks of the hop as the text of the runbook does, and the others not at all', () => {
		expect(view({ state: 'running', block: block(6, 'minimal') }).block.number).toBe(5)
		expect(view({ state: 'running', block: block(1, 'rcheck') }).block.number).toBeNull()
		expect(view({ state: 'running', block: block(1, 'constructor') }).block.number).toBeNull()
	})

	it('has no block when the status has none', () => {
		for (const value of [undefined, null, 7, 'x', [], {}])
			expect(view({ state: 'running', block: value }).block, JSON.stringify(value)).toBeNull()
	})

	it('says the banners that are true, in the order of the page, and none that is not', () => {
		const all = view({ state: 'stopped_at_waypoint', pnr: true, half_upgraded: true, busy: true })
		expect(all.banners.map(banner => banner.id)).toEqual(['pnr', 'half_upgraded', 'busy'])
		expect(all.banners.map(banner => banner.key)).toEqual([TEXT.banners.pnr, TEXT.banners.halfUpgraded, TEXT.banners.busy])
		expect(all.banners[0].key).toBe('The point of no return is behind: there is no way back except your snapshot.')
		expect(all.banners[1].key).toBe('The machine is half upgraded.')
		expect(all.banners[2].key).toBe('Backups and automatic updates are held while this goes on.')
		expect(view({ state: 'running', pnr: false, half_upgraded: false, busy: false }).banners).toEqual([])
		// only a true is a true
		expect(view({ state: 'running', pnr: 'true', half_upgraded: 1, busy: [true] }).banners).toEqual([])
	})

	it('says a quiet unit with its commands as text, and what it does not know as such', () => {
		const commands = ['tail -n 60 /var/lib/casaos/os-upgrade/x/output.log', 'systemctl status casaos-os-upgrade.service', 'systemctl stop casaos-os-upgrade.service']
		const v = view({ state: 'running', hint: { code: 'unit_quiet', quiet_seconds: 1900, commands } })
		expect(v.hint.code).toBe('unit_quiet')
		expect(v.hint.commands).toEqual(commands)
		expect(v.hint.message.params).toEqual({ minutes: '32' })
		expect(sayEnglish(v.hint.message)).toContain('The upgrade has printed nothing for 32 minutes.')
		expect(view({ state: 'running', hint: { code: 'unit_quiet', commands } }).hint.message.key).toBe(('The upgrade has printed nothing for a long time. Look at the end of its log and at the processes before you decide anything. Stopping it is your own act at a console, and never while apt or dpkg is writing: ReCasaOS never stops it for you.'))
		expect(view({ state: 'running', hint: { code: 'unit_quiet', quiet_seconds: 5, commands } }).hint.message.params).toEqual({ minutes: '1' })
		expect(view({ state: 'needs_attention', reason: 'unwind_partial', hint: { code: 'unwind_partial', commands: ['ls -la /x'] } }).hint.message.key).toContain('only partly worked')
		expect(view({ state: 'running', hint: { code: 'from_the_future', commands: [] } }).hint.message.params).toEqual({ code: 'from_the_future' })
		expect(view({ state: 'running', hint: null }).hint).toBeNull()
		expect(view({ state: 'running' }).hint).toBeNull()
	})

	it('offers a time for the page to say when a rehearsal is put back', () => {
		expect(statusView(caseOf('rehearsed')).expiresAt).toMatch(/2026/)
	})
})

describe('what stands before the restart', () => {
	it('lists the checks that are not ok, and holds the restart back', () => {
		const v = statusView(caseOf('awaiting_reboot', { barrier: barrierRed }))
		expect(v.barrier.blocked).toBe(true)
		expect(v.barrier.red.map(check => check.code)).toEqual(['fstab_unresolved'])
		expect(v.barrier.red[0].message.key).toBe(BARRIER_CHECKS.fstab_unresolved)
		expect(v.barrier.red[0].tone).toBe('is-danger')
		expect(TEXT.lists.barrierBlocked).toBe('The restart is not offered until this is mended.')
		// what block 7 warned of is a check that passes, and is said in its words
		expect(v.barrier.warnings).toHaveLength(1)
		expect(v.barrier.warnings[0].message.key).toBe(PREREBOOT_WORDS.initrd_small)
		expect(v.barrier.warnings[0].arg).toBe('')
	})

	it('lets the restart through only when the core says it is ok and no check is red', () => {
		expect(statusView(caseOf('awaiting_reboot', { barrier: barrierOk })).barrier.blocked).toBe(false)
		// an answer that is not "ok" is not one
		for (const ok of [false, undefined, null, 'true', 1, [true]])
			expect(statusView(caseOf('awaiting_reboot', { barrier: { ...barrierOk, ok } })).barrier.blocked, JSON.stringify(ok)).toBe(true)
		// and a check that is not ok holds it back, whatever the whole says
		expect(statusView(caseOf('awaiting_reboot', { barrier: { ok: true, checks: [{ code: 'fstab_network', ok: false }] } })).barrier.blocked).toBe(true)
		expect(statusView(caseOf('awaiting_reboot', { barrier: { ok: true, checks: [{ code: 'fstab_network' }] } })).barrier.blocked).toBe(true)
	})

	it('says each check by its code, and one it does not know as such', () => {
		for (const code of BARRIER_CODES) {
			const v = statusView(caseOf('awaiting_reboot', { barrier: { ok: false, checks: [{ code, ok: false, severity: 'refuse' }] } }))
			expect(v.barrier.red[0].message.key).toBe(BARRIER_CHECKS[code])
		}
		const unknown = statusView(caseOf('awaiting_reboot', { barrier: { ok: false, checks: [{ code: 'a_check_of_a_later_core', ok: false }] } }))
		expect(unknown.barrier.red[0].message.params).toEqual({ code: 'a_check_of_a_later_core' })
		const word = statusView(caseOf('awaiting_reboot', { barrier: { ok: true, checks: [{ code: 'prereboot_warning', ok: true, arg: 'a_word_of_a_later_core' }] } }))
		expect(word.barrier.warnings[0].message.params).toEqual({ code: 'a_word_of_a_later_core' })
	})

	it('has none when the status has none', () => {
		for (const value of [undefined, null, 7, 'x', []])
			expect(statusView(caseOf('awaiting_reboot', { barrier: value })).barrier, JSON.stringify(value)).toBeNull()
	})

	it('keeps what a machine that does not come back needs: the folder, the log, the commands as copyable text, the last block', () => {
		const v = statusView(caseOf('awaiting_reboot'))
		expect(v.afterRebootHint.backupFolder).toBe(BK)
		expect(v.afterRebootHint.log).toContain('output.log')
		expect(v.afterRebootHint.commands).toEqual(hint.commands)
		expect(v.afterRebootHint.block8).toBe('# block 8\necho after')
		expect(statusView(caseOf('idle')).afterRebootHint).toBeNull()
	})
})

describe('what the check found', () => {
	it('says each finding by its code, in the weight the core gives it, errors first, with the arg as text', () => {
		const findings = FINDING_CODES.filter(code => code !== 'container_not_returned').map(code => ({ code, severity: FINDING_SEVERITIES[code], arg: code === 'prereboot_warning' ? 'initrd_small' : `arg-of-${code}` }))
		const v = statusView(caseOf('succeeded_with_findings', { findings: [...findings].reverse() }))
		expect(v.findings).toHaveLength(findings.length)
		const ranks = v.findings.map(item => ['error', 'warn', 'info'].indexOf(item.severity))
		expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
		for (const item of v.findings) {
			expect(item.message.key, item.code).toBe(item.code === 'prereboot_warning' ? PREREBOOT_WORDS.initrd_small : FINDINGS[item.code])
			expect(item.severityLabel).toBe(TEXT.severities[item.severity])
			expect(item.tone).toBe({ error: 'is-danger', warn: 'is-warning', info: 'is-info' }[item.severity])
		}
		expect(v.findings.find(item => item.code === 'kernel_unexpected').arg).toBe('arg-of-kernel_unexpected')
		expect(v.findings.find(item => item.code === 'prereboot_warning').arg).toBe('')
	})

	it('says a finding it does not know as such, and one whose weight it does not know as a warning', () => {
		const v = view({ state: 'succeeded_with_findings', findings: [{ code: 'a_finding_of_a_later_core', severity: 'warn' }, { code: 'dns_missing', severity: 'catastrophic' }, { code: 'route_missing' }, { code: 'prereboot_warning', severity: 'info', arg: 'a_word_of_a_later_core' }] })
		expect(v.findings.find(item => item.code === 'a_finding_of_a_later_core').message.params).toEqual({ code: 'a_finding_of_a_later_core' })
		expect(v.findings.find(item => item.code === 'dns_missing').severity).toBe('warn')
		expect(v.findings.find(item => item.code === 'route_missing').severity).toBe('warn')
		expect(v.findings.find(item => item.code === 'prereboot_warning').message.params).toEqual({ code: 'a_word_of_a_later_core' })
	})

	it('lists the containers that did not come back on their own, and not again among the findings', () => {
		const v = view({
			state: 'succeeded_with_findings',
			findings: [{ code: 'container_not_returned', severity: 'warn', arg: 'web' }, { code: 'ports_missing', severity: 'warn', arg: '80/tcp' }],
			not_returned: [{ container: 'web', policy: 'always' }, { container: 'db', policy: '' }],
		})
		expect(v.findings.map(item => item.code)).toEqual(['ports_missing'])
		expect(v.notReturned.map(item => item.name)).toEqual(['web', 'db'])
		expect(sayEnglish(v.notReturned[0].message)).toBe('The container web does not run (restart policy always).')
		expect(sayEnglish(v.notReturned[1].message)).toBe('The container db does not run.')
		// a core that lists none keeps the finding
		expect(view({ state: 'succeeded_with_findings', findings: [{ code: 'container_not_returned', severity: 'warn', arg: 'web' }] }).findings).toHaveLength(1)
	})

	it('says what could not be judged, each fact in words, and the notes of the backup folder as a note', () => {
		const v = view({ state: 'succeeded_with_findings', not_judged: [...FACTS, 'bk:facts-before.json', 'a_fact_of_a_later_core'] })
		expect(v.notJudged).toHaveLength(FACTS.length + 2)
		for (const fact of FACTS)
			expect(v.notJudged.find(item => item.code === fact).message.key).toBe(NOT_JUDGED[fact])
		const note = v.notJudged.find(item => item.code === 'bk:facts-before.json')
		expect(note.arg).toBe('facts-before.json')
		expect(UPGRADE_KEYS).toContain(note.message.key)
		expect(v.notJudged.find(item => item.code === 'a_fact_of_a_later_core').message.params).toEqual({ code: 'a_fact_of_a_later_core' })
	})

	it('does not say what a finding of incomplete facts lists twice', () => {
		const v = view({ state: 'succeeded_with_findings', findings: [{ code: 'facts_incomplete', severity: 'warn', arg: 'dns,route' }], not_judged: ['dns', 'route'] })
		expect(v.findings[0].arg).toBe('')
		expect(v.notJudged.map(item => item.code)).toEqual(['dns', 'route'])
	})

	it('says the apps at risk of a missing mount as text', () => {
		const v = view({ state: 'succeeded_with_findings', findings: [{ code: 'mounts_missing', severity: 'error', arg: '/DATA', apps: ['plex', '<b>x</b>'] }] })
		expect(v.findings[0].apps).toEqual(['plex', '<b>x</b>'])
	})
})

describe('the states whose run is taken over', () => {
	it('says where the person stands: the blocks done, the next one, the point of no return, the folder', () => {
		const v = statusView(caseOf('manual'))
		expect(v.manual.done).toEqual([{ id: 'verify', number: 0 }, { id: 'timers', number: 1 }])
		expect(v.manual.next).toEqual({ id: 'snapshot', number: 2 })
		expect(v.manual.pnr).toBe(false)
		expect(v.manual.backupFolder).toBe(BK)
		expect(v.runbook).toEqual({ auto: true, available: true })
		expect(statusView(caseOf('manual_done')).runbook.auto).toBe(true)
	})

	it('offers the text of the run to be asked for while a run is open, and never offers it to be shown at once for another state', () => {
		for (const state of STATES.filter(state => state !== 'manual' && state !== 'manual_done'))
			expect(statusView(caseOf(state)).runbook.auto, state).toBe(false)
		expect(statusView(caseOf('idle')).runbook.available).toBe(false)
		expect(statusView(caseOf('failed')).runbook.available).toBe(true)
		// a refresh has no text to run by hand: the core answers no_run, so the page does not offer it
		for (const state of ['refreshing', 'reboot_first', 'refreshed'])
			expect(statusView(caseOf(state)).runbook, state).toEqual({ auto: false, available: false })
		expect(view({ state: 'failed', kind: 'refresh' }).runbook.available).toBe(false)
		expect(view({ state: 'failed', kind: 'rehearsal' }).runbook.available).toBe(true)
		expect(view({ state: 'failed', kind: 'hop' }).runbook.available).toBe(true)
		expect(view({ state: 'a_state_of_a_later_core' }).runbook.available).toBe(false)
	})

	it('says no block when none is next, and has none when the status has none', () => {
		expect(view({ state: 'manual', manual: { blocks_done: [], pnr: true, bk_path: '' } }).manual.next).toBeNull()
		for (const value of [undefined, null, 7, 'x', []])
			expect(view({ state: 'manual', manual: value }).manual, JSON.stringify(value)).toBeNull()
	})
})

describe('what begins something', () => {
	it('offers the switch, the refresh and the start when no run is open and the switch is on', () => {
		expect(view({ state: 'idle', beta_enabled: true }).launch).toEqual({ betaEnabled: true, switch: true, refresh: true, acceptChange: false, start: true })
	})

	it('offers only the switch when it is off', () => {
		expect(view({ state: 'idle', beta_enabled: false }).launch).toEqual({ betaEnabled: false, switch: true, refresh: false, acceptChange: false, start: false })
		for (const value of [undefined, null, 'true', 1, []])
			expect(view({ state: 'idle', beta_enabled: value }).launch.betaEnabled, JSON.stringify(value)).toBe(false)
	})

	it('offers nothing while a run is open, whatever the state, nor while one is on its way', () => {
		for (const state of STATES.filter(state => state !== 'idle')) {
			const launch = statusView(caseOf(state)).launch
			expect(launch.switch, state).toBe(false)
			expect(launch.start, state).toBe(false)
		}
		// a run that was written and has no attempt yet reads as idle with its id
		const coming = view({ state: 'idle', run_id: RUN })
		expect(coming.open).toBe(true)
		expect(coming.launch).toMatchObject({ switch: false, start: false, refresh: false })
	})

	it('offers the refresh again, with the change accepted, only for a refresh that apt stopped for a repository that changed', () => {
		const stopped = (extra = {}) => statusView(caseOf('failed', { kind: 'refresh', pnr: false, failure: { stage: 'rsources', class: 'network', rc: 100, hint: 'releaseinfo_change' }, ...extra }))
		expect(stopped().launch).toMatchObject({ refresh: true, acceptChange: true, start: false })
		// not for another hint, another kind of run, or another state
		expect(stopped({ failure: { stage: 'rsources', class: 'network', rc: 100 } }).launch.acceptChange).toBe(false)
		expect(stopped({ failure: { stage: 'rsources', class: 'network', rc: 100, hint: 'something_else' } }).launch.acceptChange).toBe(false)
		expect(stopped({ kind: 'hop' }).launch.acceptChange).toBe(false)
		expect(stopped({ kind: 'rehearsal' }).launch.acceptChange).toBe(false)
		expect(statusView(caseOf('refreshed', { failure: { hint: 'releaseinfo_change' } })).launch.acceptChange).toBe(false)
		expect(stopped({ beta_enabled: false }).launch.acceptChange).toBe(false)
		expect(stopped({ pnr: true }).launch.acceptChange).toBe(false)
	})
})

// ---- hostile values -----------------------------------------------------------------------------------------------------

describe('what the core sends is text', () => {
	const HTML = '<img src=x onerror=alert(1)><script>alert(2)</script>'
	const CONTROLS = 'a\u0000b\u001B[31mc\u0007d‮e⁦f\u009Bg\r\nh'
	const HUGE = 'x'.repeat(1000000)

	// a status with every text field hostile
	const hostile = text => caseOf('stopped_at_waypoint', {
		reason: text,
		cause: text,
		run_id: text,
		kind: text,
		hop: text,
		plan_id: text,
		phase: text,
		block: { index: 3, id: text, title: text },
		since: text,
		last_activity_at: text,
		expires_at: text,
		failure: { stage: text, class: text, rc: 1, detail_line: text, hint: text },
		hint: { code: text, quiet_seconds: 5, commands: [text, `ls ${text}`] },
		not_judged: [text, `bk:${text}`],
		reboot: { requested_at: text, stalled: false },
		barrier: { ok: false, checks: [{ code: text, ok: false, severity: text, arg: text }, { code: 'prereboot_warning', ok: true, arg: text }] },
		findings: [{ code: text, severity: text, arg: text, apps: [text] }, { code: 'prereboot_warning', severity: 'info', arg: text }],
		not_returned: [{ container: text, policy: text }],
		manual: { blocks_done: [text], next_block: text, pnr: false, bk_path: text },
		ack_word: text,
		after_reboot_hint: { bk_path: text, log: text, commands: [text], block8: text },
		log_tail: [text, text],
	})

	it.each([['HTML', HTML], ['control characters', CONTROLS], ['a huge string', HUGE]])('shows %s in every text field as bounded text with no control character', (_, text) => {
		const v = statusView(hostile(text))
		expect(v).not.toBeNull()
		for (const [path, value] of stringsIn(v)) {
			expect(unsafeIn(value), path).toEqual([])
			expect(value.length, path).toBeLessThanOrEqual(path.includes('block8') ? 64000 : 4000)
		}
	})

	it('keeps HTML as the text it is: it is shown as a text node and never interpreted, so it must come back unchanged and not stripped', () => {
		const v = statusView(hostile(HTML))
		expect(v.failure.detail).toBe(HTML)
		expect(v.logTail).toEqual([HTML, HTML])
		expect(v.findings[0].arg).toBe(HTML)
		expect(v.manual.backupFolder).toBe(HTML)
		expect(v.hop).toBe(HTML.slice(0, 40))
	})

	it('hides the user and the query of an address in the lines of the machine', () => {
		const v = view({ state: 'failed', failure: { class: 'network', detail_line: 'STOP: Err:1 https://user:secret@deb.example.org/debian bullseye InRelease' }, log_tail: ['Get:1 https://user:secret@deb.example.org/debian?token=abc bullseye InRelease'] })
		expect(v.failure.detail).not.toContain('secret')
		expect(v.failure.detail).toContain('https://***@deb.example.org')
		expect(v.logTail[0]).not.toContain('secret')
		expect(v.logTail[0]).not.toContain('abc')
	})

	it('cuts the lines to a length and the log to its last lines', () => {
		const v = view({ state: 'running', log_tail: Array.from({ length: 5000 }, (_, i) => `line ${i}`) })
		expect(v.logTail).toHaveLength(200)
		expect(v.logTail.at(-1)).toBe('line 4999')
		expect(v.logTail[0]).toBe('line 4800')
		expect(view({ state: 'running', log_tail: ['word '.repeat(20000)] }).logTail[0].length).toBeLessThanOrEqual(400)
		// a line that is one word of a hundred thousand characters is not a line to show cut in the middle
		expect(view({ state: 'running', log_tail: ['y'.repeat(100000), 'after'] }).logTail).toEqual(['after'])
	})

	it('drops what is not a line of the log', () => {
		expect(view({ state: 'running', log_tail: ['a', 7, null, {}, ['b'], '', '   ', 'c'] }).logTail).toEqual(['a', 'c'])
		for (const value of [undefined, null, 'x', 7, {}])
			expect(view({ state: 'running', log_tail: value }).logTail, JSON.stringify(value)).toEqual([])
	})

	it('caps the lists', () => {
		const findings = Array.from({ length: 5000 }, (_, i) => ({ code: 'ports_missing', severity: 'warn', arg: String(i) }))
		expect(view({ state: 'succeeded_with_findings', findings }).findings).toHaveLength(100)
		expect(view({ state: 'succeeded_with_findings', not_judged: Array.from({ length: 5000 }, (_, i) => `f${i}`) }).notJudged).toHaveLength(30)
		expect(view({ state: 'awaiting_reboot', barrier: { ok: false, checks: Array.from({ length: 5000 }, () => ({ code: 'fstab_network', ok: false })) } }).barrier.red).toHaveLength(30)
		expect(view({ state: 'manual', manual: { blocks_done: Array.from({ length: 5000 }, (_, i) => `b${i}`), pnr: false, bk_path: BK } }).manual.done).toHaveLength(20)
		const apps = Array.from({ length: 5000 }, (_, i) => `app${i}`)
		expect(view({ state: 'succeeded_with_findings', findings: [{ code: 'mounts_missing', severity: 'error', apps }] }).findings[0].apps).toHaveLength(20)
	})

	// the commands are copied into a console that is root's: kept whole or not at all
	describe('the commands', () => {
		const commandsOf = commands => view({ state: 'running', hint: { code: 'unit_quiet', quiet_seconds: 4000, commands } }).hint.commands

		it('keeps a command whole', () => {
			expect(commandsOf(['ls -la /var/backups', '  tail -n 60 /x  '])).toEqual(['ls -la /var/backups', 'tail -n 60 /x'])
		})

		it('drops a command that was cut, rather than cutting it', () => {
			const long = `echo ${'a'.repeat(500)}`
			expect(commandsOf(['ls', long, 'pwd'])).toEqual(['ls', 'pwd'])
			expect(commandsOf([`rm -rf ${'/x'.repeat(250)}`])).toEqual([])
		})

		it('keeps a command of 400 characters and drops one of 401', () => {
			expect(commandsOf([`${'a'.repeat(400)}`])).toEqual(['a'.repeat(400)])
			expect(commandsOf([`${'a'.repeat(401)}`])).toEqual([])
		})

		it('drops a command that holds a control character, a second command after a line end included', () => {
			expect(commandsOf(['ls\nrm -rf /', 'ls\rwhoami', 'ls\tx', 'ls\u0000', 'ls‮x', 'good'])).toEqual(['good'])
		})

		it('keeps a command once, however many times the core says it', () => {
			expect(commandsOf(['ls', 'pwd', 'ls', '  pwd ', 'ls -la'])).toEqual(['ls', 'pwd', 'ls -la'])
			// twelve different ones, and not twelve of one
			expect(commandsOf(Array.from({ length: 30 }, (_, i) => `echo ${i % 14}`))).toHaveLength(12)
			expect(commandsOf(Array.from({ length: 30 }, () => 'echo 1'))).toEqual(['echo 1'])
		})

		it('drops a command that holds a mark that shows nothing or turns the text round, at the edge of each range', () => {
			const marks = [0xAD, 0x061C, 0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0x2028, 0x2029, 0x2060, 0xFEFF, 0x202A, 0x202E, 0x2066, 0x2069, 0xE0000, 0xE0041, 0xE007F]
			for (const code of marks)
				expect(commandsOf([`ls${String.fromCodePoint(code)}-la`, 'ok']), code.toString(16)).toEqual(['ok'])
			// the characters beside them are commands' own
			for (const code of [0xAC, 0xAE, 0x200A, 0x2010, 0x205F, 0xFEFE, 0xE0080])
				expect(commandsOf([`ls${String.fromCodePoint(code)}x`]), code.toString(16)).toHaveLength(1)
		})

		it('drops what is not a command, and keeps at most twelve', () => {
			expect(commandsOf(['ls', 7, null, {}, ['x'], '', '   '])).toEqual(['ls'])
			expect(commandsOf(Array.from({ length: 100 }, (_, i) => `echo ${i}`))).toHaveLength(12)
			for (const value of [undefined, null, 'ls', 7, {}])
				expect(commandsOf(value), JSON.stringify(value)).toEqual([])
		})

		it('keeps the text of the last block whole, or not at all', () => {
			const block8 = value => statusView(caseOf('awaiting_reboot', { after_reboot_hint: { ...hint, block8: value } })).afterRebootHint.block8
			expect(block8('# block\r\necho "$x"\r\n\tindented\r\n')).toBe('# block\necho "$x"\n\tindented')
			expect(block8('echo a\u001B[31m')).toBe('')
			expect(block8('echo a\u0000b')).toBe('')
			// a mark that shows nothing, or turns the text round, is not in the script that the core wrote
			for (const code of [0xAD, 0x061C, 0x200B, 0x200D, 0x200E, 0x200F, 0x2028, 0x2029, 0x2060, 0xFEFF, 0x202A, 0x202E, 0x2066, 0x2069, 0xE0000, 0xE0041, 0xE007F])
				expect(block8(`echo a${String.fromCodePoint(code)}b`), code.toString(16)).toBe('')
			for (const code of [0xAC, 0xAE, 0x200A, 0x2010, 0x205F, 0xFEFE, 0xE0080])
				expect(block8(`echo a${String.fromCodePoint(code)}b`), code.toString(16)).not.toBe('')
			expect(block8('x'.repeat(64001))).toBe('')
			expect(block8('x'.repeat(64000))).toHaveLength(64000)
			for (const value of [undefined, null, 7, {}, []])
				expect(block8(value), JSON.stringify(value)).toBe('')
		})
	})

	// every field with a value of the wrong type: it never throws, and it never shows a button the list does not hold
	const FIELDS = ['beta_enabled', 'reason', 'cause', 'run_id', 'kind', 'hop', 'plan_id', 'phase', 'attempt', 'block', 'pnr', 'reversible', 'half_upgraded', 'busy', 'since', 'last_activity_at', 'expires_at', 'failure', 'hint', 'not_judged', 'reboot', 'barrier', 'findings', 'not_returned', 'manual', 'actions', 'ack_word', 'after_reboot_hint', 'boot_unknown', 'ignored_markers', 'log_tail']
	const WRONG = [undefined, null, 0, -1, 1e308, 7.5, true, false, '', 'x', '<b>x</b>', [], [null], [[]], [{}], {}, { a: 1 }, { code: 7 }, () => 1, Number.NaN, Infinity, Symbol('x').toString(), 'constructor', '__proto__']

	it.each(FIELDS)('survives %s with a value of the wrong type', (field) => {
		for (const value of WRONG) {
			for (const state of STATES) {
				const v = statusView(caseOf(state, { [field]: value }))
				expect(v, `${field}=${String(value)} in ${state}`).not.toBeNull()
				// the buttons are the list, or none: a list that is not one has no button, and no other field changes the list
				const actions = v.buttons.map(button => button.action)
				if (field === 'actions')
					expect(actions).toEqual([])
				else
					expect(actions).toEqual(CASES[state].actions)
			}
		}
	})

	// every variant of a state, with every part of the status that has a sentence: each sentence is a key of the language files
	it('says only keys of the language files, whatever the variant', () => {
		const rich = {
			findings: FINDING_CODES.map(code => ({ code, severity: FINDING_SEVERITIES[code], arg: code === 'prereboot_warning' ? 'grub_cfg_missing' : 'x' })),
			not_judged: [...FACTS, 'bk:x'],
			not_returned: [{ container: 'web', policy: 'always' }],
			barrier: barrierRed,
			hint: { code: 'unit_quiet', quiet_seconds: 4000, commands: ['ls'] },
			block: hopBlock('minimal'),
			phase: 'run',
			after_reboot_hint: hint,
			manual: { blocks_done: ['verify'], next_block: 'timers', pnr: false, bk_path: BK },
			failure: { stage: 'full', class: 'network', rc: 1, detail_line: 'STOP: x', hint: 'releaseinfo_change' },
			pnr: true,
			half_upgraded: true,
			busy: true,
			ack_word: ACK_WORD,
			actions: ACTION_NAMES,
		}
		const variants = [
			...STATES.map(state => ({ state })),
			...['hop', 'refresh', 'rehearsal'].map(kind => ({ state: 'failed', kind })),
			...FAILED_REASONS.flatMap(reason => [{ state: 'failed', reason, pnr: true }, { state: 'failed', reason, pnr: false }]),
			...ATTENTION_REASONS.map(reason => ({ state: 'needs_attention', reason })),
			...CAUSES.flatMap(cause => [{ state: 'interrupted', cause, pnr: true }, { state: 'interrupted', cause, pnr: false }, { state: 'interrupted', cause, boot_unknown: true }]),
		]
		for (const variant of variants) {
			const v = view({ ...rich, ...variant })
			for (const key of keysIn(v))
				expect(UPGRADE_KEYS, `${JSON.stringify(variant)}: ${key}`).toContain(key)
			for (const key of [v.title, v.what, v.next])
				expect(fr[key], `${JSON.stringify(variant)}: ${key}`).not.toBe(key)
		}
		// each sentence of the tables is said by some variant
		const said = new Set(variants.flatMap(variant => keysIn(view({ ...rich, ...variant }))))
		for (const state of Object.values({ ...STATE_TABLE, ...STATE_VARIANTS }))
			expect(said.has(state.title) || said.has(state.what), state.title).toBe(true)
	})

	it('survives a status with every field missing, and with fields it does not know', () => {
		expect(statusView({ state: 'idle' })).not.toBeNull()
		expect(statusView({ state: 'running' }).buttons).toEqual([])
		const extra = statusView({ ...caseOf('failed'), launch: 'x', buttons: ['abort'], view: 1, __proto__x: 1, constructor: 7, toString: 'x', new_field: { a: 1 } })
		expect(extra.buttons.map(button => button.action)).toEqual(['acknowledge', 'discard'])
	})

	it('reads a status that came as JSON with a key named like an Object method', () => {
		const raw = JSON.parse('{"state":"failed","actions":["acknowledge"],"__proto__":{"actions":["abort"]},"constructor":{"x":1}}')
		expect(statusView(raw).buttons.map(button => button.action)).toEqual(['acknowledge'])
	})

	it('says no number it was not given', () => {
		const v = view({ state: 'failed', attempt: -4, failure: { class: 'network', rc: 'x' } })
		expect(v.attempt).toBe(0)
		expect(v.failure.rc).toBeNull()
		expect(view({ state: 'failed', attempt: 3.5 }).attempt).toBe(0)
	})

	it('says no moment it cannot read', () => {
		for (const value of ['x', '2026-13-45T99:99:99Z', 7, {}, null, '<b>2026-10-17T10:00:00Z</b>'])
			expect(view({ state: 'running', since: value }).since, String(value)).toBe('')
	})

	it('shows the plan id and the run id only when they are the core\'s own form', () => {
		expect(view({ state: 'running', plan_id: ID, run_id: RUN }).planId).toBe(ID)
		expect(view({ state: 'running', plan_id: ID, run_id: RUN }).runId).toBe(RUN)
		expect(view({ state: 'running', plan_id: 'p1-nothex', run_id: '<b>' }).planId).toBe('')
		expect(view({ state: 'running', plan_id: 'p1-nothex', run_id: '<b>' }).runId).toBe('')
	})
})

// ---- starting -----------------------------------------------------------------------------------------------------------

describe('the plan that a start is made from', () => {
	// the plan of the measured box: one removal to accept (fuse), one other removal that nothing asks for, Docker's source put aside
	const plan = (changes = {}) => ({ ...structuredClone(real), ...changes })
	const without = (names) => {
		const copy = structuredClone(real)
		if (names.includes('removals'))
			copy.problems = copy.problems.filter(problem => problem.code !== 'removal_manual')
		if (names.includes('paused'))
			copy.paused = []
		return copy
	}
	const INPUT = { safetyNet: 'snapshot', hostname: 'casaos-box' }

	it('has the removals and the sources the fixture says', () => {
		expect(real.problems.filter(problem => problem.code === 'removal_manual').map(problem => problem.data.name)).toEqual(['fuse'])
		expect(real.paused.map(item => item.file)).toEqual(['docker.list'])
		expect(real.removals.map(removal => removal.name)).toContain('libsemanage1')
	})

	// every combination: a rehearsal or the upgrade, with and without removals to accept, with and without sources put aside
	const COMBINATIONS = []
	for (const rehearsal of [false, true]) {
		for (const removals of [true, false]) {
			for (const paused of [true, false])
				COMBINATIONS.push([rehearsal, removals, paused])
		}
	}

	it.each(COMBINATIONS)('builds the request of a start: rehearsal %s, removals %s, sources put aside %s', (rehearsal, removals, paused) => {
		const p = without([...removals ? [] : ['removals'], ...paused ? [] : ['paused']])
		const acks = ['no_interruption', ...rehearsal ? [] : ['no_way_back'], ...paused ? ['sources_paused'] : [], ...removals ? ['removals_read'] : []]
		const built = startBody(p, { ...INPUT, rehearsal, acks })
		expect(built.ok).toBe(true)
		expect(built.missing).toEqual([])
		expect(built.body).toEqual({
			plan_id: ID,
			rehearsal,
			safety_net: rehearsal ? '' : 'snapshot',
			hostname: 'casaos-box',
			accept_removals: removals ? ['fuse'] : [],
			paused_sources: paused ? ['docker.list'] : [],
			acks,
		})
		// no field besides the ones the core knows, spelled as it spells them
		expect(Object.keys(built.body)).toEqual(['plan_id', 'rehearsal', 'safety_net', 'hostname', 'accept_removals', 'paused_sources', 'acks'])
	})

	it.each(COMBINATIONS)('needs the acknowledgements the core asks: rehearsal %s, removals %s, sources put aside %s', (rehearsal, removals, paused) => {
		const needs = startNeeds(without([...removals ? [] : ['removals'], ...paused ? [] : ['paused']]), rehearsal)
		expect(needs.acks).toEqual(['no_interruption', ...rehearsal ? [] : ['no_way_back'], ...paused ? ['sources_paused'] : [], ...removals ? ['removals_read'] : []])
		expect(needs.safetyNet).toBe(!rehearsal)
		expect(needs.removals).toEqual(removals ? ['fuse'] : [])
		expect(needs.paused).toEqual(paused ? ['docker.list'] : [])
		expect(needs.planId).toBe(ID)
		expect(needs.blocked).toBe(false)
	})

	it('sends the removals and the sources as the plan lists them: sorted, each once, with the line of a source that has one, and nothing cleaned', () => {
		const p = plan({
			problems: [
				{ code: 'removal_manual', severity: 'needs_acceptance', data: { name: 'zsh', version: '1' } },
				{ code: 'removal_manual', severity: 'needs_acceptance', data: { name: 'fuse', version: '2' } },
				{ code: 'removal_manual', severity: 'needs_acceptance', data: { name: 'fuse', version: '2' } },
				{ code: 'removal_manual', severity: 'needs_acceptance', data: { name: 'libc++1:amd64~2.0+b1' } },
				// not a removal to accept, or not a name
				{ code: 'removal_essential', severity: 'blocked', data: { name: 'dash' } },
				{ code: 'removal_manual', severity: 'needs_acceptance', data: { name: 7 } },
				{ code: 'removal_manual', severity: 'needs_acceptance', data: { name: '' } },
				{ code: 'removal_manual', severity: 'needs_acceptance', data: null },
				null,
				7,
			],
			verdict: 'needs_acceptance',
			paused: [
				{ file: 'sources.list', line: 12, hosts: [], docker: false },
				{ file: 'docker.list', hosts: [], docker: true },
				{ file: 'sources.list', line: 3, hosts: [], docker: false },
				{ file: 'docker.list', line: 0, hosts: [], docker: true },
				{ file: 'weird name.list', hosts: [], docker: false },
				{ file: '', line: 4 },
				{ file: 7 },
				null,
			],
		})
		const needs = startNeeds(p, false)
		expect(needs.removals).toEqual(['fuse', 'libc++1:amd64~2.0+b1', 'zsh'])
		expect(needs.paused).toEqual(['docker.list', 'sources.list:12', 'sources.list:3', 'weird name.list'])
	})

	it('never sends what the person ticked in place of the plan\'s lists', () => {
		const built = startBody(plan(), { ...INPUT, acks: START_ACKS, accept_removals: ['evil'], acceptRemovals: ['evil'], paused_sources: ['evil'], pausedSources: ['evil'], plan_id: 'evil', planId: 'evil' })
		expect(built.body.accept_removals).toEqual(['fuse'])
		expect(built.body.paused_sources).toEqual(['docker.list'])
		expect(built.body.plan_id).toBe(ID)
	})

	it('sends only the acknowledgements the plan needs, even when more are ticked', () => {
		const built = startBody(without(['removals', 'paused']), { ...INPUT, rehearsal: true, acks: START_ACKS })
		expect(built.body.acks).toEqual(['no_interruption'])
		// in the core's order, whatever the order they were ticked in
		const hop = startBody(plan(), { ...INPUT, acks: ['removals_read', 'sources_paused', 'no_way_back', 'no_interruption'] })
		expect(hop.body.acks).toEqual(['no_interruption', 'no_way_back', 'sources_paused', 'removals_read'])
	})

	it('takes the acknowledgements as a list or as a set', () => {
		expect(startBody(plan(), { ...INPUT, acks: new Set(START_ACKS) }).ok).toBe(true)
		expect(startBody(plan(), { ...INPUT, acks: undefined }).ok).toBe(false)
		expect(startBody(plan(), { ...INPUT, acks: 'no_interruption' }).missing).toContain('no_interruption')
	})

	it('names what is missing, in the order of the form, and builds nothing', () => {
		expect(startBody(plan(), {})).toEqual({ ok: false, body: null, missing: ['safety_net', 'hostname', 'no_interruption', 'no_way_back', 'sources_paused', 'removals_read'] })
		expect(startBody(plan(), { ...INPUT, acks: ['no_interruption', 'no_way_back'] }).missing).toEqual(['sources_paused', 'removals_read'])
		expect(startBody(plan(), { hostname: 'box', acks: START_ACKS }).missing).toEqual(['safety_net'])
		expect(startBody(plan(), { safetyNet: 'snapshot', acks: START_ACKS }).missing).toEqual(['hostname'])
		// a rehearsal asks for neither the safety net nor the acknowledgement of no way back
		expect(startBody(plan(), { rehearsal: true, hostname: 'box', acks: ['no_interruption', 'sources_paused', 'removals_read'] }).ok).toBe(true)
	})

	it.each(['', ' ', '   ', 'a b', 'a_b', '-box', 'box-', '.box', 'box.', 'bo\nx', 'bo\u0000x', '<b>x</b>', 'x'.repeat(254), 'café', 7, null, undefined, {}, ['box']])('does not take %j for the name of a machine', (hostname) => {
		expect(hostnameOk(hostname)).toBe(false)
		expect(startBody(plan(), { ...INPUT, hostname, acks: START_ACKS }).missing).toEqual(['hostname'])
	})

	it.each(['box', 'a', 'casaos-box', 'box.local', 'Box1', 'x'.repeat(253), '1box'])('takes %s for the name of a machine', (hostname) => {
		expect(hostnameOk(hostname)).toBe(true)
	})

	it('sends the name as typed, without the space round it', () => {
		expect(startBody(plan(), { ...INPUT, hostname: '  casaos-box \n', acks: START_ACKS }).body.hostname).toBe('casaos-box')
	})

	it.each(['', 'snapshots', 'SNAPSHOT', 'none', 'constructor', undefined, null, 7, ['snapshot']])('does not take %j for a safety net, for the upgrade', (safetyNet) => {
		expect(startBody(plan(), { ...INPUT, safetyNet, acks: START_ACKS }).missing).toEqual(['safety_net'])
	})

	it.each(CORE_SAFETY_NETS)('takes %s for a safety net', (safetyNet) => {
		expect(startBody(plan(), { ...INPUT, safetyNet, acks: START_ACKS }).body.safety_net).toBe(safetyNet)
	})

	it('sends no safety net for a rehearsal, whatever was chosen', () => {
		expect(startBody(plan(), { ...INPUT, safetyNet: 'snapshot', rehearsal: true, acks: START_ACKS }).body.safety_net).toBe('')
		expect(startBody(plan(), { hostname: 'box', safetyNet: 'nonsense', rehearsal: true, acks: START_ACKS }).ok).toBe(true)
	})

	it('builds nothing for a plan that blocks, whatever the person says', () => {
		const blocked = plan({ verdict: 'blocked', problems: [...real.problems, { code: 'removal_protected', severity: 'blocked', data: { name: 'sudo' } }] })
		expect(startNeeds(blocked, false).blocked).toBe(true)
		expect(startBody(blocked, { ...INPUT, acks: START_ACKS })).toEqual({ ok: false, body: null, missing: ['plan'] })
		// a plan whose own verdict says it is fine and whose removals are protected is a plan that blocks
		const lying = plan({ verdict: 'ok', removals: [{ name: 'sudo', protected: true }] })
		expect(startBody(lying, { ...INPUT, acks: START_ACKS }).missing).toEqual(['plan'])
		// and a verdict that is not one
		expect(startBody(plan({ verdict: 'fine' }), { ...INPUT, acks: START_ACKS }).missing).toEqual(['plan'])
	})

	it('blocks a plan that has only an id: its verdict is not one', () => {
		expect(startNeeds({ plan_id: ID }, false).blocked).toBe(true)
		expect(startBody({ plan_id: ID }, { ...INPUT, acks: START_ACKS })).toEqual({ ok: false, body: null, missing: ['plan'] })
	})

	it.each([null, undefined, 7, 'plan', [], {}, { ...real, plan_id: 'p1-nothex' }, { ...real, plan_id: undefined }])('builds nothing for something that is not a plan: %j', (given) => {
		expect(startNeeds(given, false)).toBeNull()
		expect(startBody(given, { ...INPUT, acks: START_ACKS })).toEqual({ ok: false, body: null, missing: ['plan'] })
	})

	it('survives an input that is not an object', () => {
		for (const input of [undefined, null, 7, 'x', []])
			expect(startBody(plan(), input).ok).toBe(false)
	})

	it('is what the core compares: the same names, in the same words', () => {
		// service/system_os_upgrade_start.go osUpgradeManualRemovals and osUpgradePausedNames
		const needs = startNeeds(plan(), false)
		const core = {
			removals: [...new Set(real.problems.filter(problem => problem.code === 'removal_manual').map(problem => problem.data.name))].sort(),
			paused: [...new Set(real.paused.map(item => item.line > 0 ? `${item.file}:${item.line}` : item.file))].sort(),
		}
		expect(needs.removals).toEqual(core.removals)
		expect(needs.paused).toEqual(core.paused)
	})
})

// ---- a call that failed ---------------------------------------------------------------------------------------------

describe('why a call failed', () => {
	// a refusal of the core, as the route writes it (osUpgradeFailed): the code in data.error_code, the English reason in data.error
	const refusedWith = (code, data, status = Object.prototype.hasOwnProperty.call(STATUS_OF, code) ? STATUS_OF[code] : 409) => ({ response: { status, data: { success: status, message: 'x', data: { error_code: code, error: 'The core\'s own English words, which are not ours', data } } } })
	const said = (code, data) => sayEnglish(failureOf(refusedWith(code, data)).message)

	it.each(ALL_REFUSALS)('has a sentence for %s', (code) => {
		const failure = failureOf(refusedWith(code, {}))
		expect(failure.kind).toBe('refusal')
		expect(failure.code).toBe(code)
		expect(failure.status).toBe(STATUS_OF[code] ?? 409)
		expect(failure.message.key).not.toBe(REFUSAL_UNKNOWN)
		expect(UPGRADE_KEYS).toContain(failure.message.key)
		expect(fr[failure.message.key]).not.toBe(failure.message.key)
		// the sentence is the one of no data: it is whole without
		expect(failure.message.key).not.toMatch(/\{\w+\}/)
	})

	it('has a sentence for every code, in French too', () => {
		for (const code of ALL_REFUSALS) {
			const message = failureOf(refusedWith(code, {}), 'fr_fr').message
			expect(fr[message.key], code).toBeTruthy()
		}
	})

	it('says a code it does not know as one, with the code as text, and never the core\'s own words', () => {
		const failure = failureOf(refusedWith('a_refusal_of_a_later_core', { why: 'because' }))
		expect(failure.kind).toBe('refusal')
		expect(failure.message).toEqual({ key: 'The core refused: {code}', params: { code: 'a_refusal_of_a_later_core' } })
		expect(sayEnglish(failure.message)).toBe('The core refused: a_refusal_of_a_later_core')
		expect(JSON.stringify(failure)).not.toContain('own English words')
	})

	it('shows a hostile code as bounded text', () => {
		const failure = failureOf(refusedWith(`<img src=x onerror=alert(1)>\u0007${'y'.repeat(500)}`, {}))
		expect(failure.message.params.code.length).toBeLessThanOrEqual(60)
		expect(unsafeIn(failure.message.params.code)).toEqual([])
		expect(failure.message.key).toBe(REFUSAL_UNKNOWN)
		for (const code of ['constructor', '__proto__', 'toString', 'hasOwnProperty'])
			expect(failureOf(refusedWith(code, {})).message.key, code).toBe(REFUSAL_UNKNOWN)
	})

	it('takes the code of a refusal only from the statuses the core answers it with', () => {
		for (const status of [200, 201, 202, 204, 301, 401, 403, 404, 408, 413, 429, 502, 503, 504])
			expect(failureOf(refusedWith('beta_off', {}, status)).kind, String(status)).not.toBe('refusal')
		for (const status of [400, 409, 500])
			expect(failureOf(refusedWith('beta_off', {}, status)).kind, String(status)).toBe('refusal')
	})

	it('says the room that is short, in the language of the window', () => {
		expect(said('no_room', { path: '/var/backups', need: 2 * 1024 ** 3, free: 3 * 1024 ** 2 })).toBe('There is not enough room in /var/backups for the upgrade: 2 GiB needed, 3 MiB free. Make room, then try again.')
		expect(sayEnglish(failureOf(refusedWith('no_room', { path: '/var/backups', need: 2 * 1024 ** 3, unknown: true })).message)).toBe('The room that is free in /var/backups could not be read (2 GiB needed). Make room, then try again.')
		expect(said('no_room', {})).toBe('There is not enough room for the upgrade. Make room, then try again.')
		expect(sayEnglish(failureOf(refusedWith('no_room', { path: '/var/backups', need: 2 * 1024 ** 3, free: 3 * 1024 ** 2 }), 'fr_fr').message)).toContain('2')
	})

	it('picks the sentence of a refusal by the reason the core gives', () => {
		expect(said('no_plan', { reason: 'expired' })).toBe('The plan has expired. Make a new one.')
		expect(said('no_plan', { reason: 'running' })).toBe('The plan is being made: wait for it to end.')
		expect(said('no_plan', { reason: 'from_the_future' })).toBe('There is no plan to start from. Make the plan first.')
		expect(said('no_plan', undefined)).toBe('There is no plan to start from. Make the plan first.')
		expect(said('not_abortable', { reason: 'point_of_no_return' })).toBe('The upgrade is past its point of no return: it can no longer be called off.')
		expect(said('not_abortable', { reason: 'past_block' })).toContain('too late')
		expect(said('not_abortable', { reason: 'not_running' })).toContain('not running')
		expect(said('not_abortable', {})).toBe('The upgrade cannot be stopped now.')
		expect(said('busy', { reason: 'unit' })).toBe('The upgrade may be running, or systemd does not answer.')
		expect(said('busy', { reason: 'unknown' })).toContain('could not be seen')
		expect(said('busy', { reason: 'dpkg' })).toContain('Another package manager is at work')
		expect(said('identity_unsupported', { unknown: true })).toContain('could not be asked just now')
		expect(said('identity_unsupported', {})).toContain('not one that ReCasaOS knows how to upgrade')
		expect(said('apps_busy', { unknown: true, apps: [] })).toContain('did not say')
		expect(said('apps_busy', { apps: ['plex', 'jellyfin'] })).toBe('An app has an operation in progress (plex, jellyfin). Wait for it to end, then try again.')
		expect(said('apps_busy', { apps: [] })).toBe('An app has an operation in progress. Wait for it to end, then try again.')
		expect(said('manual_run_found', { folder: 'casaos-os-upgrade-p1-x' })).toContain('(casaos-os-upgrade-p1-x)')
		expect(said('manual_run_found', { folder: '', unknown: true })).toContain('could not be read')
		expect(said('source_unrecognized', { file: 'sources.list', line: 4, reason: 'type', code: 'sources_format' })).toContain('(sources.list, line 4)')
		expect(said('source_unrecognized', { file: 'sources.list' })).toContain('(sources.list)')
		expect(said('source_unrecognized', {})).not.toContain('(')
		expect(said('bad_request', { field: 'hostname' })).toBe('ReCasaOS did not accept a field of the request (hostname).')
		expect(said('bad_request', {})).toBe('ReCasaOS did not accept the request.')
		expect(said('readiness_refuses', { state: 'unsupported', checks: [] })).toContain('not one that ReCasaOS can upgrade')
		expect(said('readiness_refuses', { state: 'latest', checks: [] })).toContain('latest release')
		expect(said('readiness_refuses', { state: 'blocked', checks: [{ code: 'disk_root' }] })).toContain('not ready')
	})

	it('lists the things a refusal names: the checks of the report, those before the restart, the boxes of the form', () => {
		const checks = failureOf(refusedWith('readiness_refuses', { state: 'blocked', checks: [{ code: 'disk_root', action: 'free_space' }, { code: 'a_check_of_a_later_core', action: '' }, { code: 7 }, null] })).items
		expect(checks.map(item => item.code)).toEqual(['disk_root', 'a_check_of_a_later_core'])
		expect(checks[0].message.key).toBe(READINESS_CHECKS.disk_root.label)
		expect(checks[1].message).toBeNull()
		const barrier = failureOf(refusedWith('barrier_failed', { checks: [{ code: 'fstab_unresolved', ok: false }, { code: 'fstab_network', ok: true }, { code: 'prereboot_warning', ok: true, arg: 'initrd_small' }] })).items
		expect(barrier.map(item => item.code)).toEqual(['fstab_unresolved'])
		expect(barrier[0].message.key).toBe(BARRIER_CHECKS.fstab_unresolved)
		const acks = failureOf(refusedWith('acks_missing', { missing: ['no_way_back', 'removals_read', 'nonsense'] })).items
		expect(acks.map(item => item.code)).toEqual(['no_way_back', 'removals_read', 'nonsense'])
		expect(acks[0].message.key).toBe(ACK_TEXTS.no_way_back)
		expect(acks[2].message).toBeNull()
		// a code that names nothing has no items
		expect(failureOf(refusedWith('beta_off', {})).items).toEqual([])
		expect(failureOf(refusedWith('readiness_refuses', {})).items).toEqual([])
	})

	it('caps the things a refusal names', () => {
		const checks = Array.from({ length: 5000 }, (_, i) => ({ code: `c${i}` }))
		expect(failureOf(refusedWith('readiness_refuses', { checks })).items).toHaveLength(30)
	})

	it('says a call that did not get a refusal by what it said', () => {
		const call = (error) => {
			const failure = failureOf(error)
			return [failure.kind, failure.message.key]
		}
		expect(call({ response: { status: 401, data: {} } })).toEqual(['signin', CALL_ERRORS.signin])
		expect(call({ response: { status: 404, data: {} } })).toEqual(['unavailable', CALL_ERRORS.unavailable])
		expect(call({ code: 'ECONNABORTED' })).toEqual(['timeout', CALL_ERRORS.timeout])
		expect(call({ code: 'ETIMEDOUT' })).toEqual(['timeout', CALL_ERRORS.timeout])
		// no answer at all: the request may have reached the core and been carried out, so it is told as the one that took too long
		expect(call({ message: 'Network Error' })).toEqual(['timeout', CALL_ERRORS.timeout])
		expect(call({ code: 'ERR_NETWORK' })).toEqual(['timeout', CALL_ERRORS.timeout])
		expect(call({ message: 'x', request: {} })).toEqual(['timeout', CALL_ERRORS.timeout])
		expect(call({ response: { status: 502 } })).toEqual(['failed', CALL_ERRORS.failed])
		expect(call({ response: { status: 400, data: { success: 400 } } })).toEqual(['failed', CALL_ERRORS.failed])
		expect(call({ response: { status: 409, data: { success: 409, data: 'x' } } })).toEqual(['failed', CALL_ERRORS.failed])
		for (const error of [undefined, null, 7, 'x', {}, [], new Error('x')])
			expect(failureOf(error).kind, String(error)).toBe('failed')
	})

	it('keeps "try again" for a read that got no answer, which nothing was changed by', () => {
		expect(failureOf({ message: 'Network Error' }, 'en_us', { read: true }).kind).toBe('failed')
		expect(failureOf({ code: 'ERR_NETWORK' }, 'en_us', { read: true }).kind).toBe('failed')
		// and the refusals and the other failures are the same for a read
		expect(failureOf({ response: { status: 401 } }, 'en_us', { read: true }).kind).toBe('signin')
		expect(failureOf(refusedWith('no_run', {}), 'en_us', { read: true }).kind).toBe('refusal')
		expect(failureOf({ code: 'ECONNABORTED' }, 'en_us', { read: true }).kind).toBe('timeout')
	})

	it('has French for the sentences of a call that did not go through', () => {
		for (const key of Object.values(CALL_ERRORS))
			expect(fr[key]).not.toBe(key)
	})

	it('knows the two refusals that the restart and the shutdown of the top bar can meet', () => {
		expect(powerRefusal(refusedWith('os_upgrade_open', { state: 'running' }))).toEqual({ key: REFUSALS.os_upgrade_open[0], params: {} })
		expect(powerRefusal(refusedWith('barrier_failed', { checks: [] })).key).toBe(REFUSALS.barrier_failed[0])
		for (const code of ALL_REFUSALS.filter(code => code !== 'os_upgrade_open' && code !== 'barrier_failed'))
			expect(powerRefusal(refusedWith(code, {})), code).toBeNull()
		expect(powerRefusal(refusedWith('os_upgrade_open', {}, 500))).toBeNull()
		expect(powerRefusal({ response: { status: 500, data: { message: 'x' } } })).toBeNull()
		expect(powerRefusal(undefined)).toBeNull()
	})
})

// ---- polling, and a core that does not answer ------------------------------------------------------------------------------

describe('when to ask for the status', () => {
	it('asks at once when nothing was asked yet', () => {
		expect(nextPoll('none')).toBe(0)
		expect(nextPoll('none', { runOpen: true })).toBe(0)
	})

	it('asks every 5 seconds while a run is open, and every 15 when none is', () => {
		expect(nextPoll('ok', { runOpen: true })).toBe(5000)
		expect(nextPoll('ok', { runOpen: false })).toBe(15000)
		expect(nextPoll('ok')).toBe(15000)
		expect(POLL_MS).toEqual({ open: 5000, idle: 15000, error: 10000 })
	})

	it('asks 10 seconds after an error, a run open or not', () => {
		expect(nextPoll('error', { runOpen: true })).toBe(10000)
		expect(nextPoll('error', { runOpen: false })).toBe(10000)
	})

	it('does not ask while the document is hidden, whatever the rest says', () => {
		for (const last of ['none', 'ok', 'error']) {
			for (const runOpen of [true, false])
				expect(nextPoll(last, { hidden: true, runOpen }), `${last} ${runOpen}`).toBeNull()
		}
	})

	it('takes what it does not know for an error, and an argument that is missing for the defaults', () => {
		for (const last of [undefined, null, '', 'OK', 'fine', 7, {}])
			expect(nextPoll(last, { runOpen: true }), String(last)).toBe(10000)
		expect(nextPoll('ok', undefined)).toBe(15000)
		expect(nextPoll('ok', null)).toBe(15000)
		expect(nextPoll('ok', {})).toBe(15000)
	})

	it('follows a whole life: an answer, an error, an answer, a hidden document, the document shown again', () => {
		const open = view({ state: 'running' }).open
		const idle = view({ state: 'idle' }).open
		expect([nextPoll('none'), nextPoll('ok', { runOpen: open }), nextPoll('error', { runOpen: open }), nextPoll('ok', { runOpen: idle }), nextPoll('ok', { hidden: true, runOpen: idle }), nextPoll('none')]).toEqual([0, 5000, 10000, 15000, null, 0])
	})
})

describe('why the status could not be read', () => {
	it.each([
		[{ response: { status: 401 } }, 'signin'],
		[{ response: { status: 404 } }, 'unavailable'],
		[{ code: 'ECONNABORTED', message: 'timeout of 10000ms exceeded' }, 'down'],
		[{ code: 'ETIMEDOUT' }, 'down'],
		[{ message: 'Network Error' }, 'down'],
		[{ response: { status: 500 } }, 'down'],
		[{ response: { status: 502 } }, 'down'],
		[{ response: { status: 503 } }, 'down'],
		[{ response: { status: 504 } }, 'down'],
		[{ response: { status: 400 } }, 'failed'],
		[{ response: { status: 403 } }, 'failed'],
		[{ response: { status: 409 } }, 'failed'],
		[undefined, 'down'],
		[null, 'down'],
		[new Error('x'), 'down'],
	])('reads %j as %s', (error, kind) => {
		expect(statusFailure(error)).toBe(kind)
	})

	describe('when the browser itself is offline', () => {
		const online = (value) => {
			Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
		}
		afterEach(() => {
			delete navigator.onLine
		})

		it('does not call the person\'s own network loss a core that is away', () => {
			online(false)
			expect(statusFailure({ message: 'Network Error' })).toBe('failed')
			expect(statusFailure({ code: 'ECONNABORTED' })).toBe('failed')
			expect(statusFailure(undefined)).toBe('failed')
			// an answer is an answer, whatever the browser thinks of its network
			expect(statusFailure({ response: { status: 502 } })).toBe('down')
			expect(statusFailure({ response: { status: 401 } })).toBe('signin')
		})

		it('calls it a core that is away when the browser is online', () => {
			online(true)
			expect(statusFailure({ message: 'Network Error' })).toBe('down')
		})
	})
})

describe('a core that does not answer', () => {
	const MIN = 60 * 1000
	const rebooting = statusView(caseOf('rebooting'))
	const rebootingNoHint = statusView(caseOf('rebooting', { after_reboot_hint: undefined }))
	const idle = statusView(caseOf('idle'))

	it('says the machine is restarting, with the time, for fifteen minutes', () => {
		for (const elapsedMs of [1000, 5 * MIN, 14 * MIN, RESTART_LOOK_AFTER_MS - 1]) {
			const out = outageView({ kind: 'down', elapsedMs, last: rebooting })
			expect(out.level, String(elapsedMs)).toBe('restarting')
			expect(sayEnglish(out.message)).toBe('The machine is restarting. This page goes on by itself.')
			expect(sayEnglish(out.elapsed)).toBe(`No answer for ${formatElapsed(elapsedMs)}.`)
			expect(out.hint).toBeNull()
		}
	})

	it('says to look at the screen of the machine after fifteen minutes, with what the status carried for that case', () => {
		for (const elapsedMs of [RESTART_LOOK_AFTER_MS, RESTART_LOOK_AFTER_MS + 1, 3 * 60 * MIN]) {
			const out = outageView({ kind: 'down', elapsedMs, last: rebooting })
			expect(out.level, String(elapsedMs)).toBe('look')
			expect(sayEnglish(out.message)).toBe(`The machine has not answered for ${formatElapsed(elapsedMs)}. Look at its screen or console: it may have stopped, or it may be waiting for you.`)
			expect(out.hint.backupFolder).toBe(BK)
			expect(out.hint.commands).toEqual(hint.commands)
			expect(out.hint.block8).toBe('# block 8\necho after')
		}
		expect(RESTART_LOOK_AFTER_MS).toBe(15 * MIN)
	})

	it('says to look all the same when the status carried nothing', () => {
		const out = outageView({ kind: 'down', elapsedMs: 20 * MIN, last: rebootingNoHint })
		expect(out.level).toBe('look')
		expect(out.hint).toBeNull()
	})

	it('does not say the machine restarts when no run is open', () => {
		for (const elapsedMs of [0, 20 * MIN]) {
			const out = outageView({ kind: 'down', elapsedMs, last: idle })
			expect(out.level).toBe('unreadable')
			expect(sayEnglish(out.message)).toBe('The state of the upgrade could not be read just now. This page tries again by itself.')
		}
	})

	it('does not say the machine restarts when nothing was read before: a page cannot tell that a run is open', () => {
		for (const last of [null, undefined]) {
			const out = outageView({ kind: 'down', elapsedMs: 5 * MIN, last })
			expect(out.level).toBe('unreadable')
			expect(sayEnglish(out.message)).toBe('The state of the upgrade could not be read just now. This page tries again by itself.')
		}
	})

	it('says to look at the machine after fifteen minutes to a page that read nothing: it was opened while the core was away', () => {
		for (const last of [null, undefined]) {
			const out = outageView({ kind: 'down', elapsedMs: RESTART_LOOK_AFTER_MS, last })
			expect(out.level).toBe('look')
			expect(sayEnglish(out.message)).toMatch(/^The machine has not answered for 15 min 00 s\. Look at its screen or console/)
			expect(out.hint).toBeNull()
		}
	})

	it('runs the same clock for any failure while a run is open, and says "restarting" only of a core that is away', () => {
		for (const kind of ['failed', 'something_else', undefined]) {
			const early = outageView({ kind, elapsedMs: 14 * MIN, last: rebooting })
			expect(early.level, String(kind)).toBe('unreadable')
			expect(early.elapsed).toBeNull()
			const late = outageView({ kind, elapsedMs: RESTART_LOOK_AFTER_MS, last: rebooting })
			expect(late.level, String(kind)).toBe('look')
			expect(late.hint.backupFolder).toBe(BK)
			// no run open: nothing to look at
			expect(outageView({ kind, elapsedMs: 3 * 60 * MIN, last: idle }).level).toBe('unreadable')
		}
	})

	it('says nothing of the time before there is any', () => {
		expect(outageView({ kind: 'down', elapsedMs: 0, last: rebooting })).toMatchObject({ level: 'restarting', elapsed: null })
		expect(outageView({ kind: 'down', elapsedMs: 999, last: rebooting }).elapsed).toBeNull()
		expect(sayEnglish(outageView({ kind: 'down', elapsedMs: 1000, last: rebooting }).elapsed)).toBe('No answer for 1 s.')
	})

	it('does not take a session that ended for a restart', () => {
		for (const last of [rebooting, idle, null]) {
			const out = outageView({ kind: 'signin', elapsedMs: 30 * MIN, last })
			expect(out.level).toBe('signin')
			expect(sayEnglish(out.message)).toBe('Your session has ended. Sign in again to see the upgrade.')
			expect(out.hint).toBeNull()
		}
	})

	it('says nothing for a core that does not have the feature', () => {
		expect(outageView({ kind: 'unavailable', elapsedMs: 0, last: null })).toEqual({ level: 'unavailable', message: null, elapsed: null, hint: null })
	})

	it('survives no argument', () => {
		expect(outageView({}).level).toBe('unreadable')
		expect(outageView({ kind: 'down' }).level).toBe('unreadable')
	})

	describe('the beginning of an outage', () => {
		const T = 1_000_000_000

		it('begins at the first failed ask, and stays where it began while the asks go on in step', () => {
			expect(outageStart(0, 0, T)).toBe(T)
			expect(outageStart(0, T - 10_000, T)).toBe(T)
			expect(outageStart(T - 40_000, T - 10_000, T)).toBe(T - 40_000)
			expect(outageStart(T - 40_000, T - PAUSE_GAP_MS, T)).toBe(T - 40_000)
		})

		it('begins again when the page was not asking for longer than the asks are apart: a tab that slept, a lid that was closed', () => {
			expect(outageStart(T - 20 * 60_000, T - 20 * 60_000, T)).toBe(T)
			expect(outageStart(T - 20 * 60_000, T - PAUSE_GAP_MS - 1, T)).toBe(T)
			// the gap is far larger than the longest wait between two asks
			expect(PAUSE_GAP_MS).toBeGreaterThan(2 * POLL_MS.idle)
		})

		it('is not fooled by a clock that went back, or by what is not a time', () => {
			expect(outageStart(T + 5000, T + 5000, T)).toBe(T + 5000)
			for (const value of [undefined, null, 'x', Number.NaN, -3])
				expect(outageStart(value, value, T)).toBe(T)
		})
	})

	it.each([
		[0, '0 s'],
		[999, '0 s'],
		[1000, '1 s'],
		[59999, '59 s'],
		[60000, '1 min 00 s'],
		[125000, '2 min 05 s'],
		[3599000, '59 min 59 s'],
		[3600000, '1 h 00 min'],
		[3600000 + 5 * 60000 + 59000, '1 h 05 min'],
		[26 * 3600000, '26 h 00 min'],
		[-5, '0 s'],
		[Number.NaN, '0 s'],
		[Number.POSITIVE_INFINITY, '0 s'],
		[undefined, '0 s'],
		['x', '0 s'],
	])('writes %j as %s', (ms, text) => {
		expect(formatElapsed(ms)).toBe(text)
	})
})

describe('the live region', () => {
	const at = (state, extra) => statusView(caseOf(state, extra))

	it('says nothing before the first view, nor when nothing changed', () => {
		expect(announcement(null, at('running'))).toBeNull()
		expect(announcement(undefined, at('running'))).toBeNull()
		expect(announcement(at('running'), at('running'))).toBeNull()
		// a poll that finds the same state with the block moved on, the log longer and the time later says nothing
		expect(announcement(at('running', { block: block(2, 'timers'), log_tail: ['a'] }), at('running', { block: block(3, 'snapshot'), log_tail: ['a', 'b'], last_activity_at: LATER }))).toBeNull()
		expect(announcement(at('running'), null)).toBeNull()
	})

	it('says the title of the state once, when the state changed', () => {
		const out = announcement(at('running'), at('awaiting_reboot'))
		expect(out).toEqual({ key: STATE_TABLE.awaiting_reboot.title, params: {} })
		expect(announcement(at('awaiting_reboot'), at('rebooting')).key).toBe(STATE_TABLE.rebooting.title)
		expect(announcement(at('succeeded'), at('idle')).key).toBe(STATE_TABLE.idle.title)
	})

	it('says it again when the same state stops for another reason, and when a restart stalls', () => {
		const a = at('failed', { failure: { stage: 'download', class: 'network', rc: 100 } })
		const b = at('failed', { failure: { stage: 'download', class: 'disk', rc: 100 } })
		expect(announcement(a, b)).not.toBeNull()
		expect(announcement(a, a)).toBeNull()
		expect(announcement(at('awaiting_reboot'), at('failed', { kind: 'hop', reason: 'verify', pnr: true }))).not.toBeNull()
		expect(changeKey(at('reboot_stalled'))).not.toBe(changeKey(at('reboot_stalled', { reboot: { stalled: false } })))
	})

	it('says it for a state it does not know, once', () => {
		const a = view({ state: 'a_state_of_a_later_core' })
		const b = view({ state: 'another_state_of_a_later_core' })
		expect(announcement(a, a)).toBeNull()
		expect(announcement(a, b).key).toBe('This page does not know this state')
	})

	it('has no key for nothing', () => {
		expect(changeKey(null)).toBe('')
		expect(changeKey(undefined)).toBe('')
	})
})
