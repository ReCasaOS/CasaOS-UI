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
 * Fail closed, here as in the core: a plan installs only when it is not refused, every check passed, it lists its packages and its id has the
 * shape of the core's; a module is installable only when the list says so in every field; a job whose state is not one of the core's has no
 * step and no button.
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
 *                 reasons: [{ code, message }], broken, inCatalogue, update: { installed, latest } | null, canInstall, canUpdate, canRemove }
 *       `update` is there only when the core says an update is available AND the two tags say it too (the latest is strictly later than the
 *       installed one, which is the version the list shows).
 *   The plan
 *     modulePlanView(raw, { name, locale, mode }) -> plan | null   null for what is not the plan of that module in that mode ('install', or 'update':
 *                                                              a plan of the other mode is never taken for this one)
 *       plan: { name, mode, update: { installed, latest, added, dropped, moreAdded, moreDropped } | null, tag, tier, refused, refusedMessage, unhold: { command } | null, checks: [{ code, label, ok, notChecked, mark, markText, message,
 *               detail, detailMessage }], incomplete, noList, noId, packages: { listed, install, upgrade, moreInstall, moreUpgrade, known, downloadText,
 *               extraText }, archive: { url, bytesText }, planId, installable }
 *     installBody(plan) -> { plan_id } | { plan_id, mode: 'update' } | null   the body of the install call: the displayed plan's id (and the mode of an
 *                                                              update), and nothing if it cannot install
 *   The job
 *     jobView(raw, { name, title, kind, locale }) -> job | null
 *       job: { name, state, stateText, stateClass, known, running, finished, dismissible, step, rollback, kind, title, group, tone, progress: { value,
 *              max, label } | null, steps: [{ id, text, mark, markText, icon }], rollbackStep, stoppedAt, live, reason, code, undoText, kept: { known,
 *              names, count, command, unsafe } | null, next, advice: { command } | null, logTail, startedAt, startedAtRaw, endedAt, changeKey }
 *       The core says whether the job is an install, a remove or an update (`job.kind`, empty when it cannot tell). Only when it does not, `kind` is told
 *       from the step, then from what the page remembers of its call. A job whose kind is still not known says neither.
 *     jobAnnouncement(previous, next) -> message | null         one per change of the job, none per poll
 *   Polling
 *     nextJobPoll(last, { hidden, running }) -> milliseconds | null
 *     moduleStatusFailure(error) -> { kind, code }               why the job could not be read: signin | unavailable | error | down | failed
 *     moduleOutage({ kind, code, elapsedMs }) -> { level, message, elapsed, code }   what to say while the job cannot be read
 *   When a call fails
 *     moduleFailure(error, locale, { read, mutating }) -> { kind, status, code, message, items, detail, busy, unhold }
 *     reasonMessage(code, { step, data }) -> message
 *   Sizes
 *     formatBytes(bytes, locale) -> '12 MiB', '3 KiB', '1,5 Gio'
 *   The tables, for the component and the tests
 *     TEXT, TIERS, STEPS, STEP_TEXTS, STEP_MARKS, JOB_STATES, JOB_TITLES, REASONS, CHECKS, MODULE_KEYS (every key the tables say, for the language files' test)
 */

import { clean, safe, sentenceFor } from './osPlan'
import { formatMoment, formatSize } from './osReadiness'
import { POLL_MS, RESTART_LOOK_AFTER_MS, failureOf, formatElapsed } from './osUpgrade'

// ---- small tools ----------------------------------------------------------------------------------------------------

// Only the own properties of a table: a code named like an Object method is not one.
function own(table, key) {
	return typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined
}

const isPlain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const list = value => Array.isArray(value) ? value : []
const msg = (key, params = {}, keys = undefined) => keys ? { key, params, keys } : { key, params }
const size = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null

// the rules of the core's names (pkg/osmodule): a module, a plan, a tag
export const MODULE_NAME = /^[a-z][a-z0-9-]{0,31}$/
export const PLAN_ID = /^m1-[0-9a-f]{32}$/
const TAG = /^v\d+\.\d+\.\d+$/
// a step and a code are words of lower case letters, digits and underscores (pkg/modulecmd/jobstate.go)
const STEP_WORD = /^[a-z][a-z_]{0,31}$/
const CODE_WORD = /^[a-z][a-z0-9_]{0,47}$/

// A package name as the core takes it (pkg/osmodule/manifest.go ValidPackageName): two to 64 characters, and not one that apt reads as an order
// (a name that ends in a dash or a plus sign) or as the path of a file (one that ends in .deb).
const PACKAGE_NAME = /^[a-z0-9][a-z0-9+.-]{1,63}$/
const validPackage = name => typeof name === 'string' && PACKAGE_NAME.test(name) && !/(?:[-+]|\.deb)$/.test(name)

// What a line of a log is shown as: an address loses its user and its query before the line is cut, the control characters and the marks that turn
// the text round become spaces. (The core does this too; the dashboard says it again whatever the core sent.) It is the plan window's own tool.
const line = (value, max = 240) => safe(value, max)

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
	jobRunning: 'A job is running. The buttons come back when it ends. Closing this window does not stop it: open the window again to see how it goes.',
	checking: 'Looking for a job that is already running…',
	reported: 'Reported by ReCasaOS',
	checkAgain: 'Check again',
	busyHeading: 'The machine is busy',
	unavailable: 'This version of ReCasaOS cannot install modules yet. Update ReCasaOS, then try again.',
	// what the plan says of the thing that keeps the machine busy (the details of the check, pkg/osmodule/plan.go busyCheck)
	busy: {
		package_manager: 'A package manager (apt or dpkg) is at work.',
		os_upgrade: 'An upgrade of the operating system is open.',
		unreadable: 'ReCasaOS could not tell whether something else is at work.',
	},
	// what a call says when it got no answer: a read changed nothing, a call that changes the machine may have been carried out
	call: {
		maybe: 'ReCasaOS did not answer in time, so the request may have gone through. Look at the list for a job before you try again.',
		readFailed: 'ReCasaOS did not answer, or its answer could not be read. Nothing was changed. Try again.',
	},
	checks: {
		recasaosUnknown: 'ReCasaOS cannot tell its own version, so it cannot tell whether the module fits it.',
		disk: 'Room needed on {path}: {needed}. Room free: {free}.',
	},
	plan: {
		title: 'Install {module}',
		planning: 'ReCasaOS is working out what the install would do. This can take up to a minute, and nothing is changed.',
		planningLabel: 'Making the plan',
		ready: 'The plan for {module} is ready. Read it, then confirm.',
		intro: 'This is what the install does. Read it, then confirm.',
		starting: 'ReCasaOS is making the plan again and starting the install. This can take up to two minutes. Do not switch the machine off.',
		startingLabel: 'Starting the install',
		cancelled: 'The plan was cancelled here, but ReCasaOS may still be working on it for up to a minute. Wait before you ask for another plan.',
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
		noList: 'The plan does not say which packages apt installs, so it cannot be confirmed. Try again.',
		noId: 'The plan has no valid identifier, so the module cannot be installed from it. Try again.',
		refusedHeading: 'This module cannot be installed now.',
		about: 'What the module says about itself',
		consequences: 'What the install does to the machine',
		consequencesText: 'It runs apt as root to install the packages above. It puts a program in /usr/bin and the service of the module in /usr/lib/systemd/system, and it enables and starts that service, which then also starts when the machine boots. Do not switch the machine off while it runs.',
		stay: 'The packages stay on the machine if you remove the module later.',
		unhold: 'To take the hold off, run this command as root at a console of the machine, then try again. ReCasaOS never runs it.',
		ok: 'Install the module',
	},
	remove: {
		title: 'Remove {module}?',
		stops: 'The module stops, and the files it put on the machine are deleted.',
		stays: 'The packages it installed and the data of the module are not removed.',
		about: 'What the module says about itself',
		starting: 'ReCasaOS is starting the removal. This can take a minute.',
		startingLabel: 'Starting the removal',
		ok: 'Remove the module',
	},
	update: {
		title: 'Update {module}',
		badge: 'Version {latest} available',
		planning: 'ReCasaOS is working out what the update would do. This can take up to a minute, and nothing is changed.',
		planningLabel: 'Making the plan',
		ready: 'The plan for the update of {module} is ready. Read it, then confirm.',
		intro: 'This is what the update does. Read it, then confirm.',
		starting: 'ReCasaOS is making the plan again and starting the update. This can take up to two minutes. Do not switch the machine off.',
		startingLabel: 'Starting the update',
		added: 'These packages will be installed',
		addedNone: 'No package to install',
		dropped: 'Packages that the new version no longer names',
		droppedNote: 'They stay on the machine: ReCasaOS never removes a package.',
		consequences: 'What the update does to the machine',
		stops: 'The service of the module stops for a moment, then starts again.',
		machines: 'This page does not touch the machines that the module runs, but the service that manages them is stopped for a moment: check that this is a good time.',
		config: 'The configuration that you set for the module, and its data, are kept.',
		back: 'If something fails, the old version is put back.',
		keepOn: 'Do not switch the machine off while it runs.',
		ok: 'Update the module',
	},
	marks: { passed: 'Passed', failed: 'Failed', notChecked: 'Not checked' },
	outage: {
		unreadable: 'The state of the job could not be read just now. This page tries again by itself.',
		signin: 'Your session has ended. Sign in again to see the job.',
		down: 'ReCasaOS does not answer. It may be restarting. This page tries again by itself.',
		error: 'ReCasaOS answered with an error. This page tries again by itself.',
		look: 'ReCasaOS has not answered for {time}. Look at the machine: it may be off, or still restarting. This page keeps trying.',
		elapsed: 'No answer for {time}.',
	},
	job: {
		started: 'Started',
		log: 'End of the log of the job',
		noLog: 'The job has printed nothing yet.',
		close: 'Close this report',
		rollback: 'Undoing the install: {step}',
		progressInstall: 'Progress of the install: step {index} of {total}',
		progressRemove: 'Progress of the removal: step {index} of {total}',
		progressRollback: 'Progress of the undo: step {index} of {total}',
		progressUpdate: 'Progress of the update: step {index} of {total}',
		putBack: 'Putting the old version back.',
		folder: 'The folder that is kept',
		leftFiles: 'Files that were left as they are',
		stoppedAt: 'It stopped at: {step}',
		unknownState: 'This page does not know the state of this job.',
		advice: 'Run this command as root at a console of the machine. It finishes the cleaning. Then try again.',
		keptSome: 'These are the packages the module needs: {names}. Some may have been on the machine before the install.',
		keptOne: 'This is the package the module needs: {names}. It may have been on the machine before the install.',
		keptNone: 'The install left no package on the machine.',
		keptUnknown: 'Which packages the install left on the machine could not be told. The log below may say.',
		keptUnsafe: 'Some of their names are not valid package names, so no command is given. Look at the log below.',
		purge: 'To purge them, run this command as root at a console of the machine. ReCasaOS never runs it. Purging also deletes their configuration files, and other software may use these packages: read what apt says before you agree.',
		purgeOne: 'To purge it, run this command as root at a console of the machine. ReCasaOS never runs it. Purging also deletes its configuration files, and other software may use this package: read what apt says before you agree.',
	},
}

export const TIERS = {
	core: { label: 'Maintained by ReCasaOS', sentence: 'Proved on a real machine by ReCasaOS.' },
	community: { label: 'Community', sentence: 'Tested only against a simulated machine, not a real one.' },
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
// the step it came with. What a sentence says of what was written is said by the `undo` of the job, and not here: the same code can come with a
// job that wrote nothing and with one that wrote a part.
export const REASONS = {
	// the requests (service/system_module.go, route/v1/system_module.go)
	bad_request: ['ReCasaOS did not accept a field of the request ({field}).', 'ReCasaOS did not accept the request.'],
	not_root: 'ReCasaOS does not run as root on this machine, so it cannot install or remove a module.',
	unsupported: 'This machine cannot install modules: it needs Debian or Ubuntu with apt-get and systemd.',
	busy: 'Something else is at work on this machine, such as an upgrade of the operating system, a package update or another module job. Wait for it to end, then try again.',
	plan_changed: 'The plan changed after you read it. Read the new plan, then confirm again.',
	plan_timeout: 'The plan took too long to make. Try again in a moment.',
	not_installed: 'Nothing of this module is installed, so there is nothing to remove or to update.',
	start_failed: { text: 'ReCasaOS could not start the job. Nothing was changed.', steps: { start: 'The service of the module would not start.' } },
	internal: 'The request could not be carried out.',
	// the checks of the plan, and the refusals of its disk and apt checks (pkg/osmodule/plan.go)
	catalogue: 'This release of ReCasaOS does not offer this module.',
	os: 'This operating system is not one that the module supports.',
	arch: 'The module has no version for this kind of processor.',
	recasaos: 'This release of ReCasaOS is too old for the module. Update ReCasaOS first.',
	already_installed: 'The module is already installed.',
	foreign_unit: 'A service file with the name of the module is already on this machine and is not the module\'s. Move it away first.',
	dpkg_state: 'The package manager could not be asked whether an install was left half done. Try again.',
	dpkg_broken: 'The package manager was left half done by an earlier install, and ReCasaOS could not finish it. Run dpkg --configure -a at a console, then try again.',
	disk_short: 'There is not enough room on the disk for the module.',
	disk_unknown: 'The room left on the disk could not be read.',
	apt_missing: 'apt-get is not on this machine, so the packages cannot be installed.',
	apt_failed: 'apt could not plan the install: read what it says below. If it names unmet dependencies, apt-get update will not help.',
	apt_removes: 'Installing the packages would remove other packages, so ReCasaOS does not do it.',
	apt_downgrades: 'Installing the packages would replace some with older versions, so ReCasaOS does not do it.',
	held_package: 'A package that the module needs is on hold. Take the hold off, then try again.',
	package_not_exact: 'apt would install other packages than the ones that the module names, so ReCasaOS does not do it.',
	// the job (pkg/modulecmd/install.go, remove.go)
	confirmation_needed: 'The job needed a confirmation that nobody gave.',
	declined: 'The job was declined.',
	log_unwritable: 'The log of the job could not be written. Nothing was changed.',
	lock_failed: 'ReCasaOS could not take the lock that keeps two jobs from running at once.',
	files_unreadable: {
		text: 'A file that records an earlier install cannot be read. Look at it at a console, delete it by hand, then try again.',
		kinds: { update: 'The record of the installed module cannot be read, or a file that it lists is missing or cannot be read. Nothing was changed. Look at it at a console, delete it by hand, remove the module, then install it again.' },
	},
	files_unverified: 'The record of this module is of an older kind, so ReCasaOS cannot check its files. Remove the module, then install it again.',
	up_to_date: 'The module is already at the version that this release offers.',
	downgrade: 'The installed version is later than the one this release offers, and ReCasaOS never takes a module back to an earlier version.',
	version_unknown: 'ReCasaOS cannot read the installed version of this module. Remove the module, then install it again.',
	unit_changed: 'The new version names another service than the one that is installed, so ReCasaOS does not update it in place.',
	backup_failed: 'ReCasaOS could not make a copy of the files that the update replaces.',
	swap_failed: 'The files of the new version could not be put in place.',
	recovery_incomplete: 'ReCasaOS could not finish putting back the version that an earlier update replaced, or the copy of that version cannot be read.',
	state_unsafe: 'The folder where ReCasaOS keeps the state of the modules is not safe to use. Look at it at a console.',
	tmp_unusable: 'The folder where the module is downloaded cannot be used.',
	packages_failed: 'apt could not install the packages. The log below says why.',
	download_failed: 'The module could not be downloaded.',
	download_too_large: 'The download is larger than a module may be, so it was stopped.',
	checksum_mismatch: 'The downloaded file is not the one this release expects, so the module was not installed. Try again later; if it happens again, report it.',
	unpack_failed: 'The files of the module could not be put in place.',
	unpack_path: 'The archive of the module holds a file that a module may not write.',
	file_exists: 'A file that the module would write is already on this machine and is not the module\'s own.',
	unpack_limits: 'The archive of the module is larger than a module may be.',
	unpack_corrupt: 'The archive of the module is damaged.',
	units_failed: 'systemd could not reload its list of services.',
	manifest_invalid: 'The description of the module, in its archive or on this machine, is not valid.',
	manifest_mismatch: 'The description of the module in its archive is not the one that this release of ReCasaOS expects.',
	manifest_write_failed: 'The record of the module could not be written.',
	route_timeout: 'The service of the module started, but it did not answer on the gateway of the dashboard in time.',
	interrupted: 'The job was cut short before it ended.',
	unit_not_stopped: 'The service of the module would not stop, so nothing was deleted.',
	remove_incomplete: { text: 'Some files of the module could not be deleted.', steps: { leftovers: 'The module was removed, but some files of an unfinished update were left: they are named in the log below.' } },
	backup_not_dropped: 'The backup of the old version could not be deleted.',
	internal_error: 'ReCasaOS hit an internal error. The log below may say more.',
}
export const REASON_UNKNOWN = 'ReCasaOS gave a reason that this page does not know: {code}.'

/** The sentence of a code. `step` is the step of a job (start_failed depends on it), `kind` the kind of the job or of the plan (files_unreadable depends on it), `data` the core's data of a refusal. */
export function reasonMessage(code, { step = '', data = {}, kind = '' } = {}) {
	const entry = own(REASONS, code)
	if (entry === undefined)
		return msg(REASON_UNKNOWN, { code: clean(code, 60) || '?' })
	if (Array.isArray(entry)) {
		const field = clean(isPlain(data) ? data.field : '', 40)
		return sentenceFor(entry, {}, field ? { field } : {})
	}
	if (isPlain(entry))
		return msg(own(entry.steps ?? {}, step) ?? own(entry.kinds ?? {}, kind) ?? entry.text)
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
	installed: 'Installed, and its files can be checked',
	newer: 'A later version is offered',
	foreign_unit: 'No service file in the way',
	busy: 'Nothing else at work',
	dpkg_state: 'Package manager in good order',
	disk: 'Room on the disk',
	apt: 'Packages that apt can install',
}
export const CHECK_UNKNOWN = 'A check that this page does not know: {code}'
// the refusals that come from a check that says more than its own code
const CHECK_REFUSALS = {
	installed: ['not_installed', 'manifest_invalid', 'files_unverified', 'files_unreadable'],
	newer: ['up_to_date', 'downgrade', 'version_unknown'],
	foreign_unit: ['foreign_unit', 'unit_changed'],
	disk: ['disk_short', 'disk_unknown'],
	apt: ['apt_missing', 'apt_failed', 'apt_removes', 'apt_downgrades', 'held_package', 'package_not_exact'],
}

// why a check that failed failed, from the code of the check and of the refusal of the plan
function checkFailure(code, refused) {
	if (own(CHECK_REFUSALS, code))
		return CHECK_REFUSALS[code].includes(refused) ? refused : CHECK_REFUSALS[code][0]
	return code
}

// the detail of the disk check that says the sizes (pkg/osmodule/plan.go diskCheck), in bytes
const DISK_DETAIL = /^need (\d{1,15}) bytes on (\/[\w./-]{1,100}), (\d{1,15}) free$/

// What the core says in the detail of a check, in the words of the language where the core's words are a closed set: the thing that keeps the machine
// busy, the room that is needed and free (in the units the plan says its sizes in). null for any other detail, which is shown as it came, as text.
function detailMessage(code, detail, locale) {
	const text = detail.trim()
	if (code === 'busy')
		return own(TEXT.busy, text) ? msg(TEXT.busy[text]) : null
	if (code === 'disk') {
		const found = DISK_DETAIL.exec(text)
		if (found)
			return msg(TEXT.checks.disk, { path: found[2], needed: formatBytes(Number(found[1]), locale), free: formatBytes(Number(found[3]), locale) })
	}
	return null
}

// the sentence of a check that failed: a release that the machine cannot tell is not a release that is too old
function failureMessage(code, refused, detail, kind) {
	if (code === 'recasaos' && detail.trim() === 'unknown')
		return msg(TEXT.checks.recasaosUnknown)
	return reasonMessage(checkFailure(code, refused), { kind })
}

function checkView(raw, refused, locale, kind = '') {
	const code = clean(raw.code, 40)
	// a check that was not made (the plan stopped at an earlier one, or the user cannot look at the locks): not ok, and not the reason of a refusal
	const detail = typeof raw.detail === 'string' ? raw.detail : ''
	const notChecked = raw.ok !== true && /^not_checked(?:\b|$)/.test(detail)
	const ok = raw.ok === true
	const mark = ok ? 'passed' : notChecked ? 'notChecked' : 'failed'
	const failed = mark === 'failed'
	return {
		code,
		label: own(CHECKS, code) ? msg(CHECKS[code]) : msg(CHECK_UNKNOWN, { code: code || '?' }),
		ok,
		notChecked,
		mark,
		markText: TEXT.marks[mark],
		message: failed ? failureMessage(code, refused, detail, kind) : null,
		// the core allows 400 characters to what apt says; of a check that passed only the os check of a derivative says something, the release the box was read as and what it is
		detail: failed || (ok && code === 'os') ? line(detail, 400) : '',
		detailMessage: failed ? detailMessage(code, detail, locale) : null,
	}
}

const MARK_ORDER = { failed: 0, notChecked: 1, passed: 2 }

// The sentence of a plan that was refused, or of a call that was refused with the code of a check: the check says more for a release that is not known.
function refusalMessage(refused, checks, kind = '') {
	if (refused === 'recasaos') {
		const failed = checks.find(check => check.code === 'recasaos' && check.mark === 'failed')
		if (failed?.message)
			return failed.message
	}
	return reasonMessage(refused, { kind })
}

// The command that takes the hold off a package, when apt named the packages that are held (`held a b`): given only for names that are package names, whole.
const HELD = /^held ((?:\S+ )*\S+)$/
const MAX_HELD = 20
function holdOf(checks, refused) {
	if (refused !== 'held_package')
		return null
	const check = checks.find(item => item.code === 'apt' && item.mark === 'failed')
	const found = check ? HELD.exec(check.detail) : null
	const names = found ? found[1].split(' ') : []
	return names.length > 0 && names.length <= MAX_HELD && names.every(validPackage) ? { command: `apt-mark unhold ${names.join(' ')}` } : null
}

// ---- the list ---------------------------------------------------------------------------------------------------------

const MAX_MODULES = 64
const MAX_REASONS = 8

// A tag is later than another when its numbers are, one by one: v0.1.10 is later than v0.1.9.
function later(a, b) {
	if (!TAG.test(a) || !TAG.test(b))
		return false
	const x = a.slice(1).split('.').map(Number)
	const y = b.slice(1).split('.').map(Number)
	for (let i = 0; i < 3; i++) {
		if (x[i] !== y[i])
			return x[i] > y[i]
	}
	return false
}

// The update the list offers: the core says it is available, and the page says it again from the tags (the latest strictly later than the installed
// version that the card shows), or it offers nothing.
function updateOf(raw, installed) {
	if (!isPlain(raw) || raw.available !== true || !installed || !installed.version)
		return null
	if (raw.installed !== installed.version || !later(raw.latest, raw.installed))
		return null
	return { installed: raw.installed, latest: raw.latest }
}

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
	const update = updateOf(raw.update, installed)
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
		update,
		canInstall: catalogueOk && inCatalogue && supported && !installed && !broken,
		canUpdate: Boolean(update) && catalogueOk && inCatalogue && !broken,
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

// What an update changes, from the plan of one: the two tags (the latest strictly later, and the plan's own tag), and the packages it adds and no longer names.
function updateView(raw, tag) {
	if (!isPlain(raw) || !later(raw.latest, raw.installed) || raw.latest !== tag)
		return null
	const added = packageNames(raw.added)
	const dropped = packageNames(raw.dropped)
	return { installed: raw.installed, latest: raw.latest, added: added.names, moreAdded: added.more, dropped: dropped.names, moreDropped: dropped.more }
}

/**
 * The plan of an install or of an update, as the core answers it (a refused plan is a plan too). null for something that is not the plan of that module
 * in that mode. It can install only when it is not refused, every check passed, it lists the packages that apt installs, its id is the shape of the core's
 * and (for an update) it says what changes: anything else shows its reasons and no button.
 */
export function modulePlanView(raw, { name = '', locale = 'en_us', mode = 'install' } = {}) {
	if (!isPlain(raw) || raw.name !== name)
		return null
	// only the plan of an update says its mode: a plan of the other mode is not this one, whatever its id
	if ((raw.mode === 'update' ? 'update' : 'install') !== mode)
		return null
	const tag = typeof raw.tag === 'string' && TAG.test(raw.tag) ? raw.tag : ''
	const update = mode === 'update' ? updateView(raw.update, tag) : null
	const refused = raw.refused === null || raw.refused === undefined || raw.refused === '' ? '' : (typeof raw.refused === 'string' ? clean(raw.refused, 60) : '') || 'unknown'
	const checks = list(raw.checks).filter(isPlain).slice(0, 20).map(check => checkView(check, refused, locale, mode)).sort((a, b) => MARK_ORDER[a.mark] - MARK_ORDER[b.mark])
	const apt = isPlain(raw.packages) ? raw.packages : {}
	const install = packageNames(apt.to_install)
	const upgrade = packageNames(apt.to_upgrade)
	const archive = isPlain(raw.archive) ? raw.archive : {}
	const planId = typeof raw.plan_id === 'string' && PLAN_ID.test(raw.plan_id) ? raw.plan_id : ''
	const known = apt.known === true
	// a plan that does not list the packages says nothing of what apt installs: "apt installs no package" is a thing it must say, and not a thing it may leave out
	const listed = Array.isArray(apt.to_install) && (mode !== 'update' || Boolean(update))
	// a plan that did not check everything is not one to confirm (the core checks again when it is asked to install)
	const incomplete = !refused && (checks.length === 0 || checks.some(check => !check.ok))
	return {
		name,
		mode,
		update,
		tag,
		tier: tierOf(raw.tier),
		refused,
		refusedMessage: refused ? refusalMessage(refused, checks, mode) : null,
		unhold: holdOf(checks, refused),
		checks,
		incomplete,
		noList: !refused && !incomplete && !listed,
		noId: !refused && !incomplete && listed && !planId,
		packages: {
			listed,
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
		installable: !refused && Boolean(planId) && listed && checks.length > 0 && checks.every(check => check.ok),
	}
}

/** The body of the install call, from the plan that is on the screen: its own id, with the mode when it is an update's, and nothing else; null when that plan cannot install. */
export function installBody(plan) {
	if (!isPlain(plan) || plan.installable !== true || typeof plan.planId !== 'string' || !PLAN_ID.test(plan.planId))
		return null
	return plan.mode === 'update' ? { plan_id: plan.planId, mode: 'update' } : { plan_id: plan.planId }
}

// ---- the job ------------------------------------------------------------------------------------------------------------

// pkg/modulecmd/install.go Step*, remove.go Step*: the steps of an install and of a remove, in order. `done` is the end of both, not a step of the list.
export const STEPS = {
	install: ['packages', 'download', 'verify', 'unpack', 'units', 'manifest', 'start', 'route'],
	remove: ['stop', 'files', 'manifest', 'reload'],
	update: ['packages', 'download', 'verify', 'unpack', 'backup', 'stop', 'swap', 'units', 'start', 'route'],
}
export const ROLLBACK = 'rollback_'
// the steps of an update that is put back (pkg/modulecmd): rollback_restore, rollback_units and rollback_start when it failed, and recover_* when a run
// finds the copy of an update that was cut short. The page says them all in one sentence and lists no step for them.
const PUT_BACK = /^(?:rollback_(?:restore|units|start)|recover_[a-z_]+)$/
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
		leftovers: 'Checking what an unfinished update left',
	},
	update: {
		packages: 'Install the packages that the new version adds',
		download: 'Download the new version',
		verify: 'Check the download',
		unpack: 'Unpack the new version and check it',
		backup: 'Keep a copy of the files that the update replaces',
		stop: 'Stop the service of the module',
		swap: 'Put the new files in place',
		units: 'Tell systemd about the service of the module',
		start: 'Start the service of the module',
		route: 'Wait for the service to answer',
		putBack: 'Put the old version back',
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
const REMOVE_ONLY = new Set(['stop', 'files', 'reload', 'leftovers'])
const UPDATE_ONLY = new Set(['backup', 'swap'])
// the steps before the files of the module are written (the unpack is the first that writes): a job cut short or stopped there has put nothing of the module on the machine
const BEFORE_FILES = new Set(['', 'packages', 'download', 'verify'])

function stepMessage(kind, step) {
	if (PUT_BACK.test(step))
		return msg(STEP_TEXTS.update.putBack)
	const text = own(STEP_TEXTS[kind] ?? {}, step) ?? own(STEP_TEXTS.any, step)
	return text ? msg(text) : msg(STEP_UNKNOWN, { code: step || '?' })
}

/**
 * The kind of a job, install, remove or update. The core says it (`job.kind`); a job that it cannot tell (one started by hand, a log with no queued line)
 * is told from the step where the step says it (the steps of a rollback are an install's), then from what the page remembers of the call it made,
 * then, for a job that ended at done, from whether the module is installed. '' when it cannot be told: the page then says neither.
 */
function kindOf(declared, step, remembered, installed, finishedAtDone) {
	if (declared === 'install' || declared === 'remove' || declared === 'update')
		return declared
	if (UPDATE_ONLY.has(step) || /^rollback_(?:restore|units|start)$/.test(step))
		return 'update'
	if (INSTALL_ONLY.has(step) || step.startsWith(ROLLBACK))
		return 'install'
	if (REMOVE_ONLY.has(step))
		return 'remove'
	if (remembered === 'install' || remembered === 'remove' || remembered === 'update')
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
	running: { install: 'Installing {module}', remove: 'Removing {module}', update: 'Updating {module}', rollback: 'Undoing the install of {module}', putBack: 'Putting the old version of {module} back', any: 'A job is running on {module}' },
	succeeded: { install: 'The install of {module} is done.', remove: 'The removal of {module} is done.', update: 'The update of {module} is done.', updateTo: 'The update of {module} to {tag} is done.', any: 'The job on {module} is done.' },
	refused: { any: 'The job on {module} was refused. Nothing was changed.' },
	failed: { install: 'The install of {module} stopped.', remove: 'The removal of {module} stopped.', update: 'The update of {module} stopped.', updateNotDropped: 'The update of {module} is installed, but its backup is still there', any: 'The job on {module} stopped.' },
	interrupted: { any: 'The job on {module} was cut short.' },
}
export const JOB_LIVE = {
	step: '{module}: step {index} of {total}, {step}.',
	rollback: '{module}: undoing the install, {step}.',
	putBack: '{module}: putting the old version back.',
}
// what to say after a job that ended: what became of what it had done, and what to do
export const JOB_NEXT = {
	succeededInstall: 'The card of the module appears on the dashboard once its service answers.',
	succeededRemove: 'The packages that the module installed and its data are still on the machine.',
	undone: 'The files and the service of the module were removed; the packages were not.',
	nothingWritten: 'No file of the module was put on the machine.',
	undoUnknown: 'ReCasaOS cannot tell whether the install was undone: some files of the module may be on the machine.',
	notUndone: 'Undoing the install did not finish: some files of the module may still be on the machine.',
	cutBeforeStart: 'The job was stopped before it began. Nothing was changed.',
	cutEarly: 'Nothing of the module is on the machine, but its packages may be.',
	cutInstall: 'The install was cut short and nothing was undone: some files of the module may be on the machine.',
	cutRollback: 'The install failed and the undo was cut short: some files of the module may still be on the machine.',
	cutRemove: 'The removal was cut short: some files of the module may still be on the machine.',
	cutUnknown: 'The job was cut short: some files of the module may be on the machine.',
	succeededUpdate: 'The module runs the new version. Its configuration and its data were kept.',
	updateBack: 'The old version of the module is back: the module is as it was before the update.',
	updateLeft: 'The update failed and was rolled back, but some files were left as they are, so the old version is not whole. They are named below and in the log. Press Remove, then Install, to get a clean module.',
	updateNotDropped: 'The update is installed, but its backup folder could not be deleted (its path is below). The next install, update or remove will put the old version back unless the folder is deleted by hand.',
	updateKept: 'The old version could not be put back whole: a file was changed while the update ran, or the copy of the old version cannot be read. Nothing more was changed, and the folder with the copy is kept (its path is below). If the update is over and the module is as it should be, delete the folder by hand. If it is not, put the files of the old version back by hand from that folder, then delete it. Then press Update or Remove again. ReCasaOS never deletes it by itself.',
	updateUnknown: 'ReCasaOS cannot tell whether the old version was put back. Press Update or Remove again: ReCasaOS looks at it first.',
	updateCut: 'The update was cut short, for instance by a restart of the machine. Press Update or Remove again: ReCasaOS puts the old version back before it does anything else.',
}

// What a job that failed or was cut short says of what it had done, and whether the console finishes the work. The console is for what the page
// cannot finish: an undo that did not end, a removal that stopped, a job whose kind is not known (it may be a removal), and a job that was cut short
// after it began to write.
function endingOf({ state, kind, step, undo, code }) {
	// the update is installed and only its backup is left: it is not a failure to be undone
	if (kind === 'update' && state === 'failed' && code === 'backup_not_dropped')
		return { undoMessage: JOB_NEXT.updateNotDropped, folder: true, advice: false }
	// a remove that went on past an unfinished update names what it left in the log
	if (kind === 'remove' && state === 'failed' && step === 'leftovers')
		return { undoMessage: null, advice: false }
	// an update either put the old version back or did not: the console is for the copy that is kept, and the sentence says what to do
	if (kind === 'update' && (state === 'failed' || (state === 'interrupted' && step))) {
		if (state === 'interrupted')
			return { undoMessage: JOB_NEXT.updateCut, advice: false }
		if (undo === 'rolled_back')
			return { undoMessage: JOB_NEXT.updateBack, advice: false }
		// some files are the owner's and were left as they are: the old version is not whole
		if (undo === 'rolled_back_with_left')
			return { undoMessage: JOB_NEXT.updateLeft, advice: false }
		return undo ? { undoMessage: JOB_NEXT.updateKept, folder: true, advice: false } : { undoMessage: JOB_NEXT.updateUnknown, advice: false }
	}
	if (state === 'failed') {
		if (kind !== 'install')
			return { undoMessage: null, advice: true }
		if (undo === 'rolled_back')
			return { undoMessage: JOB_NEXT.undone, advice: false }
		if (undo)
			return { undoMessage: JOB_NEXT.notUndone, advice: true }
		// no undo is said: before the files are written there was nothing to undo, and after it nobody can say
		return BEFORE_FILES.has(step) ? { undoMessage: JOB_NEXT.nothingWritten, advice: false } : { undoMessage: JOB_NEXT.undoUnknown, advice: true }
	}
	if (state === 'interrupted') {
		if (!step)
			return { undoMessage: JOB_NEXT.cutBeforeStart, advice: false }
		if (step.startsWith(ROLLBACK))
			return { undoMessage: JOB_NEXT.cutRollback, advice: true }
		if (kind === 'remove')
			return { undoMessage: JOB_NEXT.cutRemove, advice: true }
		if (kind === 'install')
			return BEFORE_FILES.has(step) ? { undoMessage: JOB_NEXT.cutEarly, advice: false } : { undoMessage: JOB_NEXT.cutInstall, advice: true }
		return { undoMessage: JOB_NEXT.cutUnknown, advice: true }
	}
	return { undoMessage: null, advice: false }
}

// how a step is marked in the list: a word and an icon beside the sentence, so that colour is never alone
export const STEP_MARKS = {
	done: { text: 'Done', icon: 'check-circle-outline' },
	current: { text: 'Now', icon: 'arrow-right-circle-outline' },
	pending: { text: 'Not yet', icon: 'circle-outline' },
	failed: { text: 'Failed here', icon: 'alert-circle-outline' },
	stopped: { text: 'Cut short here', icon: 'stop-circle-outline' },
	skipped: { text: 'Not reached', icon: 'minus-circle-outline' },
	// an update of a module that was stopped leaves it stopped, and does not start it
	left: { text: 'Skipped: the service was stopped before the update', icon: 'skip-next-circle-outline' },
}

function stepsOf(kind, state, step, left = [], ids = own(STEPS, kind)) {
	if (!ids)
		return []
	const at = ids.indexOf(step)
	const ended = state === 'failed' || state === 'interrupted' || state === 'refused'
	const all = state === 'succeeded' || step === 'done'
	return ids.map((id, index) => {
		let mark
		if (all)
			mark = left.includes(id) ? 'left' : 'done'
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

// The packages of the module that the job left on the machine (kept_packages is the module's WHOLE list, not only what the install added), and the
// command that purges them by hand. Said for an install that failed (a list that is not given is a list that is not known), and for a remove that
// succeeded, once the module is gone, when the core gives a list; never for a remove that stopped (the console finishes it first) or an install that
// succeeded.
function keptOf(raw, kind, state) {
	const install = kind === 'install'
	if (kind === 'update')
		return null
	if (!((state === 'failed' && kind !== 'remove') || (state === 'succeeded' && kind === 'remove')))
		return null
	if (!Array.isArray(raw))
		return state === 'failed' && install ? { known: false, names: '', count: 0, command: '', unsafe: false } : null
	const names = raw.filter(name => typeof name === 'string').map(name => clean(name, 80)).filter(Boolean).slice(0, MAX_KEPT)
	// a command is run by whoever pastes it: it is given only when every name is a package name, whole, as the core takes them
	const valid = raw.length <= MAX_KEPT && raw.every(validPackage)
	return { known: true, names: names.join(', '), count: names.length, command: valid && raw.length ? `apt-get purge ${raw.join(' ')}` : '', unsafe: !valid }
}

/**
 * The job of a module, from the answer of the status (or of an install and a remove, which answer the same): { job, status }. `kind` is what the page
 * remembers of the call it made ('install', 'remove' or ''): it is used only when the core does not say what the job is and the step does not either.
 * null for something that is not the job of that module: its name is checked, so that the answer for another module is never taken for this one's.
 */
export function jobView(raw, { name = '', title = '', kind = '', locale = 'en_us' } = {}) {
	const job = isPlain(raw) && isPlain(raw.job) ? raw.job : null
	if (!job || job.name !== name || typeof job.state !== 'string')
		return null
	const status = isPlain(raw.status) ? raw.status : {}
	const version = typeof status.version === 'string' && TAG.test(status.version) ? status.version : ''
	const state = job.state
	const known = Boolean(own(JOB_STATES, state))
	// a state that is not the core's is shown as text, cleaned and cut
	const stateText = known ? state : clean(state, 40)
	const step = typeof job.step === 'string' && STEP_WORD.test(job.step) ? job.step : ''
	const code = typeof job.code === 'string' && CODE_WORD.test(job.code) ? job.code : ''
	const codeText = clean(job.code, 60)
	const undo = job.undo === 'rolled_back' || job.undo === 'rolled_back_with_left' || job.undo === 'rollback_incomplete' ? job.undo : (typeof job.undo === 'string' && job.undo ? 'rollback_incomplete' : '')
	const running = state === 'running'
	const finished = state === 'succeeded' || state === 'refused' || state === 'failed' || state === 'interrupted'
	const putBack = PUT_BACK.test(step)
	const rollback = step.startsWith(ROLLBACK) && !putBack
	const module = clean(title, 80) || name
	const jobKind = kindOf(job.kind, step, kind, status.installed, finished && step === 'done')
	const group = known ? JOB_STATES[state] : JOB_STATE_UNKNOWN
	const titles = own(JOB_TITLES, state) ?? { any: TEXT.job.unknownState }
	// the steps of a rollback are those of a remove
	const listKind = rollback ? 'remove' : jobKind
	const listStep = rollback ? step.slice(ROLLBACK.length) : step
	// an update of a module that was stopped leaves it stopped: the core writes `start` and `route` as skipped, which the job does not carry, and the status shows a service that does not run
	const left = jobKind === 'update' && state === 'succeeded' && isPlain(status.unit) && status.unit.active === false ? ['start', 'route'] : []
	// a remove that goes on past an unfinished update has one more step, and only then
	const ids = listKind === 'remove' && listStep === 'leftovers' ? [...STEPS.remove, 'leftovers'] : own(STEPS, listKind)
	// an update whose only trouble is its backup is installed: no step of it is left undone
	const installedUpdate = jobKind === 'update' && state === 'failed' && code === 'backup_not_dropped'
	const stepList = putBack || installedUpdate ? [] : stepsOf(listKind, state, listStep, left, ids)
	const at = putBack ? -1 : ids?.indexOf(listStep) ?? -1
	const total = ids?.length ?? 0
	const stepText = stepMessage(listKind, listStep)
	// the title of an update that is being put back, of an install that is being undone, and of an update that is done to a version the status gives
	const titleKey = (running && putBack && jobKind === 'update' ? titles.putBack : undefined)
		?? (running && rollback ? titles.rollback : undefined)
		?? (state === 'succeeded' && jobKind === 'update' && version ? titles.updateTo : undefined)
		?? (installedUpdate ? titles.updateNotDropped : undefined)
		?? titles[jobKind] ?? titles.any
	const titleMessage = msg(titleKey, titleKey === titles.updateTo ? { module, tag: version } : { module })
	let live = titleMessage
	if (running && putBack)
		live = msg(JOB_LIVE.putBack, { module })
	else if (running && rollback)
		live = msg(JOB_LIVE.rollback, { module, step: stepText.key }, ['step'])
	else if (running && at >= 0)
		live = msg(JOB_LIVE.step, { module, index: String(at + 1), total: String(total), step: stepText.key }, ['step'])
	const failed = state === 'failed'
	const cutShort = state === 'interrupted'
	// a job that was refused or stopped says why
	const ended = failed || state === 'refused'
	const ending = endingOf({ state, kind: jobKind, step, undo, code })
	const logLines = list(job.log_tail).filter(item => typeof item === 'string').slice(-MAX_LOG_LINES).map(item => line(item)).filter(Boolean)
	let next = null
	if (state === 'succeeded')
		next = jobKind === 'install' ? msg(JOB_NEXT.succeededInstall) : jobKind === 'remove' ? msg(JOB_NEXT.succeededRemove) : jobKind === 'update' ? msg(JOB_NEXT.succeededUpdate) : null
	const progressLabel = rollback ? TEXT.job.progressRollback : jobKind === 'install' ? TEXT.job.progressInstall : jobKind === 'update' ? TEXT.job.progressUpdate : TEXT.job.progressRemove
	return {
		name,
		state: stateText,
		stateText,
		// styled by a class of its own when it is not the core's: a state is never a class name
		stateClass: known ? `is-${state}` : 'is-unknown',
		known,
		running,
		finished,
		// a report of a job that stopped is read once, and then put away until another job begins
		dismissible: failed || cutShort,
		step,
		rollback: rollback || putBack,
		kind: jobKind,
		title: titleMessage,
		group: group.group,
		tone: group.tone,
		progress: running && at >= 0 ? { value: at, max: total, label: msg(progressLabel, { index: String(at + 1), total: String(total) }) } : null,
		steps: stepList,
		rollbackStep: running && putBack ? msg(TEXT.job.putBack) : running && rollback ? msg(TEXT.job.rollback, { step: stepText.key }, ['step']) : null,
		stoppedAt: (failed || cutShort) && step ? msg(TEXT.job.stoppedAt, { step: stepText.key }, ['step']) : null,
		live,
		reason: ended && code ? reasonMessage(code, { step, kind: jobKind }) : (ended && codeText ? msg(REASON_UNKNOWN, { code: codeText }) : null),
		code: ended ? codeText : '',
		undoText: ending.undoMessage ? msg(ending.undoMessage) : null,
		// where the copy of the old version is kept, to be read and copied, never run
		folder: ending.folder && MODULE_NAME.test(name) ? `/var/lib/casaos/modules/tmp/backup-${name}` : null,
		kept: keptOf(job.kept_packages, jobKind, state),
		next,
		advice: ending.advice && MODULE_NAME.test(name) ? { command: `casaos module remove ${name}` } : null,
		// the files an update left as they are, as the log names them: `left: <path>` lines, to be read and copied
		leftFiles: undo === 'rolled_back_with_left' && jobKind === 'update' ? logLines.filter(item => item.startsWith('left: ')) : [],
		logTail: logLines,
		startedAt: formatMoment(job.started_at, locale),
		// the time as the core wrote it: what tells one job of a module from the next
		startedAtRaw: typeof job.started_at === 'string' ? clean(job.started_at, 40) : '',
		endedAt: formatMoment(job.ended_at, locale),
		changeKey: [stateText, step, code, undo, jobKind].join('|'),
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
 * Why the status of a job could not be read, from the error of the call: a session that ended ('signin'), a core without the route ('unavailable'), a
 * core that answered with an error of its own, whose code is given ('error'), a core that does not answer ('down': no answer, or a gateway that has
 * nothing behind it: 502, 503 and 504), or something else ('failed': an answer that is not an answer of the core, or a browser that is offline).
 */
export function moduleStatusFailure(error) {
	const response = error?.response
	const status = Number.isInteger(response?.status) ? response.status : 0
	if (status === 401)
		return { kind: 'signin', code: '' }
	if (status === 404)
		return { kind: 'unavailable', code: '' }
	if (!response) {
		// no answer at all while the browser itself is offline is the person's own network, and not a core that is away
		return { kind: typeof navigator !== 'undefined' && navigator.onLine === false ? 'failed' : 'down', code: '' }
	}
	const body = isPlain(response.data) && isPlain(response.data.data) ? response.data.data : null
	const code = body && typeof body.error_code === 'string' ? clean(body.error_code, 60) : ''
	if (code)
		return { kind: 'error', code }
	if (status === 502 || status === 503 || status === 504)
		return { kind: 'down', code: '' }
	return { kind: status >= 500 ? 'error' : 'failed', code: '' }
}

/**
 * What to say while the job cannot be read, in the words of a job: a core that does not answer, or that answers with an error, is said as such and the
 * page goes on by itself, with the time; after fifteen minutes the person is sent to the machine. A job is being followed, so a core that is away is
 * not an error of the page. `kind` is moduleStatusFailure of the error and `elapsedMs` the time since the silence began.
 */
export function moduleOutage({ kind, code = '', elapsedMs = 0 }) {
	if (kind === 'signin')
		return { level: 'signin', message: msg(TEXT.outage.signin), elapsed: null, code: '' }
	if (kind === 'unavailable')
		return { level: 'unavailable', message: null, elapsed: null, code: '' }
	const time = formatElapsed(elapsedMs)
	if (elapsedMs >= RESTART_LOOK_AFTER_MS)
		return { level: 'look', message: msg(TEXT.outage.look, { time }), elapsed: null, code: '' }
	// nothing is said of the time before a second has gone by
	const elapsed = elapsedMs >= 1000 ? msg(TEXT.outage.elapsed, { time }) : null
	if (kind === 'down')
		return { level: 'down', message: msg(TEXT.outage.down), elapsed, code: '' }
	if (kind === 'error')
		return { level: 'error', message: msg(TEXT.outage.error), elapsed, code: clean(code, 60) }
	return { level: 'unreadable', message: msg(TEXT.outage.unreadable), elapsed: null, code: '' }
}

// ---- when a call fails ----------------------------------------------------------------------------------------------------

/**
 * What a call that failed says. A refusal of the core (400, 409 or 500 with `data.error_code`) is the sentence of its code, with the checks that failed as
 * `items` when it names them, and for `busy` what the core saw, as text in `detail` (the core says it in English prose, which is never matched) and
 * the plan's own words for it in `busy`. Anything else is a call that did not go through. A read (`read`: the list, the plan) changed nothing: when it
 * got no answer it is told to be tried again. A call that changes the machine (`mutating`: the install and the remove) that got no answer, or an
 * answer of a gateway with nothing behind it, may have been carried out, and is told so. Never the core's own words (`data.error`).
 */
export function moduleFailure(error, locale = 'en_us', { read = false, mutating = false, mode = '' } = {}) {
	const base = failureOf(error, locale, { read })
	if (base.kind === 'unavailable')
		return { ...base, message: msg(TEXT.unavailable), detail: '', busy: null, unhold: null }
	if (base.kind !== 'refusal') {
		const status = Number.isInteger(error?.response?.status) ? error.response.status : 0
		let { kind, message } = base
		if (read && (kind === 'timeout' || kind === 'failed')) {
			kind = 'failed'
			message = msg(TEXT.call.readFailed)
		} else if (kind === 'timeout' || (mutating && kind === 'failed' && status >= 500)) {
			kind = 'timeout'
			message = msg(TEXT.call.maybe)
		}
		return { ...base, kind, message, detail: '', busy: null, unhold: null }
	}
	const body = error?.response?.data?.data
	const data = isPlain(body) && isPlain(body.data) ? body.data : {}
	const all = list(data.checks).filter(isPlain).slice(0, 20).map(check => checkView(check, base.code, locale, mode))
	const items = all.filter(check => check.mark === 'failed').map(check => ({ code: check.code, message: check.message }))
	const message = base.code === 'recasaos' ? refusalMessage(base.code, all, mode) : reasonMessage(base.code, { data, kind: mode })
	const busy = base.code === 'busy' ? (all.find(check => check.code === 'busy' && check.mark === 'failed')?.detailMessage ?? null) : null
	return { kind: 'refusal', status: base.status, code: base.code, message, items, detail: base.code === 'busy' ? line(data.reason, 200) : '', busy, unhold: holdOf(all, base.code) }
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
