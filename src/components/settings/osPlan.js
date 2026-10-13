/**
 * What the dashboard makes of the plan of the upgrade: GET /v1/sys/os/upgrade/plan (how the job is going,
 * and the plan when it is done) and GET /v1/sys/os/upgrade/runbook (the text with which to do the hop by hand).
 *
 * Texts are language-file keys, and the core's codes pick them: the dashboard never matches the core's English
 * words. A code it does not know is said as one it does not know, with the code and the core's data as text, and
 * never breaks the view. Every value that comes from the machine (package names, file names, the lines of the
 * sources) is shown as a text node, never as HTML, cut, with its control characters replaced, and with the user and
 * the query of an address hidden again.
 *
 * Fail closed, here as in the core: a verdict this window does not know is a blocked one, and the window never says
 * the plan found nothing in the way next to a blocking problem, whatever verdict the core sent.
 */

import { formatMoment, formatSize } from './osReadiness'

// Only the own properties of a table: a code named like an Object method is not one.
function own(table, key) {
	return typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined
}

const isPlain = value => value !== null && typeof value === 'object' && !Array.isArray(value)

// What a name or a line from the machine is shown as: the control characters and the ones that turn the text round are
// spaces, and it is cut. The ranges are the C0 and C1 controls (0 to 31, 127 to 159) and the marks that set the direction of a text
// (0x202A to 0x202E, 0x2066 to 0x2069), by their numbers: a mark of that kind is not to be written in a source file.
const UNSAFE = new RegExp(`[${[[0, 31], [127, 159], [0x202A, 0x202E], [0x2066, 0x2069]].map(range => range.map(code => String.fromCharCode(code)).join('-')).join('')}]`, 'g')
function clean(value, max = 300) {
	return typeof value === 'string' ? value.replace(UNSAFE, ' ').trim().slice(0, max) : ''
}

// The user and the query of an address are not shown, as the core does not show them: a line of the sources can have a
// password in it, and the window says the same of it again whatever the core sent.
export function scrub(line) {
	return line
		.replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/]*@/gi, '$1***@')
		.replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^\s?]*)\?\S*/gi, '$1?***')
}

// How much of a line is looked at for an address: scrub takes time that grows with the square of a text of this kind.
const SCRUBBED_WITHIN = 2048

// A text that may hold an address, as it is shown: the user and the query of an address are hidden BEFORE the text is cut (a secret
// that the cut went through would be shown in part, with nothing to hide it). A text that is longer than what is looked at is cut
// first, and the word the cut went through is dropped with it: an address is one word, so none is left in two halves.
function safe(value, max) {
	if (typeof value !== 'string')
		return ''
	return clean(scrub(value.length > SCRUBBED_WITHIN ? value.slice(0, SCRUBBED_WITHIN).replace(/\S*$/, '') : value), max)
}

// A line of a file of the sources, as it is shown (the core's own bound is 400).
const shown = value => safe(value, 400)

const MAX_NAMES = 20

function nameList(value) {
	const list = (Array.isArray(value) ? value : [value])
		.filter(name => typeof name === 'string' && clean(name))
		.map(name => clean(name, 80))
	return list.length > MAX_NAMES ? `${list.slice(0, MAX_NAMES).join(', ')}, …` : list.join(', ')
}

const count = value => Number.isInteger(value) && value >= 0 ? value : null
const sizeOf = (value, locale, up) => typeof value === 'number' ? formatSize(value, locale, up) : ''

// ---- the steps of the job -----------------------------------------------------------------------------------------

/** The phases of a job, in order (the core's names), with the sentence of each. */
export const PLAN_PHASES = [
	{ id: 'sources', key: 'Reading and rewriting the package sources' },
	{ id: 'update', key: 'Fetching the package lists of the next release' },
	{ id: 'upgrade', key: 'Planning the first, minimal upgrade' },
	{ id: 'dist-upgrade', key: 'Planning the full upgrade' },
	{ id: 'estimate', key: 'Estimating the download and the disk space' },
	{ id: 'parse', key: 'Reading what apt said' },
]

export const PLAN_PHASE_UNKNOWN = 'Working'
export const PLAN_STEP = 'Step {step} of {total}: {what}'

/** The step a phase is: its number, how many there are, its sentence; null for a phase this window does not know. */
export function phaseOf(phase) {
	const index = PLAN_PHASES.findIndex(entry => entry.id === phase)
	return index < 0 ? null : { step: index + 1, total: PLAN_PHASES.length, key: PLAN_PHASES[index].key }
}

// ---- the sentences ------------------------------------------------------------------------------------------------

// A sentence is a list of language-file keys (or a table of such lists by a field of the data): the first whose
// {placeholders} the core's data fills is the one said, and the last has none, so that a core that sent no data still
// gets its sentence (a test sees to it).

/** The problems of a plan, by code (the core's: pkg/osplan/plan.go). */
export const PLAN_PROBLEMS = {
	removal_protected: [
		'The upgrade would remove {name}, which ReCasaOS protects (it matches {pattern}). This blocks the upgrade.',
		'The upgrade would remove {name}, which ReCasaOS protects. This blocks the upgrade.',
		'The upgrade would remove a package that ReCasaOS protects. This blocks the upgrade.',
	],
	removal_essential: [
		'The upgrade would remove {name}, a package the system cannot work without. This blocks the upgrade.',
		'The upgrade would remove a package the system cannot work without. This blocks the upgrade.',
	],
	removal_manual: [
		'The upgrade would remove {name} ({version}), a package installed by hand, as far as ReCasaOS can tell. You would have to accept this.',
		'The upgrade would remove {name}, a package installed by hand, as far as ReCasaOS can tell. You would have to accept this.',
		'The upgrade would remove a package installed by hand, as far as ReCasaOS can tell. You would have to accept this.',
	],
	// What is true of every package of this finding: after the full upgrade it would still be at the version it has now. Some are counted by
	// apt as not upgraded (a package on hold whose version in the next release is older than the installed one: `unlisted` is how many of
	// those apt does not name), some are not counted at all (a package that the minimal upgrade keeps back and the full one lists nowhere):
	// so the sentences do not say that apt keeps them back, and say in one clause that apt does not always count them. The first has the
	// names and the number of the others, the second the number alone.
	dist_kept_back: [
		'After the full upgrade, these packages would still stay at the version they have now: {names}, and {unlisted} more that apt counts without naming. apt does not always count such packages as kept back. The upgrade would not be complete with them, so it is blocked.',
		'After the full upgrade, some packages would still stay at the version they have now, and apt counts them without naming them (how many: {unlisted}). A package on hold for which the next release has only an older version than the installed one is counted this way. The upgrade would not be complete with them, so it is blocked.',
		'After the full upgrade, these packages would still stay at the version they have now: {names}. apt does not always count such packages as kept back. The upgrade would not be complete with them, so it is blocked.',
		'After the full upgrade, some packages would still stay at the version they have now. The upgrade would not be complete with them, so it is blocked.',
	],
	// the second is for a room that could not be read (`unknown`): it never says how much is free
	disk_short: [
		'There is not enough room on {path}: {needed} needed, {free} free. This blocks the upgrade.',
		'The room that is free on {path} could not be read ({needed} needed). This blocks the upgrade.',
		'There is not enough room for the upgrade. This blocks the upgrade.',
	],
	downgrade: [
		'The upgrade would downgrade these packages, that is install older versions than the ones on this machine: {names}. The upgrade does not do that by itself. This blocks the upgrade.',
		'The upgrade would downgrade packages, that is install older versions than the ones on this machine. The upgrade does not do that by itself. This blocks the upgrade.',
	],
	docker_held: [
		'Docker\'s packages are on hold ({names}). That is expected: the upgrade leaves them alone, and Docker\'s package source is put aside while it runs.',
		'Docker\'s packages are on hold. That is expected: the upgrade leaves them alone, and Docker\'s package source is put aside while it runs.',
	],
}

export const PLAN_PROBLEM_UNKNOWN = 'Something this window does not know about the plan: {code}.'

/** How much a problem weighs, by the core's severity: the badge, and the colour. */
export const PLAN_SEVERITIES = {
	blocked: { key: 'Blocks the upgrade', tone: 'is-danger' },
	needs_acceptance: { key: 'Needs your acceptance', tone: 'is-warning' },
	info: { key: 'For information', tone: 'is-info' },
}

/** The sentence of each verdict. */
export const PLAN_VERDICTS = {
	ok: { key: 'The plan found nothing in the way.', tone: 'is-success' },
	needs_acceptance: { key: 'The plan found things you would have to accept first.', tone: 'is-warning' },
	blocked: { key: 'The plan found something that blocks the upgrade.', tone: 'is-danger' },
}

/** Why a package source is refused, by the core's reason. */
export const PLAN_SOURCE_REASONS = {
	encoding: 'The file is not valid UTF-8.',
	chars: 'The line has characters that apt does not read in a source.',
	control: 'The line has control characters.',
	crlf: 'The file has Windows line ends.',
	nul: 'The file has a NUL character.',
	long_line: 'The line is too long.',
	type: 'The line does not start with deb or deb-src.',
	options: 'The options between square brackets are not in a form the plan reads.',
	fields: 'The line lacks an address or a release name.',
	too_many: 'There are more sources or components than the plan reads.',
	uri: 'The address is not one the plan reads.',
	suite: 'The release name is not one the plan reads.',
	component: 'A component name is not one the plan reads.',
	trusted: 'The line turns off the check of the signatures of its source, and the plan says nothing of such a source.',
	// the core refuses it when it has not read the lists of a source that is not a known archive host: it says to run apt-get update first
	undecided: 'The plan could not tell whether this source is the distribution\'s own. Update the package lists first (apt-get update, or the System packages window), then make the plan again.',
	deb822: 'A .sources file (the deb822 form) is not read by this plan yet.',
	unreadable: 'The file could not be read.',
	no_distribution_line: 'No line of the distribution\'s own sources was found to plan against.',
	other: 'The line is not in a form the plan reads.',
}

/** Where a package source that is refused is: the file and, when the core says it, the line. */
export const PLAN_PLACES = [
	'File {file}, line {line}',
	'File {file}',
]
// the codes that say where
const WITH_PLACE = new Set(['sources_format', 'sources_alias', 'sources_target', 'sources_cdrom'])

/** What went wrong in the update of the package lists of the next release, by the core's kind. */
export const PLAN_UPDATE_KINDS = {
	no_pubkey: ['apt could not check the signature of a package source: its key is missing from this machine.'],
	not_found: ['A package source, or a file of it, was not found: a mirror may not have the next release, or its address is wrong.'],
	network: ['apt could not reach a package source: check the network and the name server of the machine.'],
	release_change: ['A package source changed its description of itself while apt was reading it. Try again later.'],
	other: ['apt could not update the package lists of the next release.'],
}

/** Why a plan could not be made, by the core's code (the job's error, and the 409 that refuses the request). */
export const PLAN_ERRORS = {
	not_root: ['ReCasaOS does not run as root on this machine, so it cannot plan the upgrade.'],
	hop_not_planned: ['ReCasaOS cannot plan the upgrade from this release yet.'],
	// `unknown`: the machine could not be asked who it is (a command that failed or took too long), which says nothing of whether
	// a plan can be made for it
	identity_unsupported: {
		by: 'unknown',
		variants: { true: ['The machine could not be asked just now whether a plan can be made for it, so no plan was made. Try again in a moment.'] },
		text: ['This machine is not one that a plan can be made for: it is not a release that ReCasaOS knows how to upgrade, or it has no later one.'],
	},
	busy: {
		by: 'unknown',
		variants: { true: ['Whether another package manager is at work on this machine could not be seen, so no plan was made. Try again in a moment.'] },
		text: ['Another package manager is at work on this machine. Wait for it to end, then try again.'],
	},
	no_room: [
		'There is not enough room in {path} for the plan\'s temporary folder: {needed} needed, {free} free. Free some space, then try again.',
		'There is not enough room in {path} for the plan\'s temporary folder: {needed} needed, and the room that is free could not be read. Free some space, then try again.',
		'There is not enough room for the plan\'s temporary folder. Free some space, then try again.',
	],
	sources_format: ['A package source is not in a form the plan reads.'],
	sources_alias: ['A package source names its release by an alias that moves with the archive: name the release in it, then try again.'],
	sources_target: ['A package source is already at the next release, or past it. If an earlier try of the upgrade by hand rewrote the sources, find the script that its runbook named, /var/backups/casaos-os-upgrade-*/restore-sources.sh (a folder for each plan), and run it with sh, or finish that upgrade. The script refuses once the upgrade of the packages has begun.'],
	sources_mixed_file: [
		'A file of package sources mixes the distribution\'s own lines with others: {file}. Split it in two, then try again.',
		'A file of package sources mixes the distribution\'s own lines with others. Split it in two, then try again.',
	],
	sources_cdrom: ['A package source is a disc or a local folder, which cannot be upgraded from.'],
	sandbox_update_failed: { by: 'kind', variants: PLAN_UPDATE_KINDS, text: PLAN_UPDATE_KINDS.other },
	sandbox_solver_failed: ['apt could not work out the upgrade.'],
	// `reason`: the core's word for what it did not understand; `not_fully_installed` is not an apt that was not understood but a dpkg
	// that left a package half done, which apt says after its summary and which the real upgrade refuses too
	plan_unparsed: {
		by: 'reason',
		variants: { not_fully_installed: ['A package on this machine is half installed or half configured, so there is no plan until it is mended. Run dpkg --configure -a in a console, then make the plan again.'] },
		text: ['ReCasaOS could not understand what apt said, so it makes no partial plan.'],
	},
	timeout: ['The plan took too long and was stopped. Nothing was changed on the machine. Try again.'],
	canceled: ['The plan was stopped because ReCasaOS was stopping. Try again.'],
	internal: ['The plan failed unexpectedly. Nothing was changed on the machine. Try again.'],
}

// An error that says no code, or one this window does not know
export const PLAN_ERROR_UNKNOWN = 'The plan could not be made ({code}).'
export const PLAN_ERROR_NONE = 'The plan could not be made.'
// the sentence that says in which step it stopped
export const PLAN_ERROR_STEP = 'It stopped at step {step} of {total}: {what}.'
// when it did: a failed job stays in the core until the next one, so the window says whose day it is of
export const PLAN_FAILED_ON = 'The plan stopped on {date}.'

// The codes whose detail is what apt said: a few lines, from the core, that tell which mirror and why. Only the lines apt itself
// wrote are shown (they start with E:, W: or Err:), as text, under a heading that says they are apt's: when apt wrote none, the
// core's detail is its own sentence (in English, said by the code already) and is not shown. The detail of plan_unparsed is the
// core's own reason code, so it is never shown.
const APT_CODES = new Set(['sandbox_update_failed', 'sandbox_solver_failed'])
const APT_LINE = /^(?:E:|W:|Err:)/

export const PLAN_SAID_APT = 'What apt said, as the machine reported it'
// for a code this window does not know: the core's words, whoever they are
export const PLAN_SAID_CORE = 'What ReCasaOS said, as the machine reported it'

/** Why the call itself failed, by what the call said: never by the core's words. */
export const PLAN_CALL_ERRORS = {
	unavailable: 'This version of ReCasaOS cannot make this plan yet. Update ReCasaOS, then try again.',
	timeout: 'The request took too long. Try again.',
	failed: 'The request could not be completed. Try again.',
}

/** Why the runbook is not given, by the core's code and reason. */
export const PLAN_RUNBOOK_REFUSALS = {
	no_plan: {
		by: 'reason',
		variants: {
			idle: ['There is no plan to write it from. Make the plan first.'],
			running: ['A plan is being made: wait for it to end.'],
			failed: ['The last plan failed. Make it again.'],
			expired: ['The plan has expired. Make a new one.'],
			blocked: ['The plan is blocked, so it has no runbook.'],
		},
		text: ['There is no plan to write the runbook from. Make the plan again.'],
	},
	no_runbook: {
		by: 'reason',
		variants: {
			runbook_unsafe: ['The text could not be written safely: a line of your package sources holds what ends a block of it. Nothing was written.'],
			// the core's bound is 256 KiB, which the text of a box with a good many third-party files or long comments in its sources can pass
			runbook_too_large: ['The text would be too large to hand out: shorten the comments in your package sources and the number of third-party source files, then make the plan again. Nothing was written.'],
		},
		text: ['The runbook could not be written.'],
	},
}

export const PLAN_RUNBOOK_OTHER = 'This runbook is for another plan: a newer one was made. Look at the plan again.'
export const PLAN_RUNBOOK_UNREADABLE = 'The runbook could not be read. Try again.'

// What a failure of the runbook leaves to do, as `button`: `retry` asks for the text again (it may come), `look` asks the core for the plan again
// (the text is not for the plan on the screen, and asking again for it says the same), `none` has no button (the text cannot be written for this
// plan: only a new plan, made after the cause is mended, can have one).
export const RUNBOOK_OTHER_FAILURE = { key: PLAN_RUNBOOK_OTHER, params: {}, button: 'look' }
export const RUNBOOK_UNREADABLE_FAILURE = { key: PLAN_RUNBOOK_UNREADABLE, params: {}, button: 'retry' }

/** What the lines of the sources went through, by the core's word. */
export const PLAN_WHY = {
	suite: 'release name',
	host: 'address',
	firmware: 'firmware component',
	dropped: 'left out',
	paused: 'put aside',
}

/** What became of a file of the sources, by the core's word. */
export const PLAN_ACTIONS = {
	rewritten: 'Rewritten for the next release',
	paused: 'Put aside for the upgrade',
	unchanged: 'Not changed',
}
export const PLAN_ACTION_UNKNOWN = 'Changed in a way this window does not know'

/** Why a file of apt's own configuration was left out of the plan, by the core's reason (apt_conf_left_out). */
export const PLAN_CONF_REASONS = {
	not_simple: 'It is not made of simple settings, one to a line.',
	has_directive: 'It has a directive of apt\'s configuration language, such as #include or #clear.',
	not_allowed_setting: 'It sets something other than the network or the recommended packages.',
	too_large: 'It is too large.',
	not_regular: 'It is not a regular file.',
	proxy_auto_detect: 'It sets a script that finds the proxy, which the plan does not run.',
}
export const PLAN_CONF_REASON_UNKNOWN = 'It was left out for a reason this window does not know.'
// the core keeps at most 200 of the files it left out (the plan, and the failures that say them) and says when it cut the list
export const PLAN_LIST_CUT = 'The list is cut: there are more.'
const MAX_CONF = 200
// the failures that the core says the files left out in: a proxy that was not given to the sandbox is a network that cannot be reached
const CONF_CODES = new Set(['sandbox_update_failed', 'sandbox_solver_failed', 'plan_unparsed'])

/** Why the plan has no disk rows, by the core's `disk_note`: the sizes that the floors are made of were not read. */
export const PLAN_DISK_NOTES = {
	estimates_unknown: 'apt did not say how much it would download, so the disk space is not checked.',
}
export const PLAN_DISK_NOTE_UNKNOWN = 'The disk space was not checked, for a reason this window does not know.'

// Every key a table above says, for the language files' test: the strings of the tables, but for the names of the fields that choose
// among them (`by`).
function strings(value) {
	if (typeof value === 'string')
		return [value]
	if (Array.isArray(value))
		return value.flatMap(strings)
	if (isPlain(value))
		return Object.entries(value).filter(([name]) => name !== 'by').flatMap(([, item]) => strings(item))
	return []
}

export const PLAN_KEYS = [...new Set([
	...PLAN_PHASES.map(phase => phase.key),
	PLAN_PHASE_UNKNOWN,
	PLAN_STEP,
	...strings(PLAN_PROBLEMS),
	PLAN_PROBLEM_UNKNOWN,
	...Object.values(PLAN_SEVERITIES).map(severity => severity.key),
	...Object.values(PLAN_VERDICTS).map(verdict => verdict.key),
	...strings(PLAN_SOURCE_REASONS),
	...strings(PLAN_PLACES),
	...strings(PLAN_ERRORS),
	PLAN_ERROR_UNKNOWN,
	PLAN_ERROR_NONE,
	PLAN_ERROR_STEP,
	...strings(PLAN_CALL_ERRORS),
	...strings(PLAN_RUNBOOK_REFUSALS),
	PLAN_RUNBOOK_OTHER,
	PLAN_RUNBOOK_UNREADABLE,
	...strings(PLAN_WHY),
	...strings(PLAN_ACTIONS),
	PLAN_ACTION_UNKNOWN,
	...strings(PLAN_CONF_REASONS),
	PLAN_CONF_REASON_UNKNOWN,
	PLAN_LIST_CUT,
	...strings(PLAN_DISK_NOTES),
	PLAN_DISK_NOTE_UNKNOWN,
	PLAN_SAID_APT,
	PLAN_SAID_CORE,
	PLAN_FAILED_ON,
])]

// ---- what the core's data says to a sentence ----------------------------------------------------------------------

// The data a sentence can use, by the name of its placeholder: strings are cleaned and cut, sizes are written for a language.
// `unknown` says that the room that is free could not be read.
function paramsOf(data, locale) {
	const params = {}
	for (const name of ['file', 'path', 'name', 'version', 'pattern']) {
		const value = clean(data[name], 120)
		if (value)
			params[name] = value
	}
	if (Number.isInteger(data.line) && data.line > 0)
		params.line = String(data.line)
	const needed = sizeOf(data.need, locale, true)
	if (needed)
		params.needed = needed
	const free = data.unknown === true ? '' : sizeOf(data.free, locale)
	if (free)
		params.free = free
	const names = nameList(data.names)
	if (names)
		params.names = names
	// how many packages apt keeps back without naming them
	if (Number.isInteger(data.unlisted) && data.unlisted > 0)
		params.unlisted = String(data.unlisted)
	return params
}

// the first sentence of a code whose placeholders the data fills; the sentence of the value its `by` field has, when it has one
function sentenceFor(entry, data, params) {
	const table = Array.isArray(entry) ? { text: entry } : entry
	const value = table.by ? data[table.by] : undefined
	const variant = typeof value === 'string' || typeof value === 'boolean' ? own(table.variants ?? {}, String(value)) : undefined
	const candidates = [].concat(variant ?? table.text)
	for (const key of candidates) {
		const wanted = [...key.matchAll(/\{(\w+)\}/g)].map(match => match[1])
		if (wanted.every(name => params[name]))
			return { key, params: Object.fromEntries(wanted.map(name => [name, params[name]])) }
	}
	return { key: candidates.at(-1), params: {} }
}

/** A sentence of the view, written in English with its data in it: for the text that is copied, which is the owner's to send. */
export function sayEnglish(message) {
	return message.key.replace(/\{(\w+)\}/g, (_, name) => message.params?.[name] ?? '')
}

// What the core said that no sentence said, as text: the data is its word on the plan. For a code that is not known.
function detailsOf(data) {
	const details = []
	for (const [name, value] of Object.entries(data)) {
		if (!/^[a-z][a-z0-9_]{0,40}$/.test(name))
			continue
		const items = (Array.isArray(value) ? value : [value]).filter(item => (typeof item === 'string' && item) || typeof item === 'number')
		if (items.length)
			details.push({ name, value: items.map(item => clean(String(item), 80)).join(', ').slice(0, 200) })
		if (details.length === 6)
			break
	}
	return details
}

// ---- why a plan could not be made ---------------------------------------------------------------------------------

/**
 * The view of the core's error (the job's `error`, or the `data` of a 409 that refuses the request): the sentence of its code,
 * the step it stopped in, why a source is refused, and, for the codes that have it, the lines apt said.
 */
export function errorView(raw, locale = 'en_us') {
	const error = isPlain(raw) ? raw : {}
	const code = clean(error.code, 60)
	const data = isPlain(error.data) ? error.data : {}
	const entry = own(PLAN_ERRORS, code)
	const params = paramsOf(data, locale)
	const phase = phaseOf(error.phase)
	let sentence
	let reason = null
	let place = null
	if (entry) {
		sentence = sentenceFor(entry, data, params)
		if (WITH_PLACE.has(code) && params.file)
			place = sentenceFor(PLAN_PLACES, data, params)
		if (code === 'sources_format')
			reason = own(PLAN_SOURCE_REASONS, data.reason) ?? PLAN_SOURCE_REASONS.other
	} else {
		sentence = code ? { key: PLAN_ERROR_UNKNOWN, params: { code } } : { key: PLAN_ERROR_NONE, params: {} }
	}
	// the lines apt said (the core cut and cleaned them already): the ones apt wrote, for the codes that have them, and the core's
	// own words for a code not known
	const all = APT_CODES.has(code) || !entry ? String(error.detail ?? '') : ''
	const said = all.slice(0, 3000).split('\n')
	// the line that the cut went through may be half an address: it goes
	if (all.length > 3000)
		said.pop()
	const detail = said.map(line => safe(line, 200)).filter(line => line && (!entry || APT_LINE.test(line))).slice(0, 6)
	// the files of apt's configuration that the sandbox did not get: the proxy of the box may be one of them, and a failure that says only
	// the network would send the owner to the wrong place
	const left = CONF_CODES.has(code) ? confListOf(data.apt_conf_left_out, data.apt_conf_left_out_truncated) : confListOf()
	return { code, sentence, reason, place, phase, detail, saidKey: entry ? PLAN_SAID_APT : PLAN_SAID_CORE, ...left, finishedAt: '' }
}

// ---- the plan -----------------------------------------------------------------------------------------------------

const ORDER = ['blocked', 'needs_acceptance', 'info']

function problemOf(raw, index, locale, unknownPaths) {
	const code = clean(raw.code, 60)
	const rawData = isPlain(raw.data) ? raw.data : {}
	// a room that is short on a folder whose room the plan could not read has no "free" to say, whatever the data says of it
	const data = code === 'disk_short' && unknownPaths.has(clean(rawData.path, 120)) ? { ...rawData, unknown: true } : rawData
	// a weight this window does not know is one that has to be accepted: never hidden, never a pass
	const severity = own(PLAN_SEVERITIES, raw.severity) ? raw.severity : 'needs_acceptance'
	const entry = own(PLAN_PROBLEMS, code)
	return {
		id: `${index}-${code}`,
		code,
		severity,
		tone: PLAN_SEVERITIES[severity].tone,
		badge: PLAN_SEVERITIES[severity].key,
		sentence: entry ? sentenceFor(entry, data, paramsOf(data, locale)) : { key: PLAN_PROBLEM_UNKNOWN, params: { code: code || '?' } },
		details: entry ? [] : detailsOf(data),
	}
}

// The verdict the window says: the core's, but never better than what the window shows. A verdict it does not know is a blocked one,
// a blocking problem blocks, and so does what the window shows in red whatever the problems say (a protected or essential package
// that is removed, a room that is short, a package that is still kept back after the full upgrade, named or not, a package that
// would be downgraded): the sentence is never "nothing in the way" above it. The same for what has to be accepted: a package that
// was installed by hand and is removed.
function verdictOf(raw, problems, shownInRed, shownToAccept) {
	let verdict = own(PLAN_VERDICTS, raw) ? raw : 'blocked'
	if (shownInRed || problems.some(problem => problem.severity === 'blocked'))
		verdict = 'blocked'
	else if (verdict === 'ok' && (shownToAccept || problems.some(problem => problem.severity === 'needs_acceptance')))
		verdict = 'needs_acceptance'
	return verdict
}

function linesOf(file) {
	const lines = (Array.isArray(file.lines) ? file.lines : []).filter(isPlain)
	return lines.map(line => ({
		n: Number.isInteger(line.n) && line.n > 0 ? line.n : 0,
		before: shown(line.before),
		after: shown(line.after),
		why: String(line.why ?? '').split(',').map(word => word.trim()).filter(word => own(PLAN_WHY, word)).map(word => PLAN_WHY[word]),
	}))
}

// how many lines of one file are listed: a file of sources is a few dozen lines
const MAX_LINES = 60

function sourcesOf(sources, paused) {
	const raw = isPlain(sources) ? sources : {}
	const files = (Array.isArray(raw.files) ? raw.files : []).filter(isPlain).map((file) => {
		const lines = linesOf(file)
		return {
			file: clean(file.file, 120),
			action: own(PLAN_ACTIONS, file.action) ? file.action : '',
			actionKey: own(PLAN_ACTIONS, file.action) ?? PLAN_ACTION_UNKNOWN,
			lines: lines.slice(0, MAX_LINES),
			more: Math.max(0, lines.length - MAX_LINES),
		}
	})
	const pausedList = (Array.isArray(paused) ? paused : []).filter(isPlain).map(item => ({
		file: clean(item.file, 120),
		line: Number.isInteger(item.line) && item.line > 0 ? item.line : 0,
		docker: item.docker === true,
	}))
	const place = item => item.line ? `${item.file}:${item.line}` : item.file
	return {
		files,
		dockerFiles: pausedList.filter(item => item.docker).map(place).join(', '),
		otherPaused: pausedList.filter(item => !item.docker).map(place).join(', '),
		dropped: count(raw.dropped_backports) ?? 0,
		firmware: count(raw.firmware_added) ?? 0,
	}
}

function countsOf(raw) {
	const item = isPlain(raw) ? raw : {}
	return { upgraded: count(item.upgraded), new: count(item.new), removed: count(item.removed), keptBack: count(item.kept_back) }
}

// The files of apt's configuration the plan did not use, each with the sentence of its reason, and whether the list is cut: the core keeps at
// most 200 of them and says when it cut (a list that is longer than that is cut here, and says so too). No list, no cut to say.
function confListOf(list, truncated) {
	const all = Array.isArray(list) ? list : []
	const files = all.filter(isPlain).slice(0, MAX_CONF)
		.map(item => ({ file: clean(item.file, 120), reasonKey: own(PLAN_CONF_REASONS, item.reason) ?? PLAN_CONF_REASON_UNKNOWN }))
		.filter(item => item.file)
	return { confLeftOut: files, confCut: files.length > 0 && (truncated === true || all.length > MAX_CONF) }
}

function namesOf(list, truncated) {
	const names = (Array.isArray(list) ? list : []).filter(name => typeof name === 'string').map(name => clean(name, 80)).filter(Boolean)
	return { names: names.join(', '), count: names.length, truncated: truncated === true }
}

/**
 * The view of the core's plan, or null for a plan that is not one. It has everything the window shows, and nothing the
 * window has to look up again: `verdict` is the one the window says (never better than the problems), and every line from
 * the machine is cleaned.
 */
export function planView(plan, locale = 'en_us') {
	if (!isPlain(plan))
		return null
	const disk = (Array.isArray(plan.disk) ? plan.disk : []).filter(isPlain).map(row => ({
		path: clean(row.path, 120),
		need: sizeOf(row.need, locale, true),
		free: row.unknown === true ? '' : sizeOf(row.free, locale),
		unknown: row.unknown === true,
		ok: row.ok === true && row.unknown !== true,
	}))
	const unknownPaths = new Set(disk.filter(row => row.unknown).map(row => row.path))
	const problems = (Array.isArray(plan.problems) ? plan.problems : [])
		.filter(isPlain)
		.map((raw, index) => problemOf(raw, index, locale, unknownPaths))
		.sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity))
	const removals = (Array.isArray(plan.removals) ? plan.removals : []).filter(isPlain).map(removal => ({
		name: clean(removal.name, 80),
		version: clean(removal.version, 80),
		manual: removal.manual === true,
		protected: removal.protected === true,
		essential: removal.essential === true,
	}))
	const keptBack = namesOf(plan.kept_back, plan.kept_back_truncated)
	const counts = isPlain(plan.counts) ? plan.counts : {}
	const full = countsOf(counts.dist_upgrade)
	// what is kept back after the full upgrade is blocking, named or not: apt counts some that it does not name (a package on hold
	// whose version in the next release is older than the installed one), which the table of counts shows and the names do not
	const shownInRed = removals.some(removal => removal.protected || removal.essential) || disk.some(row => !row.ok) || keptBack.count > 0
		|| full.keptBack > 0 || problems.some(problem => problem.code === 'downgrade')
	const verdict = verdictOf(plan.verdict, problems, shownInRed, removals.some(removal => removal.manual))
	const estimates = isPlain(plan.estimates) ? plan.estimates : {}
	const known = estimates.known === true && typeof estimates.download_bytes === 'number' && typeof estimates.extra_bytes === 'number'
	const id = typeof plan.plan_id === 'string' && /^p1-[0-9a-f]{32}$/.test(plan.plan_id) ? plan.plan_id : ''
	// why there are no rows of disk: the core's word for it, or what the window sees (no sizes) when the core said none
	const diskNote = plan.disk_note ? (own(PLAN_DISK_NOTES, plan.disk_note) ?? PLAN_DISK_NOTE_UNKNOWN) : (known ? '' : PLAN_DISK_NOTES.estimates_unknown)
	const expiresMs = typeof plan.expires_at === 'string' ? Date.parse(plan.expires_at) : Number.NaN
	return {
		id,
		shortId: id.slice(0, 11),
		hop: clean(plan.hop, 40),
		madeAt: formatMoment(plan.made_at, locale),
		expiresAt: formatMoment(plan.expires_at, locale),
		// by the clock of the machine the window runs on, which is not the core's: the window asks the core before it acts on it
		expiresMs: Number.isFinite(expiresMs) ? expiresMs : null,
		verdict,
		tone: PLAN_VERDICTS[verdict].tone,
		summary: { key: PLAN_VERDICTS[verdict].key, params: {} },
		problems,
		sources: sourcesOf(plan.sources, plan.paused),
		counts: { full, first: countsOf(counts.upgrade) },
		removals,
		added: namesOf(plan.new_packages, plan.new_truncated),
		keptBack,
		unneeded: namesOf(plan.autoremovable, plan.autoremovable_truncated),
		estimates: {
			known,
			download: known ? sizeOf(estimates.download_bytes, locale) : '',
			// what the upgrade frees is said as what it frees
			extra: known ? sizeOf(Math.abs(estimates.extra_bytes), locale) : '',
			freed: known && estimates.extra_bytes < 0,
		},
		disk,
		diskNote,
		...confListOf(plan.apt_conf_left_out, plan.apt_conf_left_out_truncated),
	}
}

// ---- how the job is going -----------------------------------------------------------------------------------------

const STATES = new Set(['idle', 'running', 'done', 'failed'])

/**
 * The view of GET /v1/sys/os/upgrade/plan, or null for an answer that is not one (a state it does not know is not read:
 * the window does not guess). A job that is done without a plan to read is a failure that says no code.
 */
export function readStatus(data, locale = 'en_us') {
	if (!isPlain(data) || !STATES.has(data.state))
		return null
	const status = {
		plannable: data.plannable === true,
		reason: clean(data.reason, 40),
		// the core could not ask the machine whether a plan can be made (no reason, and no "no"): not a machine that cannot be planned
		unknown: data.unknown === true && data.plannable !== true && !clean(data.reason, 40),
		// the folder that the plan made and could not remove, when it could not
		leftBehind: clean(data.sandbox_left_behind, 120),
		state: data.state,
		phase: phaseOf(data.phase),
		expired: data.expired === true,
		alreadyRunning: data.already_running === true,
		error: null,
		plan: null,
		raw: null,
	}
	if (status.state === 'failed')
		status.error = errorView(data.error, locale)
	if (status.state === 'done') {
		status.plan = planView(data.plan, locale)
		status.raw = data.plan
		if (!status.plan) {
			status.state = 'failed'
			status.error = errorView(null, locale)
		}
	}
	// a failed job stays in the core until the next one is made: the window says when it ended
	if (status.error)
		status.error.finishedAt = formatMoment(data.finished_at, locale)
	return status
}

// ---- a call that failed -------------------------------------------------------------------------------------------

/**
 * What the core refused with a 409: its code and its data, or null for anything else. The data of the code is in `data.data` of the
 * answer's `data`.
 */
export function refusalOf(error) {
	const body = error?.response?.data?.data
	if (error?.response?.status === 409 && isPlain(body) && typeof body.error_code === 'string')
		return { code: body.error_code, data: isPlain(body.data) ? body.data : {} }
	return null
}

/** Why a call failed, by what it said: a sentence key of PLAN_CALL_ERRORS. */
export function callFailure(error) {
	if (error?.response?.status === 404)
		return PLAN_CALL_ERRORS.unavailable
	if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT')
		return PLAN_CALL_ERRORS.timeout
	return PLAN_CALL_ERRORS.failed
}

/** The sentence of a refusal of the plan's request, as a message of the view: { key, params }. */
export function startRefusal(error, locale = 'en_us') {
	const refusal = refusalOf(error)
	return refusal ? errorView({ code: refusal.code, data: refusal.data }, locale) : null
}

/** The sentence of a refusal of the runbook (no_plan, no_runbook), or of a call that failed, and its button: { key, params, button }. */
export function runbookFailure(error) {
	const refusal = refusalOf(error)
	const entry = refusal && own(PLAN_RUNBOOK_REFUSALS, refusal.code)
	if (entry)
		return { ...sentenceFor(entry, refusal.data, {}), button: refusal.code === 'no_runbook' ? 'none' : 'retry' }
	return { key: callFailure(error), params: {}, button: 'retry' }
}

// ---- the runbook --------------------------------------------------------------------------------------------------

// what is taken of a text from the core: the core's own bound is 256 KiB
const MAX_RUNBOOK = 262144

/** The name of the file of a runbook: the id is the core's own form, or the file has no id in its name. */
export function runbookFileName(planId) {
	return /^p1-[0-9a-f]{32}$/.test(planId) ? `casaos-os-upgrade-${planId}.sh` : 'casaos-os-upgrade.sh'
}

/** The view of GET /v1/sys/os/upgrade/runbook, or null for an answer that is not one. */
export function runbookView(data) {
	if (!isPlain(data) || typeof data.text !== 'string' || !data.text || data.text.length > MAX_RUNBOOK)
		return null
	const planId = typeof data.plan_id === 'string' && /^p1-[0-9a-f]{32}$/.test(data.plan_id) ? data.plan_id : ''
	return {
		planId,
		text: data.text,
		fileName: runbookFileName(planId),
		// `number` is the block's own: the text of the runbook counts its blocks from 0 ("BLOCK 0", the sources are BLOCK 3, the point of
		// no return BLOCK 5), as the core lists them. It is the place in the core's list, so that a block that is not one does not move
		// the ones after it.
		blocks: (Array.isArray(data.blocks) ? data.blocks : []).flatMap((block, index) => isPlain(block)
			? [{
					id: clean(block.id, 40) || String(index),
					number: index,
					title: clean(block.title, 160),
					reboot: block.reboot === true,
					pointOfNoReturn: block.point_of_no_return === true,
				}]
			: []),
	}
}

// ---- the plan as text, for the owner to keep or to send ------------------------------------------------------------

// What "Copy the plan" copies is built here, from the data, in English and always: a few kilobytes at most, and no secret (every
// line of the machine is scrubbed again, and the runbook, which has the files as they are, is not part of it).
const MAX_TEXT = 24000
const MAX_LISTED = 60

function listed(title, names) {
	if (!names.count)
		return []
	const items = names.names.split(', ')
	const cut = items.length > MAX_LISTED
	return [`${title} (${names.count}${names.truncated ? ' or more' : ''}): ${items.slice(0, MAX_LISTED).join(', ')}${cut ? ', ...' : ''}`]
}

const number = value => value === null ? '-' : String(value)

/** The plan as plain text, in English, bounded. */
export function planText(plan) {
	const view = planView(plan, 'en')
	if (!view)
		return ''
	const lines = ['ReCasaOS upgrade plan', `plan: ${view.id || '(no id)'}`, `hop: ${view.hop || '-'}`]
	lines.push(`made: ${clean(plan.made_at, 40) || '-'}   expires: ${clean(plan.expires_at, 40) || '-'}`)
	lines.push(`verdict: ${view.verdict}`, '')
	lines.push(`Findings (${view.problems.length})`)
	for (const problem of view.problems)
		lines.push(`- [${problem.severity}] ${problem.code || '?'}: ${sayEnglish(problem.sentence)}`)
	lines.push('', 'Package sources')
	for (const file of view.sources.files) {
		lines.push(`- ${file.file} (${file.action || 'unknown'})`)
		for (const line of file.lines)
			lines.push(`    line ${line.n}: ${line.before} -> ${line.after}${line.why.length ? ` (${line.why.join(', ')})` : ''}`)
		if (file.more)
			lines.push(`    ... and ${file.more} more lines`)
	}
	if (view.sources.dockerFiles)
		lines.push(`Docker's source, put aside for the upgrade: ${view.sources.dockerFiles}`)
	if (view.sources.otherPaused)
		lines.push(`Other sources, put aside and left aside afterwards: ${view.sources.otherPaused}`)
	lines.push(`Lines left out (backports, proposed updates): ${view.sources.dropped}`, `Lines that get non-free-firmware: ${view.sources.firmware}`)
	lines.push('', 'Packages')
	for (const [name, c] of [['full upgrade', view.counts.full], ['first, minimal upgrade', view.counts.first]])
		lines.push(`${name}: upgraded ${number(c.upgraded)}, new ${number(c.new)}, removed ${number(c.removed)}, kept back ${number(c.keptBack)}`)
	for (const removal of view.removals)
		lines.push(`removed: ${removal.name} ${removal.version}${removal.manual ? ' [by hand]' : ''}${removal.protected ? ' [protected]' : ''}${removal.essential ? ' [essential]' : ''}`)
	lines.push(...listed('new', view.added), ...listed('kept back', view.keptBack), ...listed('no longer needed', view.unneeded))
	lines.push('', 'Disk')
	if (view.estimates.known)
		lines.push(`download: ${view.estimates.download}`, `${view.estimates.freed ? 'freed' : 'extra space'}: ${view.estimates.extra}`)
	if (view.diskNote)
		lines.push(sayEnglish({ key: view.diskNote, params: {} }))
	for (const row of view.disk)
		lines.push(`${row.path}: needs ${row.need}, free ${row.unknown ? '(not read)' : row.free}${row.ok ? '' : ' SHORT'}`)
	if (view.confLeftOut.length) {
		lines.push('', 'Left out of apt\'s configuration for this plan (it reads only plain network and recommended-package settings)')
		for (const item of view.confLeftOut)
			lines.push(`- ${item.file}: ${item.reasonKey}`)
		if (view.confCut)
			lines.push(PLAN_LIST_CUT)
	}
	const text = lines.join('\n')
	return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n[cut]` : text
}
