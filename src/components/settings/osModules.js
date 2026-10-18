/**
 * What the dashboard makes of the modules of this release: GET /v1/sys/modules (what the catalogue offers and what is installed), the plan
 * of an install (POST .../plan), and the job that installs or removes a module (GET .../status). The window that drives them is
 * ModulesModal.vue; this is its pure module: no request, no timer, no component.
 *
 * Texts are language-file keys (the English sentence is the key), and the core's codes pick them: the dashboard never matches the core's
 * English words. A code it does not know is said as one it does not know, with the code as text, and never breaks the view. Everything the
 * core sends is TEXT: it is cleaned here (control characters, the marks that turn a text round, the user and the query of an address) and
 * cut, and the component shows it as text nodes, never as HTML, never in a toast, never in an attribute that is interpreted.
 *
 * Fail closed, here as in the core: a plan installs only when it is not refused, every check passed and its id has the shape of the core's;
 * a module is installable only when the list says so in every field; a job whose state is not one of the core's has no step and no button.
 *
 * The lists of codes below (steps, states, plan checks, refusals and failures) MIRROR the core: pkg/modulecmd (install.go, remove.go,
 * jobstate.go), pkg/osmodule (plan.go, unpack.go), service/system_module.go. osModules.spec.js pins the core's lists, so that a code added
 * there without a sentence here is noticed.
 *
 * A message is { key, params, keys? }: the component says $t(key, params), after it has said the parameters named in `keys` (those are
 * language-file keys too). A few fields are keys alone (labels, titles of the tables).
 *
 * EXPORTS
 *
 *   The list
 *     listView(raw) -> { ok, error, modules } | null          null for what is not a list. `ok` is the catalogue's; when it is not, no module can be
 *                                                              installed (the ones that are installed can still be removed)
 *       module: { name, title, description, tier: { id, label, sentence, raw } | null, tag, installed: { version } | null, supported,
 *                 reasons: [{ code, message }], broken, inCatalogue, canInstall, canRemove }
 *   The plan
 *     modulePlanView(raw, { name, locale }) -> plan | null      null for what is not the plan of that module
 *       plan: { name, tier, refused, refusedMessage, checks: [{ code, label, ok, notChecked, mark, markText, message, detail }], incomplete,
 *               packages: { install, upgrade, moreInstall, moreUpgrade, known, downloadText, extraText }, archive: { url, bytesText }, planId,
 *               installable }
 *     installBody(plan) -> { plan_id } | null                   the body of the install call: the displayed plan's id, and nothing if it cannot install
 *   The job
 *     jobView(raw, { name, title, kind, locale }) -> job | null
 *       job: { name, state, known, running, finished, step, rollback, kind, title, group, tone, progress: { value, max, label } | null,
 *              steps: [{ id, text, mark, markText, icon }], rollbackStep, stoppedAt, live, reason, code, undoText, kept: { known, names, count, command,
 *              unsafe } | null, next, advice: { command } | null, logTail, startedAt, endedAt, changeKey }
 *       The core does not say whether the job is an install or a remove: `kind` is told from the step, then from what the page remembers of its call.
 *     jobAnnouncement(previous, next) -> message | null         one per change of the job, none per poll
 *   Polling
 *     nextJobPoll(last, { hidden, running }) -> milliseconds | null
 *     moduleOutage({ kind, elapsedMs }) -> { level, message, elapsed }   what to say while the job cannot be read
 *   When a call fails
 *     moduleFailure(error, locale, { read }) -> { kind, status, code, message, items, detail }
 *     reasonMessage(code, { step, data }) -> message
 *   Sizes
 *     formatBytes(bytes, locale) -> '12 MiB', '3 KiB', '1,5 Gio'
 *   The tables, for the component and the tests
 *     TEXT, TIERS, STEPS, STEP_TEXTS, STEP_MARKS, JOB_STATES, JOB_TITLES, REASONS, CHECKS, MODULE_KEYS (every key the tables say, for the language files' test)
 */

import { clean, sentenceFor } from './osPlan'
import { formatMoment, formatSize } from './osReadiness'
import { POLL_MS, failureOf, outageView } from './osUpgrade'

// ---- small tools ----------------------------------------------------------------------------------------------------

// Only the own properties of a table: a code named like an Object method is not one.
function own(table, key) {
	return typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined
}

const isPlain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const list = value => Array.isArray(value) ? value : []
const msg = (key, params = {}, keys = undefined) => keys ? { key, params, keys } : { key, params }
const size = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null

// the rules of the core's names (pkg/osmodule): a module, a plan, a package, a tag
export const MODULE_NAME = /^[a-z][a-z0-9-]{0,31}$/
export const PLAN_ID = /^m1-[0-9a-f]{32}$/
const PACKAGE_NAME = /^[a-z0-9][a-z0-9+.-]{0,63}$/
const TAG = /^v\d+\.\d+\.\d+$/
// a step and a code are words of lower case letters, digits and underscores (pkg/modulecmd/jobstate.go)
const STEP_WORD = /^[a-z][a-z_]{0,31}$/
const CODE_WORD = /^[a-z][a-z0-9_]{0,47}$/

// What a line of a log is shown as: an address loses its user and its query, the control characters and the marks that turn the text round
// become spaces, and it is cut. (The core does this too; the dashboard says it again whatever the core sent.)
const SCRUBBED_WITHIN = 2048
function line(value, max = 240) {
	if (typeof value !== 'string')
		return ''
	const text = value.length > SCRUBBED_WITHIN ? value.slice(0, SCRUBBED_WITHIN) : value
	return clean(text.replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/]*@/gi, '$1***@').replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^\s?]*)\?\S*/gi, '$1?***'), max)
}

// ---- sizes ------------------------------------------------------------------------------------------------------------

const KIB = 1024
const MIB = KIB * 1024

/**
 * 3 KiB, 12 MiB or 1.5 GiB, written for a language ("1,5 Gio" in French), or '' for anything that is not a size. The size of what is
 * downloaded and of what is written is cut UP to what is shown (formatSize does the same for megabytes and gigabytes): the sentence never
 * says less than what is needed. `locale` is an Intl tag or a language-file name such as fr_fr.
 */
export function formatBytes(bytes, locale = 'en') {
	if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0)
		return ''
	if (bytes > MIB - KIB)
		return formatSize(bytes, locale, true)
	const french = /^fr/i.test(String(locale))
	const [value, unit] = bytes < KIB ? [bytes, french ? 'o' : 'B'] : [Math.ceil(bytes / KIB), french ? 'Kio' : 'KiB']
	let number
	try {
		number = new Intl.NumberFormat(String(locale).replace('_', '-')).format(value)
	} catch {
		number = new Intl.NumberFormat('en').format(value)
	}
	return `${number} ${unit}`
}

// ---- the words of the page --------------------------------------------------------------------------------------------

// Every sentence the page says that is not the sentence of a code of the core. The component looks them up and writes nothing of its own.
export const TEXT = {
	heading: 'Modules',
	loading: 'Reading the list of modules…',
	none: 'No module is offered by this release.',
	catalogueBad: 'The list of modules of this release could not be read.',
	installed: 'Installed version',
	installedUnknown: 'Installed, version not known',
	offered: 'Version offered',
	unsupported: 'This machine cannot have this module.',
	broken: 'The record of this module cannot be read. Remove the module, then install it again.',
	gone: 'This release of ReCasaOS no longer offers this module.',
	jobRunning: 'A job is running. The buttons come back when it ends.',
	checking: 'Looking for a job that is already running…',
	reported: 'Reported by the core',
	checkAgain: 'Check again',
	busyHeading: 'The machine is busy',
	unavailable: 'This version of ReCasaOS cannot install modules yet. Update ReCasaOS, then try again.',
	plan: {
		title: 'Install {module}',
		planning: 'ReCasaOS is working out what the install would do. This can take up to a minute, and nothing is changed.',
		planningLabel: 'Making the plan',
		intro: 'This is what the install does. Read it, then confirm.',
		packages: 'Packages that apt installs',
		upgrades: 'Packages that apt upgrades',
		noPackages: 'apt installs no package for this module.',
		more: '…and {n} more',
		download: 'Download of the packages',
		archive: 'Download of the module',
		extra: 'Room used on the disk by the packages',
		unknownSize: 'ReCasaOS could not tell how much apt downloads.',
		from: 'The module comes from',
		checks: 'What ReCasaOS checked',
		incomplete: 'The plan could not check everything, so it cannot be confirmed.',
		refusedHeading: 'This module cannot be installed now.',
		stay: 'The packages stay on the machine if you remove the module later.',
		ok: 'Install the module',
	},
	remove: {
		title: 'Remove {module}?',
		stops: 'The module stops, and the files it put on the machine are deleted.',
		stays: 'The packages it installed and the data of the module are not removed.',
		about: 'What the module says about itself',
		ok: 'Remove the module',
	},
	marks: { passed: 'Passed', failed: 'Failed', notChecked: 'Not checked' },
	outage: {
		unreadable: 'The state of the job could not be read just now. This page tries again by itself.',
		signin: 'Your session has ended. Sign in again to see the job.',
	},
	job: {
		started: 'Started',
		log: 'End of the log of the job',
		noLog: 'The job has printed nothing yet.',
		rollback: 'Undoing the install: {step}',
		progressInstall: 'Progress of the install: step {index} of {total}',
		progressRemove: 'Progress of the removal: step {index} of {total}',
		stoppedAt: 'It stopped at: {step}',
		unknownState: 'This page does not know the state of this job.',
		advice: 'Run this command as root at a console of the machine. It finishes the cleaning. Then try again.',
		keptSome: 'These packages are still on the machine: {names}.',
		keptNone: 'The install left no package on the machine.',
		keptUnknown: 'Which packages the install left on the machine could not be told. The log below may say.',
		keptUnsafe: 'Some of their names are not valid package names, so no command is given. Look at the log below.',
		purge: 'To remove them, run this command as root at a console of the machine. ReCasaOS never runs it. Other software may use these packages: read what apt says before you agree.',
	},
}

export const TIERS = {
	core: { label: 'Core', sentence: 'Maintained by ReCasaOS and proved on a real machine.' },
	community: { label: 'Community', sentence: 'Maintained by the community, not proved on a real machine by ReCasaOS.' },
}
export const TIER_UNKNOWN = { label: 'Unknown kind', sentence: 'This page does not know this kind of module. ReCasaOS has not proved it.' }

function tierOf(raw) {
	if (typeof raw !== 'string' || !raw)
		return null
	const known = own(TIERS, raw)
	return known ? { id: raw, ...known, raw: '' } : { id: 'unknown', ...TIER_UNKNOWN, raw: clean(raw, 20) }
}

// ---- the reasons --------------------------------------------------------------------------------------------------------

// What each code of the core says, whether a request was refused with it, a plan, a job or a check of the system. An entry is a sentence, a list of
// sentences (the first whose {placeholders} the core's data fills is said, the last has none), or { text, steps } for a code whose meaning depends on
// the step it came with.
export const REASONS = {
	// the requests (service/system_module.go, route/v1/system_module.go)
	bad_request: ['ReCasaOS did not accept a field of the request ({field}).', 'ReCasaOS did not accept the request.'],
	not_root: 'ReCasaOS does not run as root on this machine, so it cannot install or remove a module.',
	unsupported: 'This machine cannot install modules: it needs Debian or Ubuntu with apt-get and systemd.',
	busy: 'Something else is at work on this machine, such as an upgrade of the operating system, a package update or another module job. Wait for it to end, then try again.',
	plan_changed: 'The plan changed after you read it. Read the new plan, then confirm again.',
	plan_timeout: 'The plan took too long to make. Try again in a moment.',
	not_installed: 'Nothing of this module is installed, so there is nothing to remove.',
	start_failed: { text: 'ReCasaOS could not start the job. Nothing was changed.', steps: { start: 'The service of the module would not start.' } },
	internal: 'The request could not be carried out.',
	// the checks of the plan, and the refusals of its disk and apt checks (pkg/osmodule/plan.go)
	catalogue: 'This release of ReCasaOS does not offer this module.',
	os: 'This operating system is not one that the module supports.',
	arch: 'The module has no version for this kind of processor.',
	recasaos: 'This release of ReCasaOS is too old for the module. Update ReCasaOS first.',
	already_installed: 'The module is already installed.',
	foreign_unit: 'A service file with the name of the module is already on this machine and is not the module\'s. Move it away first.',
	disk_short: 'There is not enough room on the disk for the module.',
	disk_unknown: 'The room left on the disk could not be read.',
	apt_missing: 'apt-get is not on this machine, so the packages cannot be installed.',
	apt_failed: 'apt gave no usable answer about the packages. Run apt-get update at a console, then try again.',
	apt_removes: 'Installing the packages would remove other packages, so ReCasaOS does not do it.',
	apt_downgrades: 'Installing the packages would replace some with older versions, so ReCasaOS does not do it.',
	held_package: 'A package that the module needs is on hold. Take the hold off, then try again.',
	package_not_exact: 'apt would install other packages than the ones that the module names, so ReCasaOS does not do it.',
	// the job (pkg/modulecmd/install.go, remove.go)
	confirmation_needed: 'The job needed a confirmation that nobody gave.',
	declined: 'The job was declined.',
	log_unwritable: 'The log of the job could not be written. Nothing was changed.',
	lock_failed: 'ReCasaOS could not take the lock that keeps two jobs from running at once.',
	files_unreadable: 'A file that records an earlier install cannot be read. Look at it at a console, delete it by hand, then try again.',
	state_unsafe: 'The folder where ReCasaOS keeps the state of the modules is not safe to use. Look at it at a console.',
	tmp_unusable: 'The folder where the module is downloaded cannot be used.',
	packages_failed: 'apt could not install the packages. The log below says why.',
	download_failed: 'The module could not be downloaded.',
	download_too_large: 'The download is larger than a module may be, so it was stopped.',
	checksum_mismatch: 'The download is not the file that this release of ReCasaOS expects, so it was thrown away.',
	unpack_failed: 'The files of the module could not be put in place.',
	unpack_path: 'The archive of the module holds a file that a module may not write, so nothing was written.',
	file_exists: 'A file that the module would write is already on this machine and is not the module\'s own, so nothing was written.',
	unpack_limits: 'The archive of the module is larger than a module may be, so nothing was written.',
	unpack_corrupt: 'The archive of the module is damaged, so nothing was written.',
	units_failed: 'systemd could not reload its list of services.',
	manifest_invalid: 'The description of the module in its archive is not valid.',
	manifest_mismatch: 'The description of the module in its archive is not the one that this release of ReCasaOS expects.',
	manifest_write_failed: 'The record of the module could not be written.',
	route_timeout: 'The service of the module started, but it did not answer on the gateway of the dashboard in time.',
	interrupted: 'The job was cut short before it ended.',
	unit_not_stopped: 'The service of the module would not stop, so nothing was deleted.',
	remove_incomplete: 'Some files of the module could not be deleted.',
	internal_error: 'ReCasaOS hit an internal error. The log below may say more.',
}
export const REASON_UNKNOWN = 'ReCasaOS gave a reason that this page does not know: {code}.'

/** The sentence of a code. `step` is the step of a job (the one code that depends on it is start_failed), `data` the core's data of a refusal. */
export function reasonMessage(code, { step = '', data = {} } = {}) {
	const entry = own(REASONS, code)
	if (entry === undefined)
		return msg(REASON_UNKNOWN, { code: clean(code, 60) || '?' })
	if (Array.isArray(entry)) {
		const field = clean(isPlain(data) ? data.field : '', 40)
		return sentenceFor(entry, {}, field ? { field } : {})
	}
	if (isPlain(entry))
		return msg(own(entry.steps, step) ?? entry.text)
	return msg(entry)
}

// ---- the checks of the plan ---------------------------------------------------------------------------------------------

// pkg/osmodule/plan.go Check*, in the order the plan lists them: the topic of each, said before the mark that tells whether it passed
export const CHECKS = {
	catalogue: 'Offered by this release',
	os: 'Operating system',
	arch: 'Processor',
	recasaos: 'Release of ReCasaOS',
	already_installed: 'Not installed yet',
	foreign_unit: 'No service file in the way',
	busy: 'Nothing else at work',
	disk: 'Room on the disk',
	apt: 'Packages that apt can install',
}
export const CHECK_UNKNOWN = 'A check that this page does not know: {code}'
// the refusals that come from a check that says more than its own code
const CHECK_REFUSALS = { disk: ['disk_short', 'disk_unknown'], apt: ['apt_missing', 'apt_failed', 'apt_removes', 'apt_downgrades', 'held_package', 'package_not_exact'] }

// why a check that failed failed, from the code of the check and of the refusal of the plan
function checkFailure(code, refused) {
	if (own(CHECK_REFUSALS, code))
		return CHECK_REFUSALS[code].includes(refused) ? refused : CHECK_REFUSALS[code][0]
	return code
}

function checkView(raw, refused) {
	const code = clean(raw.code, 40)
	// a check that was not made (the plan stopped at an earlier one, or the user cannot look at the locks): not ok, and not the reason of a refusal
	const detail = typeof raw.detail === 'string' ? raw.detail : ''
	const notChecked = raw.ok !== true && /^not_checked(?:\b|$)/.test(detail)
	const ok = raw.ok === true
	const mark = ok ? 'passed' : notChecked ? 'notChecked' : 'failed'
	return {
		code,
		label: own(CHECKS, code) ? msg(CHECKS[code]) : msg(CHECK_UNKNOWN, { code: code || '?' }),
		ok,
		notChecked,
		mark,
		markText: TEXT.marks[mark],
		message: mark === 'failed' ? reasonMessage(checkFailure(code, refused)) : null,
		detail: mark === 'failed' ? line(detail, 200) : '',
	}
}

const MARK_ORDER = { failed: 0, notChecked: 1, passed: 2 }

// ---- the list ---------------------------------------------------------------------------------------------------------

const MAX_MODULES = 64
const MAX_REASONS = 8

function moduleView(raw, catalogueOk) {
	if (!isPlain(raw) || typeof raw.name !== 'string' || !MODULE_NAME.test(raw.name))
		return null
	const system = isPlain(raw.system) ? raw.system : {}
	const reasons = list(system.reasons).filter(code => typeof code === 'string').slice(0, MAX_REASONS).map((code) => {
		const shown = clean(code, 40)
		return { code: shown, message: reasonMessage(shown) }
	})
	const supported = system.supported === true && reasons.length === 0
	const installed = isPlain(raw.installed) ? { version: typeof raw.installed.version === 'string' && TAG.test(raw.installed.version) ? raw.installed.version : '' } : null
	const broken = raw.broken ? (typeof raw.broken === 'string' ? clean(raw.broken, 40) : '') || 'unknown' : ''
	const inCatalogue = raw.catalogue !== false
	return {
		name: raw.name,
		title: clean(raw.title, 80) || raw.name,
		description: clean(raw.description, 400),
		tier: tierOf(raw.tier),
		tag: typeof raw.tag === 'string' && TAG.test(raw.tag) ? raw.tag : '',
		installed,
		supported,
		reasons,
		broken,
		inCatalogue,
		canInstall: catalogueOk && inCatalogue && supported && !installed && !broken,
		canRemove: Boolean(installed) || Boolean(broken),
	}
}

/**
 * The list the core answers: the catalogue of this release joined with what is installed. A catalogue that is not ok offers nothing to install
 * (the core says an empty list, and the dashboard says so whatever it is sent), but what is installed can still be removed. null for something that
 * is not a list.
 */
export function listView(raw) {
	if (!isPlain(raw))
		return null
	const catalogue = isPlain(raw.catalogue) ? raw.catalogue : {}
	const ok = catalogue.ok === true
	const seen = new Set()
	const modules = list(raw.modules).slice(0, MAX_MODULES).map(item => moduleView(item, ok)).filter((item) => {
		if (!item || seen.has(item.name))
			return false
		seen.add(item.name)
		return true
	})
	return { ok, error: ok ? '' : clean(catalogue.error, 20), modules: ok ? modules : modules.filter(item => item.canRemove) }
}

// ---- the plan -----------------------------------------------------------------------------------------------------------

const MAX_PACKAGES = 100

function packageNames(value) {
	const names = list(value).filter(name => typeof name === 'string').map(name => clean(name, 80)).filter(Boolean)
	return { names: names.slice(0, MAX_PACKAGES), more: Math.max(0, names.length - MAX_PACKAGES) }
}

/**
 * The plan of an install, as the core answers it (a refused plan is a plan too). null for something that is not the plan of that module. It can
 * install only when it is not refused, every check passed and its id is the shape of the core's: anything else shows its reasons and no button.
 */
export function modulePlanView(raw, { name = '', locale = 'en_us' } = {}) {
	if (!isPlain(raw) || raw.name !== name)
		return null
	const refused = raw.refused === null || raw.refused === undefined || raw.refused === '' ? '' : (typeof raw.refused === 'string' ? clean(raw.refused, 60) : '') || 'unknown'
	const checks = list(raw.checks).filter(isPlain).slice(0, 20).map(check => checkView(check, refused)).sort((a, b) => MARK_ORDER[a.mark] - MARK_ORDER[b.mark])
	const apt = isPlain(raw.packages) ? raw.packages : {}
	const install = packageNames(apt.to_install)
	const upgrade = packageNames(apt.to_upgrade)
	const archive = isPlain(raw.archive) ? raw.archive : {}
	const planId = typeof raw.plan_id === 'string' && PLAN_ID.test(raw.plan_id) ? raw.plan_id : ''
	const known = apt.known === true
	return {
		name,
		tier: tierOf(raw.tier),
		refused,
		refusedMessage: refused ? reasonMessage(refused) : null,
		checks,
		// a plan that did not check everything is not one to confirm (the core checks again when it is asked to install)
		incomplete: !refused && (checks.length === 0 || checks.some(check => !check.ok)),
		packages: {
			install: install.names,
			upgrade: upgrade.names,
			moreInstall: install.more,
			moreUpgrade: upgrade.more,
			known,
			downloadText: known ? formatBytes(size(apt.download_bytes), locale) : '',
			extraText: known ? formatBytes(size(apt.extra_bytes), locale) : '',
		},
		archive: { url: line(archive.url, 200), bytesText: formatBytes(size(archive.bytes), locale) },
		planId,
		installable: !refused && Boolean(planId) && checks.length > 0 && checks.every(check => check.ok),
	}
}

/** The body of the install call, from the plan that is on the screen: its own id and nothing else; null when that plan cannot install. */
export function installBody(plan) {
	return isPlain(plan) && plan.installable === true && typeof plan.planId === 'string' && PLAN_ID.test(plan.planId) ? { plan_id: plan.planId } : null
}

// ---- the job ------------------------------------------------------------------------------------------------------------

// pkg/modulecmd/install.go Step*, remove.go Step*: the steps of an install and of a remove, in order. `done` is the end of both, not a step of the list.
export const STEPS = {
	install: ['packages', 'download', 'verify', 'unpack', 'units', 'manifest', 'start', 'route'],
	remove: ['stop', 'files', 'manifest', 'reload'],
}
export const ROLLBACK = 'rollback_'
export const STEP_TEXTS = {
	install: {
		packages: 'Install the packages that the module needs',
		download: 'Download the module',
		verify: 'Check the download',
		unpack: 'Put the files of the module in place',
		units: 'Tell systemd about the service of the module',
		manifest: 'Record the module',
		start: 'Start the service of the module',
		route: 'Wait for the service to answer',
	},
	remove: {
		stop: 'Stop the service of the module',
		files: 'Delete the files of the module',
		manifest: 'Forget the module',
		reload: 'Tell systemd that the service is gone',
	},
	// a step of a job whose kind is not known, and the end of every job
	any: {
		manifest: 'Update the record of the module',
		done: 'Done',
	},
}
export const STEP_UNKNOWN = 'A step that this page does not know: {code}'

// the steps that say which kind of job it is; manifest and done are in both
const INSTALL_ONLY = new Set(['packages', 'download', 'verify', 'unpack', 'units', 'start', 'route'])
const REMOVE_ONLY = new Set(['stop', 'files', 'reload'])

function stepMessage(kind, step) {
	const text = own(STEP_TEXTS[kind] ?? {}, step) ?? own(STEP_TEXTS.any, step)
	return text ? msg(text) : msg(STEP_UNKNOWN, { code: step || '?' })
}

/**
 * The kind of a job, install or remove, which the core does not say: the step says it where it can (the steps of a rollback are an install's), then
 * what the page remembers of the call it made, then, for a job that ended, whether the module is installed. '' when it cannot be told.
 */
function kindOf(step, remembered, installed, finishedAtDone) {
	if (INSTALL_ONLY.has(step) || step.startsWith(ROLLBACK))
		return 'install'
	if (REMOVE_ONLY.has(step))
		return 'remove'
	if (remembered === 'install' || remembered === 'remove')
		return remembered
	if (finishedAtDone && typeof installed === 'boolean')
		return installed ? 'install' : 'remove'
	return ''
}

// pkg/modulecmd/jobstate.go Job*
export const JOB_STATES = {
	idle: { group: 'No job', tone: '' },
	running: { group: 'In progress', tone: 'is-info' },
	succeeded: { group: 'Finished', tone: 'is-success' },
	refused: { group: 'Refused', tone: 'is-warning' },
	failed: { group: 'Stopped', tone: 'is-danger' },
	interrupted: { group: 'Cut short', tone: 'is-danger' },
}
export const JOB_STATE_UNKNOWN = { group: 'Unknown state', tone: 'is-warning' }

export const JOB_TITLES = {
	idle: { any: 'No job ran on {module}.' },
	running: { install: 'Installing {module}', remove: 'Removing {module}', any: 'A job is running on {module}' },
	succeeded: { install: '{module} is installed.', remove: '{module} is removed.', any: 'The job on {module} is done.' },
	refused: { any: 'The job on {module} was refused. Nothing was changed.' },
	failed: { install: 'The install of {module} stopped.', remove: 'The removal of {module} stopped.', any: 'The job on {module} stopped.' },
	interrupted: { any: 'The job on {module} was cut short.' },
}
export const JOB_LIVE = {
	step: '{module}: step {index} of {total}, {step}.',
	rollback: '{module}: undoing the install, {step}.',
}
// what to do, after a job that ended
export const JOB_NEXT = {
	succeededInstall: 'The card of the module appears on the dashboard once its service answers.',
	succeededRemove: 'The packages that the module installed and its data are still on the machine.',
	undone: 'What the install had done was undone. Mend the cause, then install again.',
	nothingToUndo: 'Nothing had been changed, so there was nothing to undo.',
	notUndone: 'Undoing the install did not finish: some files of the module may still be on the machine.',
	cutShort: 'Nothing was undone.',
}

// how a step is marked in the list: a word and an icon beside the sentence, so that colour is never alone
export const STEP_MARKS = {
	done: { text: 'Done', icon: 'check-circle-outline' },
	current: { text: 'Now', icon: 'arrow-right-circle-outline' },
	pending: { text: 'Not yet', icon: 'circle-outline' },
	failed: { text: 'Failed here', icon: 'alert-circle-outline' },
	stopped: { text: 'Cut short here', icon: 'stop-circle-outline' },
	skipped: { text: 'Not reached', icon: 'minus-circle-outline' },
}

function stepsOf(kind, state, step) {
	const ids = own(STEPS, kind)
	if (!ids || step.startsWith(ROLLBACK))
		return []
	const at = ids.indexOf(step)
	const ended = state === 'failed' || state === 'interrupted' || state === 'refused'
	const all = state === 'succeeded' || step === 'done'
	return ids.map((id, index) => {
		let mark
		if (all)
			mark = 'done'
		else if (at < 0 || index > at)
			mark = ended ? 'skipped' : 'pending'
		else if (index < at)
			mark = 'done'
		else
			mark = state === 'failed' ? 'failed' : state === 'interrupted' ? 'stopped' : 'current'
		return { id, text: stepMessage(kind, id).key, mark, markText: STEP_MARKS[mark].text, icon: STEP_MARKS[mark].icon }
	})
}

const MAX_LOG_LINES = 20
const MAX_KEPT = 40

function keptOf(raw, kind, state) {
	if (state !== 'failed' || kind === 'remove')
		return null
	if (!Array.isArray(raw))
		return { known: false, names: '', command: '', unsafe: false }
	const names = raw.filter(name => typeof name === 'string').map(name => clean(name, 80)).filter(Boolean).slice(0, MAX_KEPT)
	// a command is run by whoever pastes it: it is given only when every name is a package name, whole
	const safe = names.length === raw.length && names.every(name => PACKAGE_NAME.test(name))
	return { known: true, names: names.join(', '), count: names.length, command: safe && names.length ? `apt-get purge ${names.join(' ')}` : '', unsafe: !safe }
}

/**
 * The job of a module, from the answer of the status (or of an install and a remove, which answer the same): { job, status }. `kind` is what the page
 * remembers of the call it made ('install', 'remove' or ''). null for something that is not the job of that module: its name is checked, so that the
 * answer for another module is never taken for this one's.
 */
export function jobView(raw, { name = '', title = '', kind = '', locale = 'en_us' } = {}) {
	const job = isPlain(raw) && isPlain(raw.job) ? raw.job : null
	if (!job || job.name !== name || typeof job.state !== 'string')
		return null
	const status = isPlain(raw.status) ? raw.status : {}
	const state = job.state
	const known = Boolean(own(JOB_STATES, state))
	const step = typeof job.step === 'string' && STEP_WORD.test(job.step) ? job.step : ''
	const code = typeof job.code === 'string' && CODE_WORD.test(job.code) ? job.code : ''
	const codeText = clean(job.code, 60)
	const undo = job.undo === 'rolled_back' || job.undo === 'rollback_incomplete' ? job.undo : (typeof job.undo === 'string' && job.undo ? 'rollback_incomplete' : '')
	const running = state === 'running'
	const finished = state === 'succeeded' || state === 'refused' || state === 'failed' || state === 'interrupted'
	const rollback = step.startsWith(ROLLBACK)
	const module = clean(title, 80) || name
	const jobKind = kindOf(step, kind, status.installed, finished && step === 'done')
	const group = known ? JOB_STATES[state] : JOB_STATE_UNKNOWN
	const titles = own(JOB_TITLES, state) ?? { any: TEXT.job.unknownState }
	const stepList = stepsOf(jobKind, state, step)
	const at = own(STEPS, jobKind)?.indexOf(step) ?? -1
	const total = own(STEPS, jobKind)?.length ?? 0
	// the steps of a rollback are those of a remove
	const stepText = rollback ? stepMessage('remove', step.slice(ROLLBACK.length)) : stepMessage(jobKind, step)
	const titleMessage = msg(titles[jobKind] ?? titles.any, { module })
	let live = titleMessage
	if (running && rollback)
		live = msg(JOB_LIVE.rollback, { module, step: stepText.key }, ['step'])
	else if (running && at >= 0)
		live = msg(JOB_LIVE.step, { module, index: String(at + 1), total: String(total), step: stepText.key }, ['step'])
	// what the sentences say about the end of a job that failed or was cut short
	const failed = state === 'failed'
	const cutShort = state === 'interrupted'
	// a job that was refused or stopped says why
	const ended = failed || state === 'refused'
	let undoText = null
	if (failed && jobKind !== 'remove')
		undoText = msg(undo === 'rolled_back' ? JOB_NEXT.undone : undo ? JOB_NEXT.notUndone : JOB_NEXT.nothingToUndo)
	else if (cutShort)
		undoText = msg(JOB_NEXT.cutShort)
	let next = null
	if (state === 'succeeded')
		next = jobKind === 'install' ? msg(JOB_NEXT.succeededInstall) : jobKind === 'remove' ? msg(JOB_NEXT.succeededRemove) : null
	// the console finishes what the page cannot: a rollback that did not end, a job cut short, a removal that stopped
	const advice = MODULE_NAME.test(name) && (cutShort || (failed && (undo === 'rollback_incomplete' || jobKind === 'remove'))) ? { command: `casaos module remove ${name}` } : null
	return {
		name,
		state,
		known,
		running,
		finished,
		step,
		rollback,
		kind: jobKind,
		title: titleMessage,
		group: group.group,
		tone: group.tone,
		progress: running && !rollback && at >= 0 ? { value: at, max: total, label: msg(jobKind === 'install' ? TEXT.job.progressInstall : TEXT.job.progressRemove, { index: String(at + 1), total: String(total) }) } : null,
		steps: stepList,
		rollbackStep: running && rollback ? msg(TEXT.job.rollback, { step: stepText.key }, ['step']) : null,
		stoppedAt: (failed || cutShort) && step ? msg(TEXT.job.stoppedAt, { step: stepText.key }, ['step']) : null,
		live,
		reason: ended && code ? reasonMessage(code, { step }) : (ended && codeText ? msg(REASON_UNKNOWN, { code: codeText }) : null),
		code: ended ? codeText : '',
		undoText,
		kept: keptOf(job.kept_packages, jobKind, state),
		next,
		advice,
		logTail: list(job.log_tail).filter(item => typeof item === 'string').slice(-MAX_LOG_LINES).map(item => line(item)).filter(Boolean),
		startedAt: formatMoment(job.started_at, locale),
		endedAt: formatMoment(job.ended_at, locale),
		changeKey: [state, step, code, undo].join('|'),
	}
}

/** The sentence for the live region when the job changed between two views: one per change, none per poll. */
export function jobAnnouncement(previous, next) {
	if (!next || (previous && previous.changeKey === next.changeKey))
		return null
	return next.live
}

// ---- polling --------------------------------------------------------------------------------------------------------------

/** How long to wait before asking for the job again, once the last answer was a good one. The sad delay is the OS page's. */
export const MODULE_POLL_MS = { running: 2000 }

/**
 * When to ask for the job of a module next: never while the document is hidden (the page asks at once when it is shown again, with `last` back to
 * 'none') or while no job is followed, at once when nothing was asked yet, 10 seconds after an error whatever else is true, then 2 seconds.
 * `last` is 'none', 'ok' or 'error'; anything else is an error.
 */
export function nextJobPoll(last, options = {}) {
	const { hidden = false, running = false } = isPlain(options) ? options : {}
	if (hidden || !running)
		return null
	if (last === 'none')
		return 0
	return last === 'ok' ? MODULE_POLL_MS.running : POLL_MS.error
}

/**
 * What to say while the job cannot be read: the OS page's rules (a core that restarts is not an error, and after fifteen minutes the person is sent to the
 * machine), in the words of a job. `kind` is statusFailure of the error and `elapsedMs` the time since the silence began. A job is being followed, so the
 * page is in the case of a run that is open.
 */
export function moduleOutage({ kind, elapsedMs = 0 }) {
	const view = outageView({ kind, elapsedMs, last: { open: true } })
	const message = view.level === 'unreadable' ? msg(TEXT.outage.unreadable) : view.level === 'signin' ? msg(TEXT.outage.signin) : view.message
	return { ...view, message }
}

// ---- when a call fails ----------------------------------------------------------------------------------------------------

/**
 * What a call that failed says. A refusal of the core (400, 409 or 500 with `data.error_code`) is the sentence of its code, with the checks that failed as
 * `items` when it names them, and for `busy` what the core saw, as text in `detail` (the core says it in English prose, which is never matched).
 * Anything else is a call that did not go through, told as the OS page tells it. Never the core's own words (`data.error`).
 */
export function moduleFailure(error, locale = 'en_us', { read = false } = {}) {
	const base = failureOf(error, locale, { read })
	if (base.kind === 'unavailable')
		return { ...base, message: msg(TEXT.unavailable), detail: '' }
	if (base.kind !== 'refusal')
		return { ...base, detail: '' }
	const body = error?.response?.data?.data
	const data = isPlain(body) && isPlain(body.data) ? body.data : {}
	const items = list(data.checks).filter(isPlain).slice(0, 20).map(check => checkView(check, base.code)).filter(check => check.mark === 'failed').map(check => ({ code: check.code, message: check.message }))
	return { kind: 'refusal', status: base.status, code: base.code, message: reasonMessage(base.code, { data }), items, detail: base.code === 'busy' ? line(data.reason, 200) : '' }
}

// ---- every key ------------------------------------------------------------------------------------------------------------

// Every string of a table that is only strings (a key, a list of keys, a table of such), for the language files' test.
function strings(value) {
	if (typeof value === 'string')
		return [value]
	if (Array.isArray(value))
		return value.flatMap(strings)
	if (isPlain(value))
		return Object.values(value).flatMap(strings)
	return []
}

/**
 * Every language-file key that this module says, once. The component looks up no other key for the modules; the language files have each of them in
 * English (as itself) and in French. The buttons and the words every window shares (Install, Remove, Close, Cancel, Try again, Copy) are theirs already.
 */
export const MODULE_KEYS = [...new Set([
	...strings(TEXT),
	...strings(TIERS),
	...strings(TIER_UNKNOWN),
	...strings(REASONS),
	REASON_UNKNOWN,
	...strings(CHECKS),
	CHECK_UNKNOWN,
	...strings(STEP_TEXTS),
	STEP_UNKNOWN,
	...Object.values(JOB_STATES).map(state => state.group),
	JOB_STATE_UNKNOWN.group,
	...strings(JOB_TITLES),
	...strings(JOB_LIVE),
	...strings(JOB_NEXT),
	...Object.values(STEP_MARKS).map(mark => mark.text),
])]
