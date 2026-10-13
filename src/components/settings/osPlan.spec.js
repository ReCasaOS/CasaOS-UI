import { describe, expect, it } from 'vitest'
import {
	PLAN_ACTIONS,
	PLAN_CALL_ERRORS,
	PLAN_CONF_REASONS,
	PLAN_CONF_REASON_UNKNOWN,
	PLAN_DISK_NOTES,
	PLAN_DISK_NOTE_UNKNOWN,
	PLAN_ERRORS,
	PLAN_ERROR_NONE,
	PLAN_ERROR_UNKNOWN,
	PLAN_KEYS,
	PLAN_PHASES,
	PLAN_PROBLEMS,
	PLAN_PROBLEM_UNKNOWN,
	PLAN_RUNBOOK_OTHER,
	PLAN_RUNBOOK_REFUSALS,
	PLAN_RUNBOOK_UNREADABLE,
	PLAN_SAID_APT,
	PLAN_SAID_CORE,
	PLAN_SEVERITIES,
	PLAN_SOURCE_REASONS,
	PLAN_UPDATE_KINDS,
	PLAN_VERDICTS,
	PLAN_WHY,
	RUNBOOK_OTHER_FAILURE,
	RUNBOOK_UNREADABLE_FAILURE,
	callFailure,
	errorView,
	phaseOf,
	planText,
	planView,
	readStatus,
	refusalOf,
	runbookFailure,
	runbookFileName,
	runbookView,
	sayEnglish,
	scrub,
	startRefusal,
} from './osPlan'
import real from './__fixtures__/os-plan-d11-12.json'
import core from './__fixtures__/os-plan-core-answers.json'
import runbookAnswer from './__fixtures__/os-plan-runbook-d11-12.json'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'

// The codes of the core (pkg/osplan: plan.go ProblemCodes, failure.go ErrorCodes, seam.go Phases), pinned here: a code added to the
// core without a sentence here, or dropped from it, is noticed.
const PROBLEM_CODES = ['removal_protected', 'removal_essential', 'removal_manual', 'dist_kept_back', 'disk_short', 'downgrade', 'docker_held']
const ERROR_CODES = ['not_root', 'hop_not_planned', 'identity_unsupported', 'busy', 'no_room', 'sources_format', 'sources_alias', 'sources_target', 'sources_mixed_file', 'sources_cdrom', 'sandbox_update_failed', 'sandbox_solver_failed', 'plan_unparsed', 'timeout', 'canceled', 'internal']
const PHASES = ['sources', 'update', 'upgrade', 'dist-upgrade', 'estimate', 'parse']
const UPDATE_KINDS = ['no_pubkey', 'not_found', 'network', 'release_change', 'other']
// why a file of apt's configuration is left out of the plan (pkg/osplan/aptconf.go)
const CONF_REASONS = ['not_simple', 'has_directive', 'not_allowed_setting', 'too_large', 'not_regular', 'proxy_auto_detect']
// why a plan has no rows of disk (pkg/osplan/plan.go DiskNote)
const DISK_NOTES = ['estimates_unknown']
// the verdicts and the weights of a plan (plan.go), and the states of the job (service/system_os_plan.go)
const VERDICTS = ['ok', 'needs_acceptance', 'blocked']
const SEVERITIES = ['blocked', 'needs_acceptance', 'info']
const STATES = ['idle', 'running', 'done', 'failed']
// what the plan did to a file of the sources, and the words it says of a line (rewrite.go)
const FILE_ACTIONS = ['rewritten', 'paused', 'unchanged']
const LINE_WHY = ['suite', 'host', 'firmware', 'dropped', 'paused']
// why a plan was not understood (parse.go, run.go): the first has a sentence of its own, the others are said by the code
const UNPARSED_REASONS = ['not_fully_installed', 'line_too_long', 'control_character', 'truncated', 'too_many_names', 'bad_name', 'duplicate_section', 'duplicate_summary', 'bad_summary', 'no_summary', 'essential_block', 'essential_not_removed', 'bad_remv_line', 'bad_inst_line', 'unknown_line', 'inst_mismatch', 'removal_mismatch', 'summary_mismatch', 'removal_unknown']
// why there is no runbook (service/system_os_plan.go): for a code of no_plan, and for a code of no_runbook
const NO_PLAN_REASONS = ['idle', 'running', 'failed', 'expired', 'blocked']
const NO_RUNBOOK_REASONS = ['runbook_unsafe', 'runbook_too_large']

// the plan of the measured box, as the core's own test writes it (the plan endpoint's: no tree)
const plan = (changes = {}) => ({ ...structuredClone(real), ...changes })
const problem = (code, data = {}, severity = 'needs_acceptance') => ({ code, severity, data })
const english = (code, data) => sayEnglish(planView(plan({ verdict: 'blocked', problems: [problem(code, data)] }), 'en_us').problems[0].sentence)
// the control characters (but for the end of a line) and the marks that set the direction of a text that a text has
function unsafeIn(text) {
	return [...text].filter((char) => {
		const code = char.codePointAt(0)
		return (code < 32 && char !== '\n') || (code >= 127 && code <= 159) || (code >= 0x202A && code <= 0x202E) || (code >= 0x2066 && code <= 0x2069)
	})
}

describe('the tables, and the core\'s codes', () => {
	it('says every phase of the job, in its order', () => {
		expect(PLAN_PHASES.map(phase => phase.id)).toEqual(PHASES)
		expect(phaseOf('dist-upgrade')).toEqual({ step: 4, total: 6, key: 'Planning the full upgrade' })
		expect(phaseOf('from-the-future')).toBe(null)
		expect(phaseOf(undefined)).toBe(null)
	})

	it('says every problem and every error the core has, and no other', () => {
		expect(Object.keys(PLAN_PROBLEMS).sort()).toEqual([...PROBLEM_CODES].sort())
		expect(Object.keys(PLAN_ERRORS).sort()).toEqual([...ERROR_CODES].sort())
		expect(Object.keys(PLAN_UPDATE_KINDS).sort()).toEqual([...UPDATE_KINDS].sort())
		expect(Object.keys(PLAN_CONF_REASONS).sort()).toEqual([...CONF_REASONS].sort())
		expect(Object.keys(PLAN_DISK_NOTES).sort()).toEqual([...DISK_NOTES].sort())
	})

	it('says every verdict, weight, action, word and reason of the core, and no other', () => {
		const keys = table => Object.keys(table).sort()
		expect(keys(PLAN_VERDICTS)).toEqual([...VERDICTS].sort())
		expect(keys(PLAN_SEVERITIES)).toEqual([...SEVERITIES].sort())
		expect(keys(PLAN_ACTIONS)).toEqual([...FILE_ACTIONS].sort())
		expect(keys(PLAN_WHY)).toEqual([...LINE_WHY].sort())
		expect(keys(PLAN_RUNBOOK_REFUSALS)).toEqual(['no_plan', 'no_runbook'])
		expect(keys(PLAN_RUNBOOK_REFUSALS.no_plan.variants)).toEqual([...NO_PLAN_REASONS].sort())
		expect(keys(PLAN_RUNBOOK_REFUSALS.no_runbook.variants)).toEqual([...NO_RUNBOOK_REASONS].sort())
		// a plan that was not understood has one sentence of its own, for the half-configured package: the other reasons are said by the code
		expect(keys(PLAN_ERRORS.plan_unparsed.variants)).toEqual(['not_fully_installed'])
	})

	// the last sentence of each code has no placeholder: a core that sent no data still gets its sentence
	const lists = (entry) => {
		const table = Array.isArray(entry) ? { text: entry } : entry
		return [table.text, ...Object.values(table.variants ?? {})]
	}
	it.each([...Object.entries(PLAN_PROBLEMS), ...Object.entries(PLAN_ERRORS), ...Object.entries(PLAN_RUNBOOK_REFUSALS)])('ends %s on a sentence with no placeholder', (_, entry) => {
		for (const list of lists(entry))
			expect(list.at(-1)).not.toMatch(/\{\w+\}/)
	})

	it('has no key twice, and is a good many', () => {
		expect(new Set(PLAN_KEYS).size).toBe(PLAN_KEYS.length)
		expect(PLAN_KEYS.length).toBeGreaterThan(60)
		for (const key of [PLAN_PROBLEMS.removal_manual[0], PLAN_ERRORS.sandbox_update_failed.variants.network[0], PLAN_SOURCE_REASONS.trusted, PLAN_RUNBOOK_REFUSALS.no_plan.variants.expired[0], PLAN_CALL_ERRORS.unavailable])
			expect(PLAN_KEYS).toContain(key)
	})
})

describe('the language files', () => {
	it.each(PLAN_KEYS)('say "%s" in English and in French', (key) => {
		expect(en[key]).toBe(key)
		expect(fr[key]).toBeTruthy()
		expect(fr[key]).not.toBe(key)
		// in the order of the English: {needed} and {free} are not interchangeable
		expect(fr[key].match(/\{\w+\}/g) || []).toEqual(key.match(/\{\w+\}/g) || [])
		// French sets a space before : ? ! ; and a percent sign, and the English text has none to copy
		expect(fr[key]).not.toMatch(/\S[:?!;]/)
		expect(fr[key]).not.toMatch(/[^\s%]%/)
	})
})

describe('the held packages of Docker, in French', () => {
	// the readiness section of the same window says "retenus" (Held packages, Docker packages on hold): so does the plan
	it.each(PLAN_PROBLEMS.docker_held)('says "%s" as held, not as blocked', (key) => {
		expect(fr[key]).toContain('retenus')
		expect(fr[key]).not.toMatch(/bloqu/)
	})
})

describe('the problems of a plan', () => {
	it.each([
		['removal_protected', { name: 'sudo', pattern: 'sudo' }, 'The upgrade would remove sudo, which ReCasaOS protects (it matches sudo). This blocks the upgrade.'],
		['removal_protected', { name: 'sudo' }, 'The upgrade would remove sudo, which ReCasaOS protects. This blocks the upgrade.'],
		['removal_protected', {}, 'The upgrade would remove a package that ReCasaOS protects. This blocks the upgrade.'],
		['removal_essential', { name: 'dash' }, 'The upgrade would remove dash, a package the system cannot work without. This blocks the upgrade.'],
		['removal_manual', { name: 'fuse', version: '2.9.9-5' }, 'The upgrade would remove fuse (2.9.9-5), a package installed by hand, as far as ReCasaOS can tell. You would have to accept this.'],
		['removal_manual', { name: 'fuse', version: '' }, 'The upgrade would remove fuse, a package installed by hand, as far as ReCasaOS can tell. You would have to accept this.'],
		// a package that apt does not keep back by its own count (a package on hold, a silent leftover) would still stay as it is: the
		// sentence says what is true of every kind, and in one clause that apt does not always count them
		['dist_kept_back', { names: ['libc6', 'tzdata'] }, 'After the full upgrade, these packages would still stay at the version they have now: libc6, tzdata. apt does not always count such packages as kept back. The upgrade would not be complete with them, so it is blocked.'],
		// apt counts some packages as not upgraded without naming them (a package on hold whose candidate is a downgrade)
		['dist_kept_back', { names: ['libc6', 'tzdata'], unlisted: 2 }, 'After the full upgrade, these packages would still stay at the version they have now: libc6, tzdata, and 2 more that apt counts without naming. apt does not always count such packages as kept back. The upgrade would not be complete with them, so it is blocked.'],
		['dist_kept_back', { names: [], unlisted: 1 }, 'After the full upgrade, some packages would still stay at the version they have now, and apt counts them without naming them (how many: 1). A package on hold for which the next release has only an older version than the installed one is counted this way. The upgrade would not be complete with them, so it is blocked.'],
		['dist_kept_back', { unlisted: 3 }, 'After the full upgrade, some packages would still stay at the version they have now, and apt counts them without naming them (how many: 3). A package on hold for which the next release has only an older version than the installed one is counted this way. The upgrade would not be complete with them, so it is blocked.'],
		// a count that is none, or is not a count, is not said
		['dist_kept_back', { names: ['libc6'], unlisted: 0 }, 'After the full upgrade, these packages would still stay at the version they have now: libc6. apt does not always count such packages as kept back. The upgrade would not be complete with them, so it is blocked.'],
		['dist_kept_back', { names: ['libc6'], unlisted: '2' }, 'After the full upgrade, these packages would still stay at the version they have now: libc6. apt does not always count such packages as kept back. The upgrade would not be complete with them, so it is blocked.'],
		['dist_kept_back', { names: [], unlisted: -1 }, 'After the full upgrade, some packages would still stay at the version they have now. The upgrade would not be complete with them, so it is blocked.'],
		['dist_kept_back', {}, 'After the full upgrade, some packages would still stay at the version they have now. The upgrade would not be complete with them, so it is blocked.'],
		['downgrade', { names: ['docker-ce', 'containerd.io'] }, 'The upgrade would downgrade these packages, that is install older versions than the ones on this machine: docker-ce, containerd.io. The upgrade does not do that by itself. This blocks the upgrade.'],
		['downgrade', { names: [] }, 'The upgrade would downgrade packages, that is install older versions than the ones on this machine. The upgrade does not do that by itself. This blocks the upgrade.'],
		['downgrade', {}, 'The upgrade would downgrade packages, that is install older versions than the ones on this machine. The upgrade does not do that by itself. This blocks the upgrade.'],
		['disk_short', { path: '/usr', need: 1523741824, free: 1073741824 }, 'There is not enough room on /usr: 1.5 GiB needed, 1 GiB free. This blocks the upgrade.'],
		// a room that could not be read is not a room of 0 bytes
		['disk_short', { path: '/usr', need: 1523741824, unknown: true }, 'The room that is free on /usr could not be read (1.5 GiB needed). This blocks the upgrade.'],
		['disk_short', { path: '/usr', need: 1523741824, free: 0, unknown: true }, 'The room that is free on /usr could not be read (1.5 GiB needed). This blocks the upgrade.'],
		['disk_short', {}, 'There is not enough room for the upgrade. This blocks the upgrade.'],
		['docker_held', { names: ['docker-ce', 'containerd.io'] }, 'Docker\'s packages are on hold (docker-ce, containerd.io). That is expected: the upgrade leaves them alone, and Docker\'s package source is put aside while it runs.'],
	])('says %s from its data', (code, data, sentence) => {
		expect(english(code, data)).toBe(sentence)
	})

	it('says the room that is lacking as more than the room that is free, never the same', () => {
		// 2047 MiB free and 2048 MiB + 1 byte needed would both read "2 GiB" if the sizes were cut the same way
		expect(english('disk_short', { path: '/', need: 2048 * 1048576 + 1, free: 2047 * 1048576 })).toContain('2.1 GiB needed, 1.9 GiB free')
		expect(english('disk_short', { path: '/', need: 1023 * 1048576 + 1, free: 1000 * 1048576 })).toContain('1 GiB needed, 1,000 MiB free')
	})

	it('weighs them blocked first, then what must be accepted, then what is for information', () => {
		const view = planView(plan({ problems: [problem('docker_held', {}, 'info'), problem('removal_manual', { name: 'a' }), problem('disk_short', {}, 'blocked'), problem('removal_manual', { name: 'b' })] }))
		expect(view.problems.map(item => [item.code, item.severity, item.badge, item.tone])).toEqual([
			['disk_short', 'blocked', 'Blocks the upgrade', 'is-danger'],
			['removal_manual', 'needs_acceptance', 'Needs your acceptance', 'is-warning'],
			['removal_manual', 'needs_acceptance', 'Needs your acceptance', 'is-warning'],
			['docker_held', 'info', 'For information', 'is-info'],
		])
	})

	it('says a problem it does not know by its code, with the core\'s data as text, and never as a pass', () => {
		const view = planView(plan({ problems: [{ code: 'from_the_future', severity: 'critical', data: { 'names': ['x', 'y'], 'count': 3, 'nested': { a: 1 }, 'Bad Name': 1 } }, { code: 7, severity: {}, data: 'x' }] }))
		expect(view.problems.map(item => sayEnglish(item.sentence))).toEqual(['Something this window does not know about the plan: from_the_future.', 'Something this window does not know about the plan: ?.'])
		expect(view.problems[0].details).toEqual([{ name: 'names', value: 'x, y' }, { name: 'count', value: '3' }])
		// a weight it does not know has to be accepted, so the plan is not "nothing in the way"
		expect(view.problems.map(item => item.severity)).toEqual(['needs_acceptance', 'needs_acceptance'])
		expect(view.verdict).toBe('needs_acceptance')
	})
})

describe('the verdict, which fails closed', () => {
	it.each([
		['ok', [], 'ok', 'is-success'],
		['needs_acceptance', [problem('removal_manual', { name: 'a' })], 'needs_acceptance', 'is-warning'],
		['blocked', [problem('disk_short', {}, 'blocked')], 'blocked', 'is-danger'],
		// never better than what the plan found
		['ok', [problem('disk_short', {}, 'blocked')], 'blocked', 'is-danger'],
		['needs_acceptance', [problem('disk_short', {}, 'blocked')], 'blocked', 'is-danger'],
		['ok', [problem('removal_manual', { name: 'a' })], 'needs_acceptance', 'is-warning'],
		['ok', [problem('docker_held', {}, 'info')], 'ok', 'is-success'],
		// a verdict it does not know is a blocked one
		['from-the-future', [], 'blocked', 'is-danger'],
		[undefined, [], 'blocked', 'is-danger'],
		['OK', [], 'blocked', 'is-danger'],
		['toString', [], 'blocked', 'is-danger'],
	])('says %s with %j as %s', (raw, problems, verdict, tone) => {
		const view = planView(plan({ verdict: raw, problems, removals: [] }))
		expect(view.verdict).toBe(verdict)
		expect(view.tone).toBe(tone)
	})

	// what the window shows in red is not "nothing in the way", whatever the problems say
	it.each([
		['a protected package that is removed', { removals: [{ name: 'sudo', version: '1', manual: true, protected: true, essential: false }] }],
		['an essential package that is removed', { removals: [{ name: 'dash', version: '1', manual: false, protected: false, essential: true }] }],
		['a room that is short', { disk: [{ path: '/usr', need: 2, free: 1, ok: false }] }],
		['a room that was not read', { disk: [{ path: '/usr', need: 2, free: 0, ok: true, unknown: true }] }],
		['a package that is still kept back', { kept_back: ['libc6'] }],
		// apt counts it and does not name it: the table of counts says 1 kept back after the full upgrade, and the names say none
		['a package that is kept back and that apt does not name', { kept_back: [], counts: { ...real.counts, dist_upgrade: { ...real.counts.dist_upgrade, kept_back: 1 } } }],
	])('is blocked by %s even when no problem says it', (_, change) => {
		const view = planView(plan({ verdict: 'ok', problems: [], ...change }))
		expect(view.verdict).toBe('blocked')
		expect(view.tone).toBe('is-danger')
	})

	// a downgrade says "This blocks the upgrade": whatever weight the core gave it, the verdict is blocked
	it.each(['info', 'needs_acceptance', 'blocked', 'from-the-future'])('is blocked by a downgrade that the core weighs as %s', (severity) => {
		const view = planView(plan({ verdict: 'ok', problems: [problem('downgrade', { names: ['docker-ce'] }, severity)], removals: [] }))
		expect(view.verdict).toBe('blocked')
		expect(view.tone).toBe('is-danger')
	})

	it('is not blocked by what only the first, minimal upgrade keeps back, nor by a count that is not one', () => {
		// the measured box keeps 111 back in the first upgrade and none in the full one
		expect(real.counts.upgrade.kept_back).toBe(111)
		expect(planView(plan({ verdict: 'ok', problems: [], removals: [] })).verdict).toBe('ok')
		for (const keptBack of [null, 'x', -1, 1.5])
			expect(planView(plan({ verdict: 'ok', problems: [], removals: [], counts: { ...real.counts, dist_upgrade: { ...real.counts.dist_upgrade, kept_back: keptBack } } })).verdict).toBe('ok')
	})

	it('needs to be accepted when a package installed by hand is removed, even when no problem says it, and is none the worse for what is not in red', () => {
		const view = planView(plan({ verdict: 'ok', problems: [], removals: [{ name: 'fuse', version: '1', manual: true, protected: false, essential: false }] }))
		expect(view.verdict).toBe('needs_acceptance')
		expect(view.tone).toBe('is-warning')
		expect(planView(plan({ verdict: 'ok', problems: [], removals: [{ name: 'fuse', version: '1', manual: false, protected: false, essential: false }], new_packages: ['a'] })).verdict).toBe('ok')
	})

	it('says the sentence of its verdict', () => {
		expect(planView(plan()).summary.key).toBe('The plan found things you would have to accept first.')
		expect(planView(plan({ verdict: 'ok', problems: [], removals: [] })).summary.key).toBe('The plan found nothing in the way.')
		expect(planView(plan({ verdict: 'blocked' })).summary.key).toBe('The plan found something that blocks the upgrade.')
	})
})

describe('the plan of the measured box', () => {
	const view = planView(real, 'en_us')

	it('says what it is, when it was made and when it expires', () => {
		expect(view.id).toBe('p1-5787acb2f81006785a3076312615ae6c')
		expect(view.shortId).toBe('p1-5787acb2')
		expect(view.hop).toBe('debian-11-12')
		expect(view.madeAt).toMatch(/Oct 1[12], 2026/)
		expect(view.expiresAt).toMatch(/Oct 1[23], 2026/)
		expect(view.verdict).toBe('needs_acceptance')
		expect(view.confLeftOut).toEqual([{ file: '15update-stamp', reasonKey: PLAN_CONF_REASONS.not_simple }])
		expect(view.expiresMs).toBe(Date.parse('2026-10-13T09:30:00Z'))
	})

	it('says the one thing to accept, with its data', () => {
		expect(view.problems).toHaveLength(1)
		expect(sayEnglish(view.problems[0].sentence)).toBe('The upgrade would remove fuse (2.9.9-5), a package installed by hand, as far as ReCasaOS can tell. You would have to accept this.')
	})

	it('says each file of the sources, line by line, and Docker\'s file as put aside', () => {
		expect(view.sources.files.map(file => [file.file, file.action, file.lines.length])).toEqual([['sources.list', 'rewritten', 6], ['docker.list', 'paused', 1]])
		expect(view.sources.files[0].lines[2]).toEqual({
			n: 3,
			before: 'deb http://archive.debian.org/debian-security bullseye-security main',
			after: 'deb http://deb.debian.org/debian-security bookworm-security main',
			why: ['release name', 'address'],
		})
		expect(view.sources.files[1].lines[0].why).toEqual(['put aside'])
		expect(view.sources.dockerFiles).toBe('docker.list')
		expect(view.sources.otherPaused).toBe('')
		expect(view.sources.dropped).toBe(0)
		expect(view.sources.firmware).toBe(0)
	})

	it('counts the full upgrade and the first one', () => {
		expect(view.counts.full).toEqual({ upgraded: 384, new: 75, removed: 2, keptBack: 0 })
		expect(view.counts.first).toEqual({ upgraded: 274, new: 0, removed: 0, keptBack: 111 })
	})

	it('lists the removals with what is said of each', () => {
		expect(view.removals).toEqual([
			{ name: 'fuse', version: '2.9.9-5', manual: true, protected: false, essential: false },
			{ name: 'libsemanage1', version: '3.1-1+b2', manual: false, protected: false, essential: false },
		])
		expect(view.added.count).toBe(75)
		expect(view.added.names.split(', ')[0]).toBe('cron-daemon-common')
		expect(view.keptBack.count).toBe(0)
		expect(view.unneeded.count).toBe(18)
	})

	it('says the download, the extra space and the room, in the units of the language', () => {
		expect(view.estimates).toEqual({ known: true, download: '133 MiB', extra: '286 MiB', freed: false })
		expect(view.disk).toEqual([
			{ path: '/var/cache/apt/archives', need: '659 MiB', free: '8 GiB', unknown: false, ok: true },
			{ path: '/usr', need: '1.5 GiB', free: '8 GiB', unknown: false, ok: true },
			{ path: '/', need: '512 MiB', free: '20 GiB', unknown: false, ok: true },
		])
		const french = planView(real, 'fr_fr')
		expect(french.estimates.download).toBe('133 Mio')
		expect(french.disk[1].need).toBe('1,5 Gio')
		expect(french.madeAt).toMatch(/1[12] oct/)
	})
})

describe('the sizes and the room', () => {
	it('says a size that is not known as none, and what is freed as what it frees', () => {
		const unknown = planView(plan({ estimates: { known: false }, disk: [] }))
		expect(unknown.estimates).toEqual({ known: false, download: '', extra: '', freed: false })
		expect(unknown.disk).toEqual([])
		// known with no bytes is not known
		expect(planView(plan({ estimates: { known: true } })).estimates.known).toBe(false)
		expect(planView(plan({ estimates: { known: true, download_bytes: 1048576, extra_bytes: -52428800 } })).estimates).toEqual({ known: true, download: '1 MiB', extra: '50 MiB', freed: true })
	})

	// the problem of a short room names a folder whose room the plan could not read: it does not say how much is free, whatever its data says
	it('does not say how much room is free on a folder whose room was not read, even when the problem\'s own data does not say so', () => {
		const view = planView(plan({
			verdict: 'blocked',
			problems: [problem('disk_short', { path: '/usr', need: 1523741824, free: 0 }, 'blocked'), problem('disk_short', { path: '/', need: 536870912, free: 1048576 }, 'blocked')],
			disk: [{ path: '/usr', need: 1523741824, free: 0, ok: false, unknown: true }, { path: '/', need: 536870912, free: 1048576, ok: false }],
		}))
		expect(view.problems.map(item => sayEnglish(item.sentence))).toEqual([
			'The room that is free on /usr could not be read (1.5 GiB needed). This blocks the upgrade.',
			'There is not enough room on /: 512 MiB needed, 1 MiB free. This blocks the upgrade.',
		])
	})

	it('counts a row as short unless the core said it is not, and a room that was not read as short', () => {
		const rows = planView(plan({ disk: [{ path: '/a', need: 1048576, free: 5242880, ok: true }, { path: '/b', need: 1048576, free: 0, ok: false }, { path: '/c', need: 1048576, free: 0, ok: true, unknown: true }, { path: '/d', need: 1048576, free: 5242880 }] })).disk
		expect(rows.map(row => [row.path, row.ok, row.unknown, row.free])).toEqual([['/a', true, false, '5 MiB'], ['/b', false, false, '0 MiB'], ['/c', false, true, ''], ['/d', false, false, '5 MiB']])
	})
})

// What the core says, as its own code says it: core.* is dumped from pkg/osplan, and from the service and the route that wrap it, by a
// throwaway Go test run on a copy of the core. The plans are core.downgrade, unlisted, silent, protected, essential, docker_held, lowroom, nothing,
// nothing_tight, nothing_one_unneeded, conf_reasons and conf_many; core.status_* are the answers of GET /v1/sys/os/upgrade/plan in each
// state and for each way a job ends; core.refusal_* are the 409 that refuses a request before a job starts. What apt said is the real text
// that the core keeps in testdata/real where it has one (chroot-d11-downgrade-*, -downgrade-held-*, -silent-*, -half-configured-*, -nothing-*,
// -autoremove-one-nothing-*, -update-proxy-refused, -update-unreachable), and the text of the core's own tests for a failed update that it has
// no capture of (a key that is missing, a suite that is not there, a release that changed, a disk that is full). The boxes are the core's own
// test boxes: a room of / that cannot be read, an estimate that apt ends for lack of room, a file of apt's configuration for each of the six
// reasons, more of them than the list holds, a package that dpkg says is essential, one that the plan protects, Docker's packages on hold, a
// question about the machine that went wrong, a sandbox folder that could not be removed. The plan of the real box, os-plan-d11-12.json, and
// the runbook that was written for it, os-plan-runbook-d11-12.json, come from the same run.
describe('what the core says of a downgrade, of packages it does not name, and of the sizes it did not read', () => {
	const said = view => view.problems.map(item => sayEnglish(item.sentence))

	it('blocks a plan that downgrades a package, names it, and says a room that was not read as not read', () => {
		const view = planView(core.downgrade)

		expect(view.verdict).toBe('blocked')
		expect(view.problems.map(item => [item.code, item.severity])).toEqual([['downgrade', 'blocked'], ['disk_short', 'blocked']])
		expect(said(view)).toEqual([
			'The upgrade would downgrade these packages, that is install older versions than the ones on this machine: docker-ce. The upgrade does not do that by itself. This blocks the upgrade.',
			'The room that is free on / could not be read (512 MiB needed). This blocks the upgrade.',
		])
		expect(view.disk.map(row => [row.path, row.unknown, row.free, row.ok])).toEqual([['/var/cache/apt/archives', false, '8 GiB', true], ['/usr', false, '8 GiB', true], ['/', true, '', false]])
		expect(view.diskNote).toBe('')
	})

	it('blocks a plan for a downgrade alone, whatever verdict and weight the core said', () => {
		const alone = { ...core.downgrade, verdict: 'ok', disk: [], problems: [{ ...core.downgrade.problems[0], severity: 'info' }] }

		expect(planView(alone).verdict).toBe('blocked')
		expect(planView({ ...alone, problems: [] }).verdict).toBe('ok')
	})

	it('says the packages that apt keeps back and does not name, and blocks on them', () => {
		const view = planView(core.unlisted)

		expect(view.verdict).toBe('blocked')
		expect(said(view)).toEqual(['After the full upgrade, some packages would still stay at the version they have now, and apt counts them without naming them (how many: 1). A package on hold for which the next release has only an older version than the installed one is counted this way. The upgrade would not be complete with them, so it is blocked.'])
		expect(view.keptBack).toEqual({ names: '', count: 0, truncated: false })
		expect(view.counts.full.keptBack).toBe(1)
		// the table of counts says it, so the verdict does too when the problem is not there
		expect(planView({ ...core.unlisted, verdict: 'ok', problems: [] }).verdict).toBe('blocked')
		expect(planView({ ...core.unlisted, verdict: 'ok', problems: [], counts: { ...core.unlisted.counts, dist_upgrade: { ...core.unlisted.counts.dist_upgrade, kept_back: 0 } } }).verdict).toBe('ok')
	})

	it('says that the disk is not checked when the core says its sizes were not read, with no row of disk', () => {
		const view = planView(core.unlisted)

		expect(core.unlisted.disk_note).toBe('estimates_unknown')
		expect(view.diskNote).toBe(PLAN_DISK_NOTES.estimates_unknown)
		expect(view.estimates.known).toBe(false)
		expect(view.disk).toEqual([])
		const text = planText(core.unlisted)
		expect(text).toContain('Disk\napt did not say how much it would download, so the disk space is not checked.\n')
		expect(text).not.toContain('\ndownload: ')
		expect(text).toContain('full upgrade: upgraded 0, new 0, removed 0, kept back 1')
		expect(text).toContain('apt counts them without naming them (how many: 1)')
	})

	it('says the note by the core\'s word, and one it does not know as one it does not know', () => {
		expect(planView(plan()).diskNote).toBe('')
		expect(planView(plan({ disk_note: '' })).diskNote).toBe('')
		expect(planView(plan({ disk_note: 'estimates_unknown' })).diskNote).toBe(PLAN_DISK_NOTES.estimates_unknown)
		// a core that said no note, and whose sizes the window cannot read, is said as the core says it
		expect(planView(plan({ estimates: { known: false }, disk: [] })).diskNote).toBe(PLAN_DISK_NOTES.estimates_unknown)
		expect(planView(plan({ estimates: { known: true } })).diskNote).toBe(PLAN_DISK_NOTES.estimates_unknown)
		for (const note of ['from-the-future', 'toString', '__proto__', 5, {}, ['estimates_unknown'], true])
			expect(planView(plan({ disk_note: note })).diskNote, JSON.stringify(note)).toBe(PLAN_DISK_NOTE_UNKNOWN)
		// the sizes the core did give are still said
		expect(planView(plan({ disk_note: 'estimates_unknown' })).estimates.known).toBe(true)
		expect(planText(plan({ disk_note: 'from-the-future' }))).toContain('download: 133 MiB\nextra space: 286 MiB\nThe disk space was not checked, for a reason this window does not know.\n')
	})

	it('says a machine that could not be asked who it is as not asked, and not as a refusal', () => {
		const sentence = data => sayEnglish(errorView({ code: 'identity_unsupported', data }).sentence)
		const asked = 'The machine could not be asked just now whether a plan can be made for it, so no plan was made. Try again in a moment.'

		expect(sentence({ state: 'blocked', unknown: true })).toBe(asked)
		for (const data of [{ state: 'latest', checks: ['latest'] }, { unknown: false }, {}])
			expect(sentence(data)).toBe('This machine is not one that a plan can be made for: it is not a release that ReCasaOS knows how to upgrade, or it has no later one.')
	})
})

describe('what the core says of a low room, of packages that apt does not count, and of the files of its configuration', () => {
	const said = view => view.problems.map(item => sayEnglish(item.sentence))

	// apt ends the estimate with "You don't have enough free space" after it has said the two sizes: the sizes are true, and the room that was read is short
	it('blocks a plan whose estimate apt ended for lack of room, with the sizes and the room that were read', () => {
		const view = planView(core.lowroom)

		expect(view.verdict).toBe('blocked')
		expect(view.estimates).toMatchObject({ known: true, download: '133 MiB', extra: '286 MiB' })
		expect(view.diskNote).toBe('')
		expect(view.disk.map(row => [row.path, row.unknown, row.free, row.ok])).toEqual([['/var/cache/apt/archives', false, '658 MiB', true], ['/usr', false, '1 GiB', false], ['/', false, '20 GiB', true]])
		expect(view.problems.map(item => [item.code, item.severity])).toEqual([['disk_short', 'blocked'], ['removal_manual', 'needs_acceptance']])
		expect(said(view)[0]).toBe('There is not enough room on /usr: 1.5 GiB needed, 1 GiB free. This blocks the upgrade.')
		expect(planText(core.lowroom)).toContain('/usr: needs 1.5 GiB, free 1 GiB SHORT')
	})

	// the minimal upgrade keeps a package back, the full one lists it nowhere and counts it nowhere: only the problem names it
	it('names the package that the full upgrade leaves behind and counts nowhere, with no kept back package behind it, and blocks', () => {
		const view = planView(core.silent)

		expect(view.verdict).toBe('blocked')
		expect(said(view)).toEqual(['After the full upgrade, these packages would still stay at the version they have now: osp-k. apt does not always count such packages as kept back. The upgrade would not be complete with them, so it is blocked.'])
		expect(view.keptBack).toEqual({ names: '', count: 0, truncated: false })
		expect(view.counts.full.keptBack).toBe(0)
		expect(view.counts.first.keptBack).toBe(1)
		// the sentence is not the one of a package that apt says it keeps back
		expect(planText(core.silent)).toContain('osp-k')
		expect(planText(core.silent)).not.toContain('still keeps')
	})

	it('says a file of apt\'s configuration for each of the six reasons, and names none of what was kept or passed over', () => {
		const view = planView(core.conf_reasons)

		expect(new Set(core.conf_reasons.apt_conf_left_out.map(item => item.reason))).toEqual(new Set(CONF_REASONS))
		expect(view.confLeftOut.map(item => [item.file, item.reasonKey])).toEqual([
			['01autoremove', PLAN_CONF_REASONS.not_simple],
			['15update-stamp', PLAN_CONF_REASONS.not_simple],
			['20auto-upgrades', PLAN_CONF_REASONS.not_allowed_setting],
			['80link', PLAN_CONF_REASONS.not_regular],
			['96osp:gpgv', PLAN_CONF_REASONS.not_allowed_setting],
			['97big', PLAN_CONF_REASONS.too_large],
			['98osp-canary-detect', PLAN_CONF_REASONS.proxy_auto_detect],
			['98osp-canary-incl', PLAN_CONF_REASONS.has_directive],
		])
		expect(view.confCut).toBe(false)
		expect(view.confLeftOut.every(item => item.reasonKey !== PLAN_CONF_REASON_UNKNOWN)).toBe(true)
	})

	it('says that the list is cut when the core cut it at 200', () => {
		const view = planView(core.conf_many)

		expect(core.conf_many.apt_conf_left_out_truncated).toBe(true)
		expect(view.confLeftOut).toHaveLength(200)
		expect(view.confCut).toBe(true)
		expect(planText(core.conf_many)).toContain('\nThe list is cut: there are more.')
	})
})

describe('the answer of the core that the machine could not be asked, and the folder that could not be removed', () => {
	it('says that the machine could not be asked, as the core says it: not plannable, no reason', () => {
		expect(core.status_unknown).toEqual({ plannable: false, unknown: true, state: 'idle' })
		expect(readStatus(core.status_unknown)).toMatchObject({ plannable: false, unknown: true, reason: '', state: 'idle', leftBehind: '' })
	})

	it.each([
		['a reason', { plannable: false, unknown: true, reason: 'identity_unsupported', state: 'idle' }],
		['a plain no', { plannable: false, reason: 'not_root', state: 'idle' }],
		['a yes', { plannable: true, unknown: true, state: 'idle' }],
		['unknown as a word', { plannable: false, unknown: 'true', state: 'idle' }],
		['unknown as false', { plannable: false, unknown: false, state: 'idle' }],
		['nothing said', { state: 'idle' }],
	])('does not say it could not be asked for %s', (_, data) => {
		expect(readStatus(data).unknown).toBe(false)
	})

	it('says the folder that a job that failed could not remove, and the one that a plan that is done could not', () => {
		const failed = readStatus(core.status_failed_left_behind)
		const done = readStatus(core.status_done_left_behind)

		expect(failed).toMatchObject({ state: 'failed', leftBehind: '/var/tmp/casaos-os-plan.Qm4x7K' })
		expect(sayEnglish(failed.error.sentence)).toBe('The plan took too long and was stopped. Nothing was changed on the machine. Try again.')
		expect(done).toMatchObject({ state: 'done', leftBehind: '/var/tmp/casaos-os-plan.Qm4x7K' })
		expect(done.plan.verdict).toBe('blocked')
		expect(readStatus({ plannable: true, state: 'idle' }).leftBehind).toBe('')
	})

	it('says a folder as a clean text, cut, and none that is not a text', () => {
		expect(readStatus({ plannable: true, state: 'failed', error: {}, sandbox_left_behind: '/var/tmp/x\u0000\n<b>y</b>‮' }).leftBehind).toBe('/var/tmp/x  <b>y</b>')
		expect(readStatus({ plannable: true, state: 'failed', error: {}, sandbox_left_behind: `/${'a'.repeat(300)}` }).leftBehind).toHaveLength(120)
		for (const folder of [undefined, null, 5, {}, ['/var/tmp/x'], true, ''])
			expect(readStatus({ plannable: true, state: 'failed', error: {}, sandbox_left_behind: folder }).leftBehind, JSON.stringify(folder)).toBe('')
	})
})

// ---- every answer of the core, in every state it can say --------------------------------------------------------------------
// core.* are the plans (no prefix), the answers of GET /v1/sys/os/upgrade/plan (status_*) and the 409 that refuses a request before a job
// starts (refusal_*), as the core's own code says them.
const ANSWERS = Object.entries(core)
const isStatus = ([name]) => name.startsWith('status_')
const isRefusal = ([name]) => name.startsWith('refusal_')
const PLANS = ANSWERS.filter(answer => !isStatus(answer) && !isRefusal(answer))
const STATUSES = ANSWERS.filter(isStatus)
const REFUSALS = ANSWERS.filter(isRefusal)
// a 409 of the core, as the call that was refused hands it over
const refusedBy = body => ({ response: { status: 409, data: { success: 409, message: body.error, data: body } } })
// a sentence that the window has, in its tables and so in both language files, and not the one it says of what it does not know
const isKnown = key => PLAN_KEYS.includes(key) && ![PLAN_PROBLEM_UNKNOWN, PLAN_ERROR_UNKNOWN, PLAN_ERROR_NONE].includes(key)
const sentencesOf = view => view.problems.map(item => sayEnglish(item.sentence))
const sizesOf = view => view.disk.map(row => [row.path, row.need, row.free, row.ok])

describe('the plans of the core, one for each thing it can find', () => {
	it('has a plan for every problem code, and says each of their problems by the sentence of its own code', () => {
		expect(new Set(PLANS.flatMap(([, plan]) => plan.problems.map(item => item.code)))).toEqual(new Set(PROBLEM_CODES))
		for (const [name, plan] of PLANS) {
			for (const item of planView(plan).problems)
				expect(isKnown(item.sentence.key), `${name}: ${item.code}`).toBe(true)
		}
	})

	it('says only the verdicts, the weights, the actions on a file and the words on a line that the window has', () => {
		for (const [name, plan] of [['real', real], ...PLANS]) {
			expect(VERDICTS, name).toContain(plan.verdict)
			for (const item of plan.problems)
				expect(SEVERITIES, `${name}: ${item.code}`).toContain(item.severity)
			for (const file of plan.sources.files) {
				expect(FILE_ACTIONS, `${name}: ${file.file}`).toContain(file.action)
				for (const line of file.lines)
					expect(LINE_WHY, `${name}: ${file.file} line ${line.n}`).toEqual(expect.arrayContaining(String(line.why).split(',')))
			}
		}
	})

	it('names the package that the plan protects and the one that is essential, and blocks on each, as the core does', () => {
		const protectedView = planView(core.protected)
		expect(protectedView.verdict).toBe('blocked')
		expect(sentencesOf(protectedView)).toEqual(['The upgrade would remove docker-ce, which ReCasaOS protects (it matches docker-ce). This blocks the upgrade.'])
		expect(protectedView.removals.map(item => [item.name, item.protected, item.essential, item.manual])).toEqual([['docker-ce', true, false, false], ['libsemanage1', false, false, false]])

		const essentialView = planView(core.essential)
		expect(essentialView.verdict).toBe('blocked')
		expect(essentialView.problems.map(item => [item.code, item.severity])).toEqual([['removal_essential', 'blocked'], ['removal_manual', 'needs_acceptance']])
		expect(sentencesOf(essentialView)[0]).toBe('The upgrade would remove libsemanage1, a package the system cannot work without. This blocks the upgrade.')
		expect(essentialView.removals.map(item => [item.name, item.protected, item.essential, item.manual])).toEqual([['fuse', false, false, true], ['libsemanage1', false, true, false]])
		// the removal that is shown in red blocks, whatever the core weighed it
		expect(planView({ ...core.essential, verdict: 'needs_acceptance', problems: [] }).verdict).toBe('blocked')
	})

	it('says the packages of Docker that are on hold for information, and lets them weigh nothing on the verdict', () => {
		const view = planView(core.docker_held)

		expect(view.problems.map(item => [item.code, item.severity])).toEqual([['removal_manual', 'needs_acceptance'], ['docker_held', 'info']])
		expect(sentencesOf(view)[1]).toBe('Docker\'s packages are on hold (containerd.io, docker-ce). That is expected: the upgrade leaves them alone, and Docker\'s package source is put aside while it runs.')
		expect(view.verdict).toBe('needs_acceptance')
		expect(planView({ ...core.docker_held, problems: core.docker_held.problems.filter(item => item.code === 'docker_held'), removals: [], verdict: 'ok' }).verdict).toBe('ok')
	})
})

describe('a box with nothing to do', () => {
	it('is a plan with sizes that are known and zero, the floors of the disk, and nothing in the way', () => {
		const view = planView(core.nothing)

		// apt printed no size for it, and the core reads that as none to download and none to add, which is not sizes that were not read
		expect(core.nothing.estimates).toEqual({ known: true, download_bytes: 0, extra_bytes: 0 })
		expect(core.nothing.disk_note).toBeUndefined()
		expect(view.verdict).toBe('ok')
		expect(view.problems).toEqual([])
		expect(view.estimates).toEqual({ known: true, download: '0 MiB', extra: '0 MiB', freed: false })
		expect(view.diskNote).toBe('')
		expect(sizesOf(view)).toEqual([['/var/cache/apt/archives', '512 MiB', '8 GiB', true], ['/usr', '1 GiB', '8 GiB', true], ['/', '512 MiB', '20 GiB', true]])
		expect(view.counts).toEqual({ full: { upgraded: 0, new: 0, removed: 0, keptBack: 0 }, first: { upgraded: 0, new: 0, removed: 0, keptBack: 0 } })
		expect(view.removals).toEqual([])
		expect(view.added.count).toBe(0)
	})

	it('says its zero sizes as sizes in the text of the plan, and not as sizes that were not read', () => {
		const text = planText(core.nothing)

		expect(text).toContain('Findings (0)\n')
		expect(text).toContain('full upgrade: upgraded 0, new 0, removed 0, kept back 0\nfirst, minimal upgrade: upgraded 0, new 0, removed 0, kept back 0\n')
		expect(text).toContain('Disk\ndownload: 0 MiB\nextra space: 0 MiB\n/var/cache/apt/archives: needs 512 MiB, free 8 GiB\n/usr: needs 1 GiB, free 8 GiB\n/: needs 512 MiB, free 20 GiB\n')
		expect(text).not.toContain('did not say how much')
		expect(text).not.toContain('SHORT')
	})

	it('is blocked by the floors when the box is tight, in each of the three places, with what each needed and what there was', () => {
		const view = planView(core.nothing_tight)

		expect(view.verdict).toBe('blocked')
		expect(sentencesOf(view)).toEqual([
			'There is not enough room on /var/cache/apt/archives: 512 MiB needed, 400 MiB free. This blocks the upgrade.',
			'There is not enough room on /usr: 1 GiB needed, 900 MiB free. This blocks the upgrade.',
			'There is not enough room on /: 512 MiB needed, 400 MiB free. This blocks the upgrade.',
		])
		expect(sizesOf(view)).toEqual([['/var/cache/apt/archives', '512 MiB', '400 MiB', false], ['/usr', '1 GiB', '900 MiB', false], ['/', '512 MiB', '400 MiB', false]])
		expect(view.estimates.known).toBe(true)
		expect(planText(core.nothing_tight)).toContain('free 400 MiB SHORT\n/usr: needs 1 GiB, free 900 MiB SHORT\n/: needs 512 MiB, free 400 MiB SHORT')
		// the rows of the disk alone block it
		expect(planView({ ...core.nothing_tight, verdict: 'ok', problems: [] }).verdict).toBe('blocked')
	})

	it('lists the one package that is no longer needed, with the sizes still known and zero', () => {
		const view = planView(core.nothing_one_unneeded)

		expect(view.verdict).toBe('ok')
		expect(view.unneeded).toEqual({ names: 'osp-b', count: 1, truncated: false })
		expect(view.estimates).toMatchObject({ known: true, download: '0 MiB', extra: '0 MiB' })
		expect(planText(core.nothing_one_unneeded)).toContain('no longer needed (1): osp-b\n')
	})
})

describe('the answers of GET plan, in each state and for each way a job ends', () => {
	it.each(STATUSES)('reads %s as the core said it', (name, data) => {
		const status = readStatus(data)

		expect(status, name).not.toBe(null)
		expect(status.state).toBe(data.state)
		expect(status.plannable).toBe(data.plannable === true)
		if (data.state === 'failed') {
			expect(ERROR_CODES).toContain(status.error.code)
			expect(isKnown(status.error.sentence.key)).toBe(true)
			// the core says the phase that the job was in, with the failure and with the status
			expect(status.error.phase).toMatchObject({ total: 6 })
			expect(status.phase).toEqual(status.error.phase)
			expect(status.error.finishedAt).toMatch(/Oct 12, 2026/)
		}
		if (data.state === 'done') {
			expect(status.plan.id).toBe(data.plan.plan_id)
			expect(isKnown(PLAN_VERDICTS[status.plan.verdict].key)).toBe(true)
		}
	})

	it('has an answer for each state of the job, and a failure or a refusal for each code that a plan can fail with', () => {
		expect(new Set(STATUSES.map(([, data]) => data.state))).toEqual(new Set(STATES))
		const codes = new Set([...STATUSES.filter(([, data]) => data.error).map(([, data]) => data.error.code), ...REFUSALS.map(([, body]) => body.error_code)])
		expect(codes).toEqual(new Set(ERROR_CODES))
	})

	it('reads a machine that is idle, each reason that a plan cannot be made for it, a job that runs, and a plan that has expired', () => {
		expect(core.status_idle).toEqual({ plannable: true, state: 'idle' })
		expect(readStatus(core.status_idle)).toMatchObject({ plannable: true, reason: '', unknown: false, state: 'idle', phase: null, expired: false, error: null, plan: null })
		for (const reason of ['not_root', 'hop_not_planned', 'identity_unsupported']) {
			expect(core[`status_${reason}`]).toEqual({ plannable: false, reason, state: 'idle' })
			expect(readStatus(core[`status_${reason}`])).toMatchObject({ plannable: false, reason, unknown: false, state: 'idle' })
		}
		expect(readStatus(core.status_running)).toMatchObject({ plannable: true, state: 'running', phase: { step: 2, total: 6 }, error: null, plan: null })
		expect(readStatus(core.status_expired)).toMatchObject({ plannable: true, state: 'idle', expired: true, plan: null, error: null })
	})

	it('reads a plan that is done, the one of the real box and the one of a box with nothing to do', () => {
		const done = readStatus(core.status_done)
		expect(done.plan.id).toBe(real.plan_id)
		expect(done.plan.verdict).toBe('needs_acceptance')
		expect(done.raw).toEqual(real)
		expect(done.leftBehind).toBe('')

		const nothing = readStatus(core.status_done_nothing)
		expect(nothing.plan.verdict).toBe('ok')
		expect(nothing.plan.estimates).toMatchObject({ known: true, download: '0 MiB', extra: '0 MiB' })
		expect(nothing.raw).toEqual(core.nothing)
	})

	// the failure of a job that said its lines: only the ones apt wrote are said, as apt's, and the sentence is the code's
	it.each([
		['status_failed_update', 'sandbox_update_failed', 2, PLAN_UPDATE_KINDS.network[0], 3],
		['status_failed_update_unreachable', 'sandbox_update_failed', 2, PLAN_UPDATE_KINDS.network[0], 3],
		['status_failed_update_no_pubkey', 'sandbox_update_failed', 2, PLAN_UPDATE_KINDS.no_pubkey[0], 3],
		['status_failed_update_not_found', 'sandbox_update_failed', 2, PLAN_UPDATE_KINDS.not_found[0], 2],
		['status_failed_update_release_change', 'sandbox_update_failed', 2, PLAN_UPDATE_KINDS.release_change[0], 1],
		['status_failed_update_other', 'sandbox_update_failed', 2, PLAN_UPDATE_KINDS.other[0], 1],
		['status_failed_solver', 'sandbox_solver_failed', 3, PLAN_ERRORS.sandbox_solver_failed[0], 1],
		['status_failed_solver_dist', 'sandbox_solver_failed', 4, PLAN_ERRORS.sandbox_solver_failed[0], 1],
		['status_failed_half_configured', 'plan_unparsed', 6, PLAN_ERRORS.plan_unparsed.variants.not_fully_installed[0], 0],
		['status_failed_unparsed', 'plan_unparsed', 6, PLAN_ERRORS.plan_unparsed.text[0], 0],
		['status_failed_unparsed_removal', 'plan_unparsed', 6, PLAN_ERRORS.plan_unparsed.text[0], 0],
		['status_failed_timeout_solver', 'timeout', 4, PLAN_ERRORS.timeout[0], 0],
		['status_failed_internal', 'internal', 4, PLAN_ERRORS.internal[0], 0],
		['status_failed_canceled', 'canceled', 2, PLAN_ERRORS.canceled[0], 0],
	])('says %s by its code, with the step it stopped at and the lines that apt wrote', (name, code, step, key, lines) => {
		const { error } = readStatus(core[name])

		expect(core[name].error.code).toBe(code)
		expect(error.code).toBe(code)
		expect(error.sentence.key).toBe(key)
		expect(error.phase.step).toBe(step)
		expect(error.detail).toHaveLength(lines)
		for (const line of error.detail)
			expect(line).toMatch(/^(?:E:|W:|Err:)/)
	})

	// what the core says of a package source that it refuses is English for whoever reads the raw answer: the window says it by the code, the place and the reason
	it.each([
		['status_failed_sources_format', 'sources_format', 'File debian.sources', PLAN_SOURCE_REASONS.deb822],
		['status_failed_sources_format_undecided', 'sources_format', 'File sources.list, line 2', PLAN_SOURCE_REASONS.undecided],
		['status_failed_sources_alias', 'sources_alias', 'File sources.list, line 1', null],
		['status_failed_sources_target', 'sources_target', 'File sources.list, line 1', null],
		['status_failed_sources_cdrom', 'sources_cdrom', 'File sources.list, line 1', null],
		['status_failed_sources_mixed_file', 'sources_mixed_file', null, null],
	])('says %s by its code, where the source is and why, and none of what the core wrote of it', (name, code, place, reason) => {
		const { error } = readStatus(core[name])

		expect(core[name].error.phase).toBe('sources')
		expect(core[name].error.detail).toEqual(expect.any(String))
		expect(core[name].error.detail).not.toBe('')
		expect(error.code).toBe(code)
		expect(error.phase.step).toBe(1)
		expect(error.place && sayEnglish(error.place)).toBe(place)
		expect(error.reason).toBe(reason)
		expect(error.detail).toEqual([])
		expect(error.confLeftOut).toEqual([])
	})

	// a source that is already at the next release is what an earlier try by hand leaves behind: the core's detail says, in English for whoever reads the
	// raw answer, where the way back is and when it is shut, and the window says it in its own words, from the code
	it('says the way back from a source that is at the next release in its own words, and shows none of the core\'s', () => {
		const { error } = readStatus(core.status_failed_sources_target)

		expect(core.status_failed_sources_target.error.detail).toContain('restore-sources.sh')
		expect(core.status_failed_sources_target.error.detail).toContain('begun-upgrade')
		expect(error.sentence.key).toContain('/var/backups/casaos-os-upgrade-*/restore-sources.sh')
		expect(fr[error.sentence.key]).toContain('/var/backups/casaos-os-upgrade-*/restore-sources.sh')
		expect(error.detail).toEqual([])
	})

	it('says the name of a file of sources that is mixed, as the core gave it', () => {
		expect(sayEnglish(readStatus(core.status_failed_sources_mixed_file).error.sentence)).toBe('A file of package sources mixes the distribution\'s own lines with others: mix.list. Split it in two, then try again.')
	})

	it('says the lines that apt wrote for each kind of failed update, as they were, and the kind by the sentence of the kind', () => {
		const lines = name => readStatus(core[name]).error.detail
		const kind = name => core[name].error.data.kind

		expect(['status_failed_update', 'status_failed_update_unreachable', 'status_failed_update_no_pubkey', 'status_failed_update_not_found', 'status_failed_update_release_change', 'status_failed_update_other'].map(kind)).toEqual(['network', 'network', 'no_pubkey', 'not_found', 'release_change', 'other'])
		expect(lines('status_failed_update_unreachable')).toEqual([
			'Err:3 http://192.0.2.1 bookworm/main amd64 Packages',
			'E: Failed to fetch http://192.0.2.1  Cannot initiate the connection to 192.0.2.1:80 (192.0.2.1). - connect (101: Network is unreachable)',
			'E: Some index files failed to download. They have been ignored, or old ones used instead.',
		])
		expect(lines('status_failed_update_no_pubkey')).toEqual([
			'Err:1 http://deb.debian.org bookworm InRelease',
			'W: GPG error: http://deb.debian.org bookworm InRelease: The following signatures couldn\'t be verified because the public key is not available: NO_PUBKEY 0E98404D386FA1D9',
			'E: The repository \'http://deb.debian.org bookworm InRelease\' is not signed.',
		])
		expect(lines('status_failed_update_other')).toEqual(['E: Could not open file /var/lib/apt/lists/partial/x - open (28: No space left on device)'])
		expect(lines('status_failed_solver_dist')).toEqual(['E: Unable to correct problems, you have held broken packages.'])
	})
})

describe('the 409 that refuses a request before a job starts', () => {
	it.each([
		['refusal_not_root', 'not_root', 'ReCasaOS does not run as root on this machine, so it cannot plan the upgrade.'],
		['refusal_hop_not_planned', 'hop_not_planned', 'ReCasaOS cannot plan the upgrade from this release yet.'],
		['refusal_identity_unsupported', 'identity_unsupported', 'This machine is not one that a plan can be made for: it is not a release that ReCasaOS knows how to upgrade, or it has no later one.'],
		['refusal_busy', 'busy', 'Another package manager is at work on this machine. Wait for it to end, then try again.'],
		['refusal_busy_unknown', 'busy', 'Whether another package manager is at work on this machine could not be seen, so no plan was made. Try again in a moment.'],
		['refusal_no_room', 'no_room', 'There is not enough room in /var/tmp for the plan\'s temporary folder: 640 MiB needed, 639 MiB free. Free some space, then try again.'],
		['refusal_no_room_unknown', 'no_room', 'There is not enough room in /var/tmp for the plan\'s temporary folder: 640 MiB needed, and the room that is free could not be read. Free some space, then try again.'],
	])('says %s by its code and its data', (name, code, sentence) => {
		expect(core[name].error_code).toBe(code)
		expect(refusalOf(refusedBy(core[name]))).toEqual({ code, data: core[name].data ?? {} })

		const view = startRefusal(refusedBy(core[name]))
		expect(view.code).toBe(code)
		expect(sayEnglish(view.sentence)).toBe(sentence)
		expect(view.detail).toEqual([])
		expect(isKnown(view.sentence.key)).toBe(true)
	})

	it('says a machine that could not be asked, or a room that could not be read, only when the core says so in its data', () => {
		expect(core.refusal_busy.data).toBeUndefined()
		expect(core.refusal_busy_unknown.data).toEqual({ unknown: true })
		expect(core.refusal_no_room.data.unknown).toBeUndefined()
		expect(core.refusal_no_room_unknown.data.unknown).toBe(true)
		expect(core.refusal_identity_unsupported.data.unknown).toBeUndefined()
	})
})

describe('a reason that the window has a sentence for, and one that it says by the code', () => {
	it.each(NO_PLAN_REASONS)('says why there is no plan to write the runbook from, for %s', (reason) => {
		const failure = runbookFailure(refusedBy({ error_code: 'no_plan', error: 'x', data: { reason } }))

		expect(failure.key).toBe(PLAN_RUNBOOK_REFUSALS.no_plan.variants[reason][0])
		expect(failure.button).toBe('retry')
		expect(isKnown(failure.key)).toBe(true)
	})

	it.each(NO_RUNBOOK_REASONS)('says why the runbook could not be written, for %s', (reason) => {
		const failure = runbookFailure(refusedBy({ error_code: 'no_runbook', error: 'x', data: { reason } }))

		expect(failure.key).toBe(PLAN_RUNBOOK_REFUSALS.no_runbook.variants[reason][0])
		expect(failure.button).toBe('none')
	})

	it('says the other reason that the service gives for no plan, by the code', () => {
		expect(runbookFailure(refusedBy({ error_code: 'no_plan', error: 'x', data: { reason: 'unavailable' } })).key).toBe(PLAN_RUNBOOK_REFUSALS.no_plan.text[0])
	})

	it.each(UNPARSED_REASONS)('says a plan that was not understood for %s, by the sentence of its code unless it has one of its own', (reason) => {
		const view = errorView({ code: 'plan_unparsed', data: { reason } })
		const own = PLAN_ERRORS.plan_unparsed.variants[reason]

		expect(view.sentence.key).toBe(own ? own[0] : PLAN_ERRORS.plan_unparsed.text[0])
		expect(isKnown(view.sentence.key)).toBe(true)
	})

	it.each(['encoding', 'chars', 'control', 'crlf', 'nul', 'long_line', 'type', 'options', 'fields', 'too_many', 'uri', 'suite', 'component', 'trusted', 'undecided', 'deb822', 'unreadable', 'no_distribution_line'])('says a source that is refused for %s with a reason of its own, and not the one of a reason it does not know', (reason) => {
		const { reason: said } = errorView({ code: 'sources_format', data: { file: 'x.list', reason } })

		expect(said).toBe(PLAN_SOURCE_REASONS[reason])
		expect(said).not.toBe(PLAN_SOURCE_REASONS.other)
		expect(isKnown(said)).toBe(true)
	})
})

describe('what comes from the machine', () => {
	const hostile = '<img src=x onerror=alert(1)>'

	it('is cut, has its control characters and its turning marks replaced, and stays text', () => {
		const view = planView(plan({
			removals: [{ name: `${hostile}\n\u0000b\u202Ec`, version: 'x'.repeat(500), manual: true }],
			new_packages: [hostile, 'a\nb', 7, null],
			problems: [problem('removal_manual', { name: `${hostile}\u202E`, version: '1' })],
		}))
		expect(view.removals[0].name).toBe(`${hostile}  b c`)
		expect(view.removals[0].version).toHaveLength(80)
		expect(view.added.names).toBe(`${hostile}, a b`)
		expect(sayEnglish(view.problems[0].sentence)).toContain(hostile)
		expect(unsafeIn(sayEnglish(view.problems[0].sentence))).toEqual([])
		expect(unsafeIn(view.removals[0].name + view.added.names)).toEqual([])
	})

	// the badges say what the core said, and only that: a flag that is missing, or is not a boolean, is not one
	it('says a removal is by hand, protected or essential only when the core said true', () => {
		const flags = planView(plan({ removals: [{ name: 'a' }, { name: 'b', manual: 'true', protected: 1, essential: 'yes' }, { name: 'c', manual: true, protected: true, essential: true }] })).removals
		expect(flags.map(removal => [removal.manual, removal.protected, removal.essential])).toEqual([[false, false, false], [false, false, false], [true, true, true]])
	})

	it('shows a line of the sources with the user and the query of its address hidden, whatever the core sent', () => {
		const file = { file: 'x.list', action: 'rewritten', lines: [{ n: 1, before: 'deb https://user:s3cret@host.example/debian?token=abc bullseye main', after: 'deb [trusted=no] http://a:b@host.example/x/y?z=1&t=2 bookworm main # ok', why: 'suite' }, { n: 2, before: 'x'.repeat(1000), after: '', why: 'nonsense, dropped' }] }
		const view = planView(plan({ sources: { files: [file] } }))
		expect(view.sources.files[0].lines[0].before).toBe('deb https://***@host.example/debian?*** bullseye main')
		expect(view.sources.files[0].lines[0].after).toBe('deb [trusted=no] http://***@host.example/x/y?*** bookworm main # ok')
		expect(view.sources.files[0].lines[1].before).toHaveLength(400)
		// a word the window has no label for is dropped, the others kept
		expect(view.sources.files[0].lines[1].why).toEqual(['left out'])
		expect(JSON.stringify(view)).not.toMatch(/s3cret|token=abc|a:b@/)
	})

	it('hides the user and the query again and again the same', () => {
		for (const line of ['deb http://u:p@h/p?q=1 a b', 'deb http://h/p a b', 'deb ftp://u@h a b', 'no address', 'deb http://h/p?q=1?r=2 a'])
			expect(scrub(scrub(line))).toBe(scrub(line))
		expect(scrub('deb http://u:p@h/p?q=1 a b')).toBe('deb http://***@h/p?*** a b')
	})

	it('lists the files that are put aside, and the lines of sources.list that are, by their place', () => {
		const view = planView(plan({ paused: [{ file: 'docker.list', hosts: ['https://download.docker.com'], docker: true }, { file: 'tailscale.list', hosts: ['https://pkgs.tailscale.com'], docker: false }, { file: 'sources.list', line: 7, hosts: ['http://u:p@x.example'], docker: false }] }))
		expect(view.sources.dockerFiles).toBe('docker.list')
		expect(view.sources.otherPaused).toBe('tailscale.list, sources.list:7')
	})

	it('lists no more of a file than a file has lines, and says how many are left out', () => {
		const lines = Array.from({ length: 150 }, (_, index) => ({ n: index + 1, before: 'a', after: 'b', why: 'suite' }))
		const file = planView(plan({ sources: { files: [{ file: 'big.list', action: 'rewritten', lines }] } })).sources.files[0]
		expect(file.lines).toHaveLength(60)
		expect(file.more).toBe(90)
	})

	it('says an action it does not know as none of the three', () => {
		expect(planView(plan({ sources: { files: [{ file: 'a.list', action: 'toString', lines: [] }, { file: 'b.list', lines: [] }] } })).sources.files.map(file => file.action)).toEqual(['', ''])
	})
})

describe('what is not a plan', () => {
	it.each([null, undefined, 'plan', 42, [], true])('has no view of %j', (value) => {
		expect(planView(value)).toBe(null)
		expect(planText(value)).toBe('')
	})

	it('reads a plan that lacks things, or has them wrong, without breaking', () => {
		const view = planView({ problems: 'x', counts: [], removals: { a: 1 }, sources: [], paused: 'p', disk: [null, 3, { path: 7 }], estimates: [], plan_id: 'p1-ABC', hop: 7, new_packages: 'x', apt_conf_left_out: 4, expires_at: 'tomorrow' })
		expect(view.verdict).toBe('blocked')
		expect(view.id).toBe('')
		expect(view.shortId).toBe('')
		expect(view.removals).toEqual([])
		expect(view.counts.full).toEqual({ upgraded: null, new: null, removed: null, keptBack: null })
		expect(view.disk).toEqual([{ path: '', need: '', free: '', unknown: false, ok: false }])
		expect(view.confLeftOut).toEqual([])
		expect(view.expiresMs).toBe(null)
		expect(planText({ plan_id: 7 })).toContain('verdict: blocked')
	})

	it('says each file of apt\'s configuration that was left out by its reason, and a reason it does not know as one it does not', () => {
		const files = CONF_REASONS.map(reason => ({ file: `${reason}.conf`, reason }))
		const view = planView(plan({ apt_conf_left_out: [...files, { file: 'x', reason: 'from-the-future' }, { file: 'y', reason: 'toString' }, { file: 'z' }, { reason: 'too_large' }, 'w', null] }))
		expect(view.confLeftOut.map(item => [item.file, item.reasonKey])).toEqual([
			...CONF_REASONS.map(reason => [`${reason}.conf`, PLAN_CONF_REASONS[reason]]),
			['x', PLAN_CONF_REASON_UNKNOWN],
			['y', PLAN_CONF_REASON_UNKNOWN],
			['z', PLAN_CONF_REASON_UNKNOWN],
		])
		// an entry that is only a name is not one of the core's
		expect(planView(plan({ apt_conf_left_out: ['15update-stamp'] })).confLeftOut).toEqual([])
	})

	// the core keeps at most 200 of the files it left out, and says when it cut the list
	it('says that the list of files left out is cut when the core says it is, and only then', () => {
		expect(planView(plan()).confCut).toBe(false)
		expect(planView(plan({ apt_conf_left_out_truncated: true })).confCut).toBe(true)
		for (const cut of [false, 'true', 1, 'yes', null, {}, []])
			expect(planView(plan({ apt_conf_left_out_truncated: cut })).confCut, JSON.stringify(cut)).toBe(false)
		expect(planText(plan({ apt_conf_left_out_truncated: true }))).toContain('15update-stamp: It is not made of simple settings, one to a line.\nThe list is cut: there are more.')
		expect(planText(plan())).not.toContain('The list is cut')
	})

	it('reads at most 200 of the files left out, whatever the core sent, and says that the list is cut when it had to cut it', () => {
		const many = Array.from({ length: 450 }, (_, index) => ({ file: `f${index}`, reason: 'not_simple' }))
		const view = planView(plan({ apt_conf_left_out: many }))
		expect(view.confLeftOut).toHaveLength(200)
		expect(view.confCut).toBe(true)
		expect(planView(plan({ apt_conf_left_out: many.slice(0, 200) })).confCut).toBe(false)
	})

	it('takes an id only in the core\'s form', () => {
		expect(planView(plan({ plan_id: 'p1-5787acb2f81006785a3076312615ae6c\n../x' })).id).toBe('')
		expect(planView(plan({ plan_id: 'p2-5787acb2f81006785a3076312615ae6c' })).id).toBe('')
	})
})

describe('how the job is going', () => {
	it('says an idle job, and one that expired', () => {
		expect(readStatus({ plannable: true, state: 'idle' })).toMatchObject({ plannable: true, state: 'idle', expired: false, error: null, plan: null })
		expect(readStatus({ plannable: true, state: 'idle', expired: true, expires_at: '2026-10-13T09:30:00Z' })).toMatchObject({ state: 'idle', expired: true })
	})

	it('says a job that runs, and its step', () => {
		const status = readStatus({ plannable: true, state: 'running', phase: 'update', started_at: '2026-10-12T09:30:00Z' })
		expect(status).toMatchObject({ state: 'running', phase: { step: 2, total: 6 }, alreadyRunning: false })
		expect(readStatus({ plannable: true, state: 'running', phase: 'a-new-phase', already_running: true })).toMatchObject({ phase: null, alreadyRunning: true })
	})

	it('says a job that is done, with its plan', () => {
		const status = readStatus({ plannable: true, state: 'done', plan: real })
		expect(status.state).toBe('done')
		expect(status.plan.verdict).toBe('needs_acceptance')
		expect(status.raw).toBe(real)
	})

	it('says a job that failed, by the code of its error', () => {
		const status = readStatus({ plannable: true, state: 'failed', phase: 'update', error: { code: 'sandbox_update_failed', phase: 'update', detail: 'W: x', data: { kind: 'network' } } })
		expect(status.state).toBe('failed')
		expect(status.error.code).toBe('sandbox_update_failed')
		expect(status.error.phase).toMatchObject({ step: 2 })
	})

	it('says a job that is done with no plan to read as a failure that says no code, never as done', () => {
		for (const plan of [undefined, null, 'p', []]) {
			const status = readStatus({ plannable: true, state: 'done', plan })
			expect(status.state).toBe('failed')
			expect(sayEnglish(status.error.sentence)).toBe('The plan could not be made.')
		}
	})

	it('does not read an answer that is not one, or a state it does not know', () => {
		for (const data of [null, undefined, 'done', [], 42, {}, { state: 'from-the-future' }, { state: 'toString' }, { plannable: true }])
			expect(readStatus(data)).toBe(null)
	})

	it('is plannable only when the core says true', () => {
		expect(readStatus({ state: 'idle', plannable: 'yes' }).plannable).toBe(false)
		expect(readStatus({ state: 'idle', plannable: false, reason: 'identity_unsupported' })).toMatchObject({ plannable: false, reason: 'identity_unsupported' })
	})
})

describe('why a plan could not be made', () => {
	const said = (code, data = {}, extra = {}) => sayEnglish(errorView({ code, data, ...extra }).sentence)

	it.each([
		['not_root', {}, 'ReCasaOS does not run as root on this machine, so it cannot plan the upgrade.'],
		['hop_not_planned', { hop: 'debian-12-13' }, 'ReCasaOS cannot plan the upgrade from this release yet.'],
		['identity_unsupported', { state: 'latest', checks: ['latest'] }, 'This machine is not one that a plan can be made for: it is not a release that ReCasaOS knows how to upgrade, or it has no later one.'],
		['busy', {}, 'Another package manager is at work on this machine. Wait for it to end, then try again.'],
		['busy', { unknown: true }, 'Whether another package manager is at work on this machine could not be seen, so no plan was made. Try again in a moment.'],
		['no_room', { path: '/var/tmp', need: 671088640, free: 104857600 }, 'There is not enough room in /var/tmp for the plan\'s temporary folder: 640 MiB needed, 100 MiB free. Free some space, then try again.'],
		['no_room', { path: '/var/tmp', need: 671088640, free: 0, unknown: true }, 'There is not enough room in /var/tmp for the plan\'s temporary folder: 640 MiB needed, and the room that is free could not be read. Free some space, then try again.'],
		['no_room', {}, 'There is not enough room for the plan\'s temporary folder. Free some space, then try again.'],
		['sources_format', { file: 'x.list', line: 3, reason: 'type' }, 'A package source is not in a form the plan reads.'],
		['sources_alias', { file: 'sources.list', line: 1, reason: 'alias' }, 'A package source names its release by an alias that moves with the archive: name the release in it, then try again.'],
		['sources_target', { file: 'sources.list', line: 1, reason: 'target' }, 'A package source is already at the next release, or past it. If an earlier try of the upgrade by hand rewrote the sources, find the script that its runbook named, /var/backups/casaos-os-upgrade-*/restore-sources.sh (a folder for each plan), and run it with sh, or finish that upgrade. The script refuses once the upgrade of the packages has begun.'],
		['sources_mixed_file', { file: 'mixed.list' }, 'A file of package sources mixes the distribution\'s own lines with others: mixed.list. Split it in two, then try again.'],
		['sources_mixed_file', {}, 'A file of package sources mixes the distribution\'s own lines with others. Split it in two, then try again.'],
		['sources_cdrom', { file: 'sources.list', line: 2, reason: 'cdrom' }, 'A package source is a disc or a local folder, which cannot be upgraded from.'],
		['sandbox_solver_failed', { exit: 100 }, 'apt could not work out the upgrade.'],
		['plan_unparsed', { reason: 'removal_unknown', name: 'x' }, 'ReCasaOS could not understand what apt said, so it makes no partial plan.'],
		['plan_unparsed', {}, 'ReCasaOS could not understand what apt said, so it makes no partial plan.'],
		// dpkg left a package half done: apt says it after its summary, and the real upgrade refuses it too (the core says which word)
		['plan_unparsed', { reason: 'not_fully_installed', line: '1 not fully installed or removed.' }, 'A package on this machine is half installed or half configured, so there is no plan until it is mended. Run dpkg --configure -a in a console, then make the plan again.'],
		['timeout', {}, 'The plan took too long and was stopped. Nothing was changed on the machine. Try again.'],
		['canceled', {}, 'The plan was stopped because ReCasaOS was stopping. Try again.'],
		['internal', {}, 'The plan failed unexpectedly. Nothing was changed on the machine. Try again.'],
	])('says %s from its data', (code, data, sentence) => {
		expect(said(code, data)).toBe(sentence)
	})

	// a source that is already at the next release may be the work of an earlier try by hand: the sentence names the script that puts the
	// sources back, in a path that a translation must not change, and says that the way is forward once the script refuses
	it('names the restore script of an earlier try on sources_target, in both languages', () => {
		const key = errorView({ code: 'sources_target', data: {} }).sentence.key
		for (const text of [key, fr[key]]) {
			expect(text).toContain('/var/backups/casaos-os-upgrade-*/restore-sources.sh')
			expect(text).not.toMatch(/\{\w+\}/)
		}
		expect(fr[key]).toMatch(/terminez cette mise à niveau/)
		expect(key).toMatch(/finish that upgrade/)
	})

	it('says every code the core has', () => {
		for (const code of ERROR_CODES)
			expect(errorView({ code }).sentence.key).not.toMatch(/could not be made/)
	})

	it.each([
		['no_pubkey', 'apt could not check the signature of a package source: its key is missing from this machine.'],
		['not_found', 'A package source, or a file of it, was not found: a mirror may not have the next release, or its address is wrong.'],
		['network', 'apt could not reach a package source: check the network and the name server of the machine.'],
		['release_change', 'A package source changed its description of itself while apt was reading it. Try again later.'],
		['other', 'apt could not update the package lists of the next release.'],
		['from-the-future', 'apt could not update the package lists of the next release.'],
		[undefined, 'apt could not update the package lists of the next release.'],
	])('says a failed update of kind %s', (kind, sentence) => {
		expect(said('sandbox_update_failed', { kind })).toBe(sentence)
	})

	it('says where a source that is refused is, and why', () => {
		expect(errorView({ code: 'sources_format', data: { file: 'x.list', line: 3, reason: 'trusted' } })).toMatchObject({
			place: { key: 'File {file}, line {line}', params: { file: 'x.list', line: '3' } },
			reason: PLAN_SOURCE_REASONS.trusted,
		})
		expect(errorView({ code: 'sources_format', data: { file: 'x.list', reason: 'deb822' } }).place).toEqual({ key: 'File {file}', params: { file: 'x.list' } })
		expect(errorView({ code: 'sources_format', data: { reason: 'no_distribution_line' } })).toMatchObject({ place: null, reason: PLAN_SOURCE_REASONS.no_distribution_line })
		expect(errorView({ code: 'sources_format', data: { file: 'x.list', reason: 'from-the-future' } }).reason).toBe(PLAN_SOURCE_REASONS.other)
		expect(errorView({ code: 'sources_alias', data: { file: 'sources.list', line: 1, reason: 'alias' } })).toMatchObject({ reason: null, place: { params: { file: 'sources.list', line: '1' } } })
		expect(errorView({ code: 'timeout', data: { file: 'sources.list' } }).place).toBe(null)
	})

	// the core refuses a source whose lists it has not read and says to run apt-get update first: the window says it too
	it('says the remedy of a source whose own is not known: the lists first, then the plan again', () => {
		const view = errorView({ code: 'sources_format', data: { file: 'sources.list.d/x.list', line: 1, reason: 'undecided' } })

		expect(view.reason).toBe(PLAN_SOURCE_REASONS.undecided)
		expect(view.reason).toBe('The plan could not tell whether this source is the distribution\'s own. Update the package lists first (apt-get update, or the System packages window), then make the plan again.')
	})

	it('says every reason a source is refused for, which the core has', () => {
		const reasons = ['encoding', 'chars', 'control', 'crlf', 'nul', 'long_line', 'type', 'options', 'fields', 'too_many', 'uri', 'suite', 'component', 'trusted', 'undecided', 'deb822', 'unreadable', 'no_distribution_line']
		expect(Object.keys(PLAN_SOURCE_REASONS).sort()).toEqual([...reasons, 'other'].sort())
	})

	it('says the step it stopped at', () => {
		expect(errorView({ code: 'timeout', phase: 'estimate' }).phase).toEqual({ step: 5, total: 6, key: 'Estimating the download and the disk space' })
		expect(errorView({ code: 'timeout', phase: 'x' }).phase).toBe(null)
	})

	// only what apt itself wrote is given as apt's: the core adds its own words when apt wrote none, and its reason for a plan it did not understand
	it('gives the lines apt wrote, as text and cleaned, for the codes that say what apt said, under apt\'s name', () => {
		const detail = 'Err:3 http://u:p@deb.debian.org/debian bookworm InRelease\nCould not resolve \'deb.debian.org\'\nW: Failed to fetch http://u:p@deb.debian.org/debian/dists/bookworm/InRelease\nE: Some index files failed to download.\n\n<img onerror=alert(1)>\u0000x\napt-get update ended with status 100'
		for (const code of ['sandbox_update_failed', 'sandbox_solver_failed']) {
			const view = errorView({ code, detail })
			expect(view.detail).toEqual(['Err:3 http://***@deb.debian.org/debian bookworm InRelease', 'W: Failed to fetch http://***@deb.debian.org/debian/dists/bookworm/InRelease', 'E: Some index files failed to download.'])
			expect(view.saidKey).toBe(PLAN_SAID_APT)
		}
		expect(errorView({ code: 'sandbox_update_failed', detail: Array.from({ length: 20 }, (_, i) => `W: ${i}`).join('\n') }).detail).toHaveLength(6)
	})

	it('gives nothing as apt\'s when apt wrote no line, only the core\'s own sentence of it', () => {
		expect(errorView({ code: 'sandbox_update_failed', detail: 'apt-get update ended with status 100' }).detail).toEqual([])
		expect(errorView({ code: 'sandbox_solver_failed', detail: 'apt-get -s ended with status 100' }).detail).toEqual([])
	})

	it('gives the lines of the other codes by none: they say it in their own words, and the reason of a plan that was not understood is the core\'s', () => {
		const detail = 'E: apt said this\nW: and this'
		for (const code of ['plan_unparsed', 'timeout', 'busy', 'sources_format', 'no_room', 'canceled', 'internal'])
			expect(errorView({ code, detail }).detail, code).toEqual([])
	})

	it('says when a job ended, for the window that did not follow it', () => {
		const status = readStatus({ plannable: true, state: 'failed', finished_at: '2026-10-11T08:15:00Z', error: { code: 'timeout' } }, 'en_us')
		expect(status.error.finishedAt).toMatch(/Oct 11, 2026/)
		expect(readStatus({ plannable: true, state: 'failed', error: { code: 'timeout' } }).error.finishedAt).toBe('')
		expect(readStatus({ plannable: true, state: 'failed', finished_at: 'yesterday', error: { code: 'timeout' } }).error.finishedAt).toBe('')
		// a job that is done with no plan to read is a failure too, and ended the same day
		expect(readStatus({ plannable: true, state: 'done', finished_at: '2026-10-11T08:15:00Z', plan: 'p' }).error.finishedAt).toMatch(/Oct 11, 2026/)
		// a refusal of the request is of now: no time
		expect(startRefusal({ response: { status: 409, data: { data: { error_code: 'busy', data: {} } } } }).finishedAt).toBe('')
	})

	it('says a code it does not know by the code, with the core\'s lines under the core\'s name, and says nothing of what is not an error', () => {
		const unknown = errorView({ code: 'from_the_future', detail: 'the core\'s words' })
		expect(sayEnglish(unknown.sentence)).toBe('The plan could not be made (from_the_future).')
		expect(unknown.detail).toEqual(['the core\'s words'])
		expect(unknown.saidKey).toBe(PLAN_SAID_CORE)
		for (const raw of [null, undefined, 'x', 3, [], {}, { code: 7 }]) {
			expect(sayEnglish(errorView(raw).sentence)).toBe('The plan could not be made.')
			expect(errorView(raw).detail).toEqual([])
		}
		expect(sayEnglish(errorView({ code: 'toString' }).sentence)).toBe('The plan could not be made (toString).')
	})
})

// A failure of the update, of the solver or of the reading of what apt said can be a proxy that the sandbox did not get: the core names the files of
// apt's configuration it left out in the data of those three failures, as it does in the plan
describe('the files of apt\'s configuration that a failure says were left out', () => {
	const CODES = ['sandbox_update_failed', 'sandbox_solver_failed', 'plan_unparsed']
	const files = CONF_REASONS.map(reason => ({ file: `${reason}.conf`, reason }))
	const listed = view => view.confLeftOut.map(item => [item.file, item.reasonKey])

	it.each(CODES)('lists them, each with the sentence of its reason, for %s', (code) => {
		const view = errorView({ code, data: { apt_conf_left_out: [...files, { file: 'x', reason: 'from-the-future' }, { file: 'y', reason: 'toString' }, { file: 'z' }, { reason: 'too_large' }, 'w', null] } })

		expect(listed(view)).toEqual([
			...CONF_REASONS.map(reason => [`${reason}.conf`, PLAN_CONF_REASONS[reason]]),
			['x', PLAN_CONF_REASON_UNKNOWN],
			['y', PLAN_CONF_REASON_UNKNOWN],
			['z', PLAN_CONF_REASON_UNKNOWN],
		])
		expect(view.confCut).toBe(false)
	})

	// the core says them for those three and no other: the sentence of another failure is not made to look like a proxy that was left out
	it.each(['timeout', 'canceled', 'internal', 'busy', 'no_room', 'sources_format', 'sources_mixed_file', 'not_root', 'from_the_future', 'toString', '', undefined])('lists none for %s, whatever the data says', (code) => {
		expect(errorView({ code, data: { apt_conf_left_out: files, apt_conf_left_out_truncated: true } }).confLeftOut).toEqual([])
		expect(errorView({ code, data: { apt_conf_left_out: files, apt_conf_left_out_truncated: true } }).confCut).toBe(false)
	})

	it('says the list is cut only when the core says it is, and has none to say it of when there is no list', () => {
		for (const code of CODES) {
			expect(errorView({ code, data: { apt_conf_left_out: files, apt_conf_left_out_truncated: true } }).confCut).toBe(true)
			for (const cut of [false, 'true', 1, 'yes', null, {}, []])
				expect(errorView({ code, data: { apt_conf_left_out: files, apt_conf_left_out_truncated: cut } }).confCut, JSON.stringify(cut)).toBe(false)
			// a cut with nothing to cut: there is no list to say it under
			expect(errorView({ code, data: { apt_conf_left_out_truncated: true } })).toMatchObject({ confLeftOut: [], confCut: false })
		}
	})

	it('has none when the core has none, and reads one that is not a list as none', () => {
		for (const data of [{}, { kind: 'network' }, { apt_conf_left_out: [] }, { apt_conf_left_out: 'x' }, { apt_conf_left_out: { a: 1 } }, { apt_conf_left_out: null }, { apt_conf_left_out: ['15update-stamp'] }, 'x', null, []])
			expect(errorView({ code: 'sandbox_update_failed', data }).confLeftOut, JSON.stringify(data)).toEqual([])
		expect(errorView({ code: 'sandbox_update_failed' }).confLeftOut).toEqual([])
	})

	it('reads at most 200, as the core keeps at most 200, and says that the list is cut when it had to cut it', () => {
		const many = Array.from({ length: 450 }, (_, index) => ({ file: `f${index}`, reason: 'not_simple' }))
		const view = errorView({ code: 'sandbox_update_failed', data: { apt_conf_left_out: many } })
		expect(view.confLeftOut).toHaveLength(200)
		expect(view.confCut).toBe(true)
		expect(errorView({ code: 'sandbox_update_failed', data: { apt_conf_left_out: many.slice(0, 200) } }).confCut).toBe(false)
	})

	it('says a name from the machine as text, cut and clean', () => {
		const hostile = '<img src=x onerror=alert(1)>'
		const view = errorView({ code: 'sandbox_update_failed', data: { apt_conf_left_out: [{ file: `${hostile}\n\u0000b\u202E${'c'.repeat(200)}`, reason: 'not_simple' }] } })

		expect(view.confLeftOut[0].file).toHaveLength(120)
		expect(view.confLeftOut[0].file.startsWith(`${hostile}  b `)).toBe(true)
		expect(unsafeIn(view.confLeftOut[0].file)).toEqual([])
	})

	it('reads the answers of the core: a failed update with the files and the one of a box that has none left out, the solver, and a package dpkg left half done', () => {
		const update = readStatus(core.status_failed_update)
		expect(update.state).toBe('failed')
		expect(update.error.code).toBe('sandbox_update_failed')
		expect(sayEnglish(update.error.sentence)).toBe('apt could not reach a package source: check the network and the name server of the machine.')
		expect(listed(update.error)).toEqual([
			['01autoremove', PLAN_CONF_REASONS.not_simple],
			['15update-stamp', PLAN_CONF_REASONS.not_simple],
			['20auto-upgrades', PLAN_CONF_REASONS.not_allowed_setting],
			['80link', PLAN_CONF_REASONS.not_regular],
			['96osp:gpgv', PLAN_CONF_REASONS.not_allowed_setting],
			['97big', PLAN_CONF_REASONS.too_large],
			['98osp-canary-detect', PLAN_CONF_REASONS.proxy_auto_detect],
			['98osp-canary-incl', PLAN_CONF_REASONS.has_directive],
		])
		expect(update.error.confCut).toBe(false)
		// the lines apt wrote are still said, as apt's: the proxy of the box refused the connection, and the line that tells why is apt's own words
		expect(update.error.detail).toEqual([
			'Err:1 http://deb.debian.org bookworm InRelease',
			'E: Failed to fetch http://deb.debian.org  Could not connect to 127.0.0.1:9 (127.0.0.1). - connect (111: Connection refused)',
			'E: Some index files failed to download. They have been ignored, or old ones used instead.',
		])

		const many = readStatus(core.status_failed_update_many)
		expect(many.error.confLeftOut).toHaveLength(200)
		expect(many.error.confCut).toBe(true)

		const clean = readStatus(core.status_failed_update_clean)
		expect(clean.error.code).toBe('sandbox_update_failed')
		expect(clean.error.confLeftOut).toEqual([])
		expect(clean.error.confCut).toBe(false)

		const solver = readStatus(core.status_failed_solver)
		expect(solver.error.code).toBe('sandbox_solver_failed')
		expect(solver.error.confLeftOut).toHaveLength(8)

		// dpkg left a package half done: the sentence is of dpkg, and the files left out are still the core's word
		const half = readStatus(core.status_failed_half_configured)
		expect(half.error.code).toBe('plan_unparsed')
		expect(sayEnglish(half.error.sentence)).toBe('A package on this machine is half installed or half configured, so there is no plan until it is mended. Run dpkg --configure -a in a console, then make the plan again.')
		expect(half.error.confLeftOut).toHaveLength(8)
		expect(readStatus(core.status_failed_half_configured_clean).error.confLeftOut).toEqual([])
	})
})

describe('a call that failed', () => {
	const refused = (error_code, data) => ({ response: { status: 409, data: { success: 409, message: 'x', data: { error_code, error: 'x', data } } } })

	it('reads a 409 for its code and its data, and nothing else', () => {
		expect(refusalOf(refused('busy', { unknown: true }))).toEqual({ code: 'busy', data: { unknown: true } })
		expect(refusalOf(refused('busy'))).toEqual({ code: 'busy', data: {} })
		expect(refusalOf({ response: { status: 500, data: { data: { error_code: 'busy' } } } })).toBe(null)
		expect(refusalOf({ response: { status: 409, data: { data: 'busy' } } })).toBe(null)
		expect(refusalOf({ response: { status: 409, data: { data: { error_code: 7 } } } })).toBe(null)
		expect(refusalOf({ response: { status: 409 } })).toBe(null)
		expect(refusalOf(undefined)).toBe(null)
	})

	it('says why a request that was refused was, by the code', () => {
		expect(sayEnglish(startRefusal(refused('no_room', { path: '/var/tmp', need: 671088640, free: 1048576 })).sentence)).toContain('640 MiB needed, 1 MiB free')
		expect(startRefusal({ response: { status: 500 } })).toBe(null)
	})

	it.each([
		[{ response: { status: 404 } }, PLAN_CALL_ERRORS.unavailable],
		[{ code: 'ECONNABORTED' }, PLAN_CALL_ERRORS.timeout],
		[{ code: 'ETIMEDOUT' }, PLAN_CALL_ERRORS.timeout],
		[{ response: { status: 500 } }, PLAN_CALL_ERRORS.failed],
		[{}, PLAN_CALL_ERRORS.failed],
		[undefined, PLAN_CALL_ERRORS.failed],
	])('says %j as a call that failed', (error, key) => {
		expect(callFailure(error)).toBe(key)
	})

	it('says why the runbook is not given, by the code and the reason of the core', () => {
		const said = error => sayEnglish(runbookFailure(error))
		expect(said(refused('no_plan', { reason: 'blocked' }))).toBe('The plan is blocked, so it has no runbook.')
		expect(said(refused('no_plan', { reason: 'expired' }))).toBe('The plan has expired. Make a new one.')
		expect(said(refused('no_plan', { reason: 'idle' }))).toBe('There is no plan to write it from. Make the plan first.')
		expect(said(refused('no_plan', { reason: 'running' }))).toBe('A plan is being made: wait for it to end.')
		expect(said(refused('no_plan', { reason: 'failed' }))).toBe('The last plan failed. Make it again.')
		expect(said(refused('no_plan', { reason: 'unavailable' }))).toBe('There is no plan to write the runbook from. Make the plan again.')
		expect(said(refused('no_runbook', { reason: 'runbook_unsafe' }))).toContain('could not be written safely')
		expect(said(refused('no_runbook', { reason: 'runbook_too_large' }))).toContain('too large')
		expect(said(refused('no_runbook'))).toBe('The runbook could not be written.')
		// a refusal it does not know, and a call that did not get there
		expect(said(refused('from_the_future'))).toBe(PLAN_CALL_ERRORS.failed)
		expect(said({ response: { status: 404 } })).toBe(PLAN_CALL_ERRORS.unavailable)
	})

	// a text that cannot be written for this plan will not be written by asking again: the button is the one that makes the plan again
	it('says which button a failure of the runbook has: none for a text that cannot be written, and one that looks at the plan again for another plan\'s', () => {
		const button = error => runbookFailure(error).button
		for (const reason of ['runbook_unsafe', 'runbook_too_large', 'from-the-future', undefined])
			expect(button(refused('no_runbook', { reason })), String(reason)).toBe('none')
		expect(button(refused('no_runbook'))).toBe('none')
		// what may pass by asking again
		for (const reason of ['idle', 'running', 'failed', 'expired', 'blocked', 'unavailable'])
			expect(button(refused('no_plan', { reason })), reason).toBe('retry')
		for (const error of [{ code: 'ECONNABORTED' }, { code: 'ETIMEDOUT' }, { response: { status: 404 } }, { response: { status: 500 } }, {}, undefined, refused('from_the_future')])
			expect(button(error), JSON.stringify(error)).toBe('retry')
		// the two that the window itself finds: a text that is not one, and the text of another plan
		expect(RUNBOOK_UNREADABLE_FAILURE).toEqual({ key: PLAN_RUNBOOK_UNREADABLE, params: {}, button: 'retry' })
		expect(RUNBOOK_OTHER_FAILURE).toEqual({ key: PLAN_RUNBOOK_OTHER, params: {}, button: 'look' })
	})

	it('says what to do when the text is too large to hand out, and what when it could not be written safely', () => {
		const said = error => sayEnglish(runbookFailure(error))
		expect(said(refused('no_runbook', { reason: 'runbook_too_large' }))).toBe('The text would be too large to hand out: shorten the comments in your package sources and the number of third-party source files, then make the plan again. Nothing was written.')
		expect(said(refused('no_runbook', { reason: 'runbook_unsafe' }))).toBe('The text could not be written safely: a line of your package sources holds what ends a block of it. Nothing was written.')
	})
})

describe('the runbook', () => {
	const ID = 'p1-5787acb2f81006785a3076312615ae6c'
	const answer = { plan_id: ID, hop: 'debian-11-12', text: '#!/bin/sh\necho hi\n', blocks: [{ id: 'verify', title: 'check that this is the machine of the plan', reboot: false, point_of_no_return: false }, { id: 'minimal', title: '<b>THE POINT OF NO RETURN</b>\n', reboot: false, point_of_no_return: true }, { id: 'prereboot', title: 'restart', reboot: true, point_of_no_return: false }, 7] }

	it('has its text, its blocks, and a file name from its id', () => {
		const view = runbookView(answer)
		expect(view.text).toBe(answer.text)
		expect(view.planId).toBe(ID)
		expect(view.fileName).toBe(`casaos-os-upgrade-${ID}.sh`)
		expect(view.blocks).toEqual([
			{ id: 'verify', number: 0, title: 'check that this is the machine of the plan', reboot: false, pointOfNoReturn: false },
			{ id: 'minimal', number: 1, title: '<b>THE POINT OF NO RETURN</b>', reboot: false, pointOfNoReturn: true },
			{ id: 'prereboot', number: 2, title: 'restart', reboot: true, pointOfNoReturn: false },
		])
	})

	// the text of the runbook counts its blocks from 0 (BLOCK 0 to BLOCK 8): the number is the place in the core's list, which a block
	// that is not one does not move
	it('numbers the blocks from 0, as the core lists them, whatever is between them', () => {
		expect(runbookView({ text: 'x', blocks: ['a', { id: 'a' }, null, { id: 'b' }, 4, { id: 'c' }] }).blocks.map(block => [block.id, block.number])).toEqual([['a', 1], ['b', 3], ['c', 5]])
		expect(runbookView({ text: 'x', blocks: [{}, { id: '' }] }).blocks.map(block => [block.id, block.number])).toEqual([['0', 0], ['1', 1]])
	})

	// the flags are the core's `true` and nothing else
	it('says a block is a restart or the point of no return only when the core said true', () => {
		const blocks = runbookView({ text: 'x', blocks: [{ id: 'a', reboot: 'yes', point_of_no_return: 1 }, { id: 'b', reboot: 1, point_of_no_return: 'true' }, { id: 'c', reboot: true, point_of_no_return: true }] }).blocks
		expect(blocks.map(block => [block.reboot, block.pointOfNoReturn])).toEqual([[false, false], [false, false], [true, true]])
	})

	it('names a file after the id only when the id is the core\'s form: it comes from the machine and a file name is a path', () => {
		for (const bad of ['../../etc/x', `${ID}.sh; rm`, 'p1-xyz', '', 7, null, `${ID}\n`]) {
			expect(runbookFileName(bad)).toBe('casaos-os-upgrade.sh')
			expect(runbookView({ ...answer, plan_id: bad }).fileName).toBe('casaos-os-upgrade.sh')
			expect(runbookView({ ...answer, plan_id: bad }).planId).toBe('')
		}
		expect(runbookFileName(ID)).toBe(`casaos-os-upgrade-${ID}.sh`)
	})

	it('is not read from an answer that has no text, or too much', () => {
		for (const data of [null, undefined, 'text', [], {}, { text: '' }, { text: 7 }, { text: 'x'.repeat(262145) }])
			expect(runbookView(data)).toBe(null)
		expect(runbookView({ text: 'x'.repeat(262144) }).text).toHaveLength(262144)
		expect(runbookView({ text: 'x', blocks: 'b' }).blocks).toEqual([])
	})

	// the answer of GET /v1/sys/os/upgrade/runbook that the core wrote for the plan of the real box
	describe('the core\'s own answer', () => {
		const view = runbookView(runbookAnswer)
		const marks = [...runbookAnswer.text.matchAll(/^# >>> BLOCK (\d+) (\S+)$/gm)].map(match => [Number(match[1]), match[2]])

		it('is for the plan of the real box, and is taken whole, named after the plan', () => {
			expect(runbookAnswer.plan_id).toBe(real.plan_id)
			expect(runbookAnswer.hop).toBe(real.hop)
			expect(view.planId).toBe(real.plan_id)
			expect(view.fileName).toBe(`casaos-os-upgrade-${real.plan_id}.sh`)
			expect(view.text).toBe(runbookAnswer.text)
			expect(runbookAnswer.text.startsWith('#!/bin/sh\n')).toBe(true)
		})

		it('lists the blocks of the text, in its order, with the numbers that the text gives them: from 0', () => {
			expect(marks.map(([number]) => number)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
			expect(view.blocks.map(block => [block.number, block.id])).toEqual(marks)
			expect([...runbookAnswer.text.matchAll(/^# <<< END BLOCK (\d+)$/gm)].map(match => Number(match[1]))).toEqual(marks.map(([number]) => number))
			expect(view.blocks.map(block => block.title)).toEqual(runbookAnswer.blocks.map(block => block.title))
			expect(view.blocks.every(block => block.title)).toBe(true)
		})

		it('says the restart after the one block that asks for it, and the point of no return at the one that is it', () => {
			expect(view.blocks.filter(block => block.reboot).map(block => [block.number, block.id])).toEqual([[7, 'prereboot']])
			expect(view.blocks.filter(block => block.pointOfNoReturn).map(block => [block.number, block.id])).toEqual([[5, 'minimal']])
			expect(view.blocks[3]).toMatchObject({ id: 'sources', number: 3 })
		})
	})
})

describe('the plan as text', () => {
	const text = planText(real)

	it('says the plan in English, in sections, from the data', () => {
		expect(text).toContain('ReCasaOS upgrade plan\nplan: p1-5787acb2f81006785a3076312615ae6c\nhop: debian-11-12\nmade: 2026-10-12T09:30:00Z   expires: 2026-10-13T09:30:00Z\nverdict: needs_acceptance')
		expect(text).toContain('Findings (1)\n- [needs_acceptance] removal_manual: The upgrade would remove fuse (2.9.9-5)')
		expect(text).toContain('- sources.list (rewritten)\n    line 1: deb http://deb.debian.org/debian bullseye main -> deb http://deb.debian.org/debian bookworm main (release name)')
		expect(text).toContain('line 3: deb http://archive.debian.org/debian-security bullseye-security main -> deb http://deb.debian.org/debian-security bookworm-security main (release name, address)')
		expect(text).toContain('- docker.list (paused)')
		expect(text).toContain('Docker\'s source, put aside for the upgrade: docker.list')
		expect(text).toContain('full upgrade: upgraded 384, new 75, removed 2, kept back 0')
		expect(text).toContain('first, minimal upgrade: upgraded 274, new 0, removed 0, kept back 111')
		expect(text).toContain('removed: fuse 2.9.9-5 [by hand]\nremoved: libsemanage1 3.1-1+b2\n')
		expect(text).toContain('new (75): cron-daemon-common, dbus-bin')
		expect(text).toContain('no longer needed (18): libbpf0')
		expect(text).toContain('download: 133 MiB\nextra space: 286 MiB\n/var/cache/apt/archives: needs 659 MiB, free 8 GiB\n/usr: needs 1.5 GiB, free 8 GiB\n/: needs 512 MiB, free 20 GiB')
		expect(text).toContain('Left out of apt\'s configuration for this plan (it reads only plain network and recommended-package settings)\n- 15update-stamp: It is not made of simple settings, one to a line.')
	})

	it('says each file of apt\'s configuration that was left out with its reason, and says nothing when none was', () => {
		const left = planText(plan({ apt_conf_left_out: [{ file: 'a.conf', reason: 'has_directive' }, { file: 'b.conf', reason: 'from-the-future' }] }))
		expect(left).toContain('- a.conf: It has a directive of apt\'s configuration language, such as #include or #clear.\n- b.conf: It was left out for a reason this window does not know.')
		expect(planText(plan({ apt_conf_left_out: [] }))).not.toContain('Left out of apt')
	})

	it('is the same in English whatever the language of the window, and is not the runbook', () => {
		expect(text).not.toContain('#!/bin/sh')
		expect(text).not.toContain('<<')
	})

	it('has no secret in it, whatever the core sent, and no control character', () => {
		const leaky = planText(plan({ sources: { files: [{ file: 'a.list\u0000', action: 'rewritten', lines: [{ n: 1, before: 'deb https://user:s3cret@h.example/d?key=abc bullseye main', after: 'deb https://user:s3cret@h.example/d?key=abc bookworm main', why: 'suite' }] }] }, problems: [problem('removal_manual', { name: 'x\ny' })] }))
		expect(leaky).not.toMatch(/s3cret|key=abc/)
		expect(leaky).toContain('https://***@h.example/d?***')
		expect(unsafeIn(leaky)).toEqual([])
	})

	it('is bounded, and says it was cut', () => {
		const lines = Array.from({ length: 150 }, (_, index) => ({ n: index + 1, before: 'a'.repeat(300), after: 'b'.repeat(300), why: 'suite' }))
		const files = Array.from({ length: 20 }, (_, index) => ({ file: `f${index}.list`, action: 'rewritten', lines }))
		const big = planText(plan({ sources: { files } }))
		expect(big.length).toBeLessThanOrEqual(24000 + 8)
		expect(big.endsWith('\n[cut]')).toBe(true)
		// a list of names is cut too
		const names = Array.from({ length: 600 }, (_, index) => `pkg${index}`)
		const listed = planText(plan({ new_packages: names, new_truncated: true }))
		expect(listed).toContain('new (600 or more): pkg0, pkg1')
		expect(listed).toContain('pkg59, ...')
		expect(listed).not.toContain('pkg60,')
	})

	it('says the disk as unknown when apt did not say how much, and a room that was not read', () => {
		const unknown = planText(plan({ estimates: { known: false }, disk: [] }))
		expect(unknown).toContain('apt did not say how much it would download, so the disk space is not checked.')
		expect(unknown).not.toContain('\ndownload: ')
		expect(planText(plan({ disk: [{ path: '/', need: 1048576, free: 0, ok: false, unknown: true }] }))).toContain('/: needs 1 MiB, free (not read) SHORT')
	})
})

// The bounds and the flags of what the machine says: each is a line of osPlan.js that a wrong number or a looser test would leave in place.
describe('the bounds of what the machine says, and what only `true` is', () => {
	// the C0 controls (0 to 31) and the C1 controls (127 to 159), and the marks that turn a text round (0x202A to 0x202E, 0x2066 to 0x2069):
	// the first and the last of each range, and the characters beside them, which stay
	it('replaces each control, at the edge of its range and inside, and no character beside them', () => {
		const names = codes => planView(plan({ removals: codes.map(code => ({ name: `a${String.fromCharCode(code)}b`, version: '1' })) })).removals.map(removal => removal.name)

		expect(names([0, 9, 10, 31, 127, 128, 133, 159, 0x202A, 0x202C, 0x202E, 0x2066, 0x2069])).toEqual(Array.from({ length: 13 }, () => 'a b'))
		expect(names([126, 160, 0x2029, 0x202F, 0x2065, 0x206A, 0xFEFF])).toEqual([126, 160, 0x2029, 0x202F, 0x2065, 0x206A, 0xFEFF].map(code => `a${String.fromCharCode(code)}b`))
	})

	it('puts a C1 control of a name in a sentence, a line of the sources and a file name as a space', () => {
		const c1 = '\u0085\u009F'
		const view = planView(plan({
			problems: [problem('removal_manual', { name: `x${c1}y`, version: '1' })],
			sources: { files: [{ file: `f${c1}.list`, action: 'rewritten', lines: [{ n: 1, before: `a${c1}b`, after: `c${c1}d`, why: 'suite' }] }] },
		}))

		expect(sayEnglish(view.problems[0].sentence)).toContain('remove x  y (1)')
		expect(view.sources.files[0].file).toBe('f  .list')
		expect(view.sources.files[0].lines[0]).toMatchObject({ before: 'a  b', after: 'c  d' })
	})

	// sizes: both of them, or none
	it.each([
		['only the download', { known: true, download_bytes: 1048576 }],
		['only the extra space', { known: true, extra_bytes: 1048576 }],
		['a size that is a word', { known: true, download_bytes: '1048576', extra_bytes: 1048576 }],
		['both sizes, and known as a word', { known: 'true', download_bytes: 1048576, extra_bytes: 1048576 }],
		['both sizes, and not said to be known', { download_bytes: 1048576, extra_bytes: 1048576 }],
	])('does not read the sizes for %s', (_, estimates) => {
		expect(planView(plan({ estimates })).estimates).toEqual({ known: false, download: '', extra: '', freed: false })
	})

	it('says 0 extra bytes as using none, and not as freeing some', () => {
		expect(planView(plan({ estimates: { known: true, download_bytes: 1048576, extra_bytes: 0 } })).estimates).toEqual({ known: true, download: '1 MiB', extra: '0 MiB', freed: false })
		expect(planView(plan({ estimates: { known: true, download_bytes: 1048576, extra_bytes: -1 } })).estimates.freed).toBe(true)
	})

	// a list of names in a sentence is the first 20, and a name is cut at 80
	it('says at most 20 names in a sentence, and says there are more', () => {
		const names = count => Array.from({ length: count }, (_, index) => `n${index}`)
		const said = count => english('dist_kept_back', { names: names(count) })

		expect(said(20)).toContain(`${names(20).join(', ')}. apt does not`)
		expect(said(21)).toContain(`${names(20).join(', ')}, …. apt does not`)
		expect(said(21)).not.toContain('n20')
		expect(said(200)).not.toContain('n20')
		expect(english('dist_kept_back', { names: ['x'.repeat(100)] })).toContain(`now: ${'x'.repeat(80)}. apt does not`)
	})

	// what the window says of a code it does not know: at most 6 of the core's fields, each at most 200 characters, a name of a field in the form it can have
	it('says at most 6 fields of a problem it does not know, each cut at 200 characters, and only those named in the core\'s form', () => {
		const data = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`f${index}`, index]))
		const view = planView(plan({ problems: [{ code: 'from_the_future', severity: 'blocked', data }, { code: 'other_future', severity: 'blocked', data: { names: [`${'x'.repeat(100)}`, 'y'.repeat(100), 'z'.repeat(100)], [`a${'b'.repeat(40)}`]: 'kept', [`a${'b'.repeat(41)}`]: 'dropped' } }] }))

		expect(view.problems[0].details.map(detail => detail.name)).toEqual(['f0', 'f1', 'f2', 'f3', 'f4', 'f5'])
		expect(view.problems[1].details.map(detail => detail.name)).toEqual(['names', `a${'b'.repeat(40)}`])
		expect(view.problems[1].details[0].value).toHaveLength(200)
	})

	it('lists at most 200 files of apt\'s configuration, and 60 lines of a file', () => {
		const files = Array.from({ length: 250 }, (_, index) => ({ file: `f${index}.conf`, reason: 'too_large' }))

		expect(planView(plan({ apt_conf_left_out: files })).confLeftOut).toHaveLength(200)
		expect(planView(plan({ apt_conf_left_out: files.slice(0, 200) })).confLeftOut).toHaveLength(200)
	})

	// a count is a whole number from 0, a line number a whole number from 1
	it('reads a count only when it is a whole number from 0', () => {
		const counts = changes => planView(plan({ counts: { dist_upgrade: changes, upgrade: {} } })).counts.full

		expect(counts({ upgraded: -1, new: 1.5, removed: '3', kept_back: null })).toEqual({ upgraded: null, new: null, removed: null, keptBack: null })
		expect(counts({ upgraded: 0, new: 1, removed: 2, kept_back: 3 })).toEqual({ upgraded: 0, new: 1, removed: 2, keptBack: 3 })
		const sources = changes => planView(plan({ sources: { files: [], ...changes } })).sources
		expect([sources({ dropped_backports: -1, firmware_added: 2.5 }).dropped, sources({ dropped_backports: -1, firmware_added: 2.5 }).firmware]).toEqual([0, 0])
		expect([sources({ dropped_backports: 3, firmware_added: 0 }).dropped, sources({ dropped_backports: 3, firmware_added: 4 }).firmware]).toEqual([3, 4])
	})

	it('numbers a line of the sources, and says where a source is refused, only by a whole number from 1', () => {
		const lines = [1.5, -1, 0, '3', null, 2].map(n => ({ n, before: 'a', after: 'b', why: 'suite' }))
		expect(planView(plan({ sources: { files: [{ file: 'x.list', action: 'rewritten', lines }] } })).sources.files[0].lines.map(line => line.n)).toEqual([0, 0, 0, 0, 0, 2])

		const paused = [2.5, -1, 0, '4', 5].map((line, index) => ({ file: `f${index}.list`, line, hosts: [], docker: false }))
		expect(planView(plan({ paused })).sources.otherPaused).toBe('f0.list, f1.list, f2.list, f3.list, f4.list:5')

		for (const line of [3.5, -1, 0, '3'])
			expect(errorView({ code: 'sources_format', data: { file: 'x.list', line, reason: 'type' } }).place).toEqual({ key: 'File {file}', params: { file: 'x.list' } })
		expect(errorView({ code: 'sources_format', data: { file: 'x.list', line: 3, reason: 'type' } }).place.params.line).toBe('3')
	})

	it('says a file that is put aside as Docker\'s only when the core said true', () => {
		const view = planView(plan({ paused: [{ file: 'a.list', docker: 'yes' }, { file: 'b.list', docker: 1 }, { file: 'c.list', docker: true }, { file: 'd.list' }] }))

		expect(view.sources.dockerFiles).toBe('c.list')
		expect(view.sources.otherPaused).toBe('a.list, b.list, d.list')
	})
})

// An address has its user and its query hidden BEFORE the text is cut for the screen: a cut that goes through a password would otherwise
// leave the half of it with nothing to hide it (the core masks before it cuts, but this window says it of whatever the core sent).
describe('the secrets that a cut would go through', () => {
	// a line of `length` characters that is made of words, to put an address where the cut will go through it
	const words = length => `deb ${'y '.repeat((length - 4) / 2)}`
	const sourcesLine = (before, after = '') => planView(plan({ sources: { files: [{ file: 'a.list', action: 'rewritten', lines: [{ n: 1, before, after, why: 'suite' }] }] } })).sources.files[0].lines[0]

	it('hides the password of an address that the cut of a line of the sources goes through, in both forms of the line', () => {
		// the address begins at 384: `https://` to 392, `user:` to 397, the password from 397: the cut at 400 is in it
		const line = `${words(384)}https://user:s3cretpass@host.example/debian main`
		expect(line.indexOf('s3cretpass')).toBe(397)
		const shown = sourcesLine(line, line)

		for (const text of [shown.before, shown.after]) {
			expect(text).not.toMatch(/s3c|user:/)
			expect(text).toContain('https://***@')
			expect(text).toHaveLength(400)
		}
	})

	it('hides the password of an address in a line of what apt said that the cut goes through', () => {
		// 200 for a line of apt's: the password begins at 195
		const apt = `W: ${'y '.repeat(90)}http://user:s3cretpass@deb.debian.org/debian`
		expect(apt.slice(0, 200)).toContain('s3cre')
		const said = errorView({ code: 'sandbox_update_failed', detail: `${apt}\nE: x` }).detail
		expect(said).toHaveLength(2)
		expect(said.join('\n')).not.toMatch(/s3c|user:/)
		expect(said[0]).toContain('http://***@')
	})

	// beyond what is looked at (2048 characters) the cut goes first, and the word that it goes through goes with it
	it('drops the word that the first cut of a very long line goes through, which may be half an address', () => {
		// a query that is hidden whole makes the line short again, so what comes after it is shown: the address begins at 2030
		const line = `deb http://a.example/?${'q'.repeat(2007)} https://user:s3cretpass@host.example/debian main`
		expect(line.slice(0, 2048)).toMatch(/ https:\/\/user:s3cre$/)
		const shown = sourcesLine(line).before

		expect(shown).not.toMatch(/s3c|user/)
		expect(shown).toMatch(/^deb http:\/\/a\.example\/\?\*\*\*/)
	})

	it('drops what is one word and longer than what is looked at, rather than show a half of it', () => {
		expect(sourcesLine('z'.repeat(5000)).before).toBe('')
		expect(sourcesLine('z'.repeat(2048)).before).toHaveLength(400)
	})

	it('gives up the last line of what apt said when the cut of the whole text goes through it', () => {
		// 596 lines of 5 characters, then `W: https://user:`: the password begins at 2996, and the cut at 3000 is in it
		const detail = `${'W: x\n'.repeat(596)}W: https://user:s3cretpass@host.example/debian`
		expect(detail.slice(0, 3000)).toMatch(/user:s3cr$/)

		const said = errorView({ code: 'sandbox_update_failed', detail }).detail
		expect(said.join('\n')).not.toMatch(/s3c|user:/)
		expect(said).toEqual(Array.from({ length: 6 }, () => 'W: x'))
		// a text that is not cut keeps its last line
		expect(errorView({ code: 'sandbox_update_failed', detail: 'W: x\nW: https://user:s3cretpass@host.example/debian' }).detail).toEqual(['W: x', 'W: https://***@host.example/debian'])
	})

	// scrub alone takes half a minute on a text of this kind and size: its time grows with the square of the text
	it('reads a text that is hundreds of thousands of characters long in no time', () => {
		const hostile = 'a.'.repeat(150000)
		const started = performance.now()
		const view = planView(plan({ sources: { files: [{ file: 'a.list', action: 'rewritten', lines: [{ n: 1, before: `deb ${hostile}`, after: `deb ${'http://'.repeat(40000)}`, why: 'suite' }] }] } }))
		const said = errorView({ code: 'sandbox_update_failed', detail: `W: ${hostile}` })

		expect(performance.now() - started).toBeLessThan(2000)
		expect(view.sources.files[0].lines[0].before).toBe('deb')
		expect(said.detail).toEqual([])
	})
})
