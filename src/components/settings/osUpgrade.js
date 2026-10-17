/**
 * What the dashboard makes of the upgrade of the operating system itself: GET /v1/sys/os/upgrade/status (the state of the run
 * that is open, or of the last one, and the buttons that are valid now), the refusals of the calls that drive it, and the start
 * request built from the plan that was read. The plan (osPlan.js) and the readiness report (osReadiness.js) are the sections
 * above it; this is the module of the section that runs the upgrade. It is pure: no request, no timer, no component. The
 * component asks sys.js (getOsUpgradeStatus, setOsUpgradeBeta, startOsRefresh, startOsUpgrade, rebootOsUpgrade, resumeOsUpgrade,
 * abortOsUpgrade, ackOsUpgrade, getOsUpgradeRunbook) and hands what comes back to the functions below.
 *
 * Texts are language-file keys (the English sentence is the key), and the core's codes pick them: the dashboard never matches the
 * core's English words. A code it does not know is said as one it does not know, with the code as text, and never breaks the view.
 * Everything the core sends is TEXT: it is cleaned here (control characters, the marks that turn a text round, the user and the
 * query of an address) and cut, and the component shows it as text nodes, never as HTML, never in a toast, never in an attribute
 * that is interpreted.
 *
 * Fail closed, here as in the core: the buttons are the server's list, in its order, and nothing else (a state this module does not know
 * has none), a barrier that is not plainly ok holds the restart back, a weight it does not know is a warning, and a plan whose verdict it
 * does not know blocks a start.
 *
 * The lists of codes below (states, actions, classes, reasons, findings, barrier checks, refusals, blocks) MIRROR the core:
 * pkg/osrun/vocab.go, pkg/osrun/action.go, pkg/osverify/judge.go, service/system_os_upgrade*.go, pkg/osplan/auto.go. A code
 * added to the core without a sentence here is noticed by osUpgrade.spec.js, which pins the core's lists.
 *
 * A sentence is { key, params }: the component says $t(key, params). A few fields are keys alone (title, what, next, label, groupLabel,
 * banners[].key, block.titleKey). Text from the core (hop, block.title, failure.detail, arg, names, log lines) is a plain string.
 *
 * EXPORTS
 *
 *   The view of the status
 *     statusView(raw, locale = 'en_us') -> view | null            null for what is not a status; a state it does not know is a view
 *                                                                   with `known: false`, its raw state as text, and no button
 *       view: { known, state, reason, open, group, groupLabel, tone, title, what, next, cause, kind: { code, label }, hop, attempt,
 *               block: { index, id, number, title, titleKey } | null, step, progress: { value, max, label } | null, since, lastActivity,
 *               expiresAt, banners: [{ id, key, tone }], failure: { code, stage, rc, detail, what, next, hint, hintCode } | null,
 *               hint: { code, message, commands } | null, barrier: { blocked, red, warnings } | null, findings, notJudged, notReturned,
 *               manual: { done, next, pnr, backupFolder } | null, afterRebootHint: { backupFolder, log, commands, block8 } | null,
 *               logTail: [string], reboot: { stalled } | null, wordNeeded, ackWord, buttons, runbook: { auto, available },
 *               launch: { betaEnabled, switch, refresh, acceptChange, start }, planId, runId, codes, changeKey }
 *       `open` is a run that is open (the state is not idle, or a run is on its way): the section shows itself, and the polling is fast.
 *     announcement(previous, next) -> { key, params } | null       the sentence for the live region when the state changed (one per change,
 *                                                                   not per poll); null when nothing changed or before the first view
 *     changeKey(view) -> string                                   what makes two views the same change for `announcement`
 *   The buttons (view.buttons is the server's `actions`, in its order, each once, and nothing else)
 *       button: { action, call, ack, label, confirm: { title, body: [key], ok, danger } | null, needsWord }
 *       a click makes sys[button.call](buttonBody(button, typedWord)): `call` is the name of the sys.js method
 *     buttonBody(button, word = '') -> object                      the body of the ack call of a button ({} for the others)
 *     wordOk(typed, ackWord) -> boolean                            whether the typed text is the word the status asks for
 *   Starting (the plan is the core's own plan, as OsUpgradePlan has it in status.raw)
 *     startNeeds(plan, rehearsal) -> { planId, blocked, safetyNet, acks, removals, paused } | null
 *     startBody(plan, input) -> { ok, body, missing }              input: { rehearsal, safetyNet, hostname, acks }; body is for sys.startOsUpgrade
 *     hostnameOk(text) -> boolean
 *   When a call fails
 *     failureOf(error, locale) -> { kind, status, code, message, items }   kind: refusal | signin | unavailable | timeout | failed;
 *                                                                   items: [{ code, message | null }] (the things a refusal names)
 *     powerRefusal(error) -> { key, params } | null                the sentence of the two refusals that the restart and the shutdown of the top bar can meet
 *   Polling, and a core that does not answer
 *     nextPoll(last, { hidden, runOpen }) -> milliseconds | null   last: 'none' | 'ok' | 'error'; null means do not ask
 *     statusFailure(error) -> 'signin' | 'unavailable' | 'down' | 'failed'
 *     outageView({ kind, elapsedMs, last }) -> { level, message, elapsed, hint }   level: restarting | look | unreadable | signin | unavailable
 *     formatElapsed(ms) -> string                                  "4 min 05 s", the same in every language
 *   The tables, for the component and the tests
 *     TEXT (the headings, labels, confirmations and the form of the start), SAFETY_NETS, SAFETY_NET_TEXTS, START_ACKS, ACK_TEXTS,
 *     STATE_TABLE, STATE_VARIANTS, CLASS_TABLE, FINDINGS, BARRIER_CHECKS, PREREBOOT_WORDS, NOT_JUDGED, REFUSALS, CALL_ERRORS, BUTTONS,
 *     BLOCK_TITLES, UPGRADE_KEYS (every key the tables say, for the language files' test), POLL_MS, RESTART_LOOK_AFTER_MS
 */

import { MARKS, classOf, clean, paramsOf, planView, scrub, sentenceFor } from './osPlan'
import { READINESS_CHECKS, formatMoment } from './osReadiness'

// ---- small tools ----------------------------------------------------------------------------------------------------

// Only the own properties of a table: a code named like an Object method is not one.
function own(table, key) {
	return typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined
}

const isPlain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const list = value => Array.isArray(value) ? value : []

// The sentence of a table that depends on what the server offers: a key, or a list of { needs, key } of which the first whose `needs` are all
// in `facts` is said. null when none is.
function pick(options, facts) {
	if (!Array.isArray(options))
		return options ?? null
	return options.find(option => list(option.needs).every(name => facts.has(name)))?.key ?? null
}
// Every key a sentence of a table can be.
const keysOf = options => (Array.isArray(options) ? options.map(option => option.key) : [options]).filter(Boolean)
const msg = (key, params = {}) => ({ key, params })

// How much of a line is looked at for an address: scrub takes time that grows with the square of a text of this kind.
const SCRUBBED_WITHIN = 2048

// A line of the machine's own words (the unit's output, the line that said why it stopped), as it is shown: the user and the query of an
// address hidden before the text is cut, the control characters spaces.
function shown(value, max = 400) {
	if (typeof value !== 'string')
		return ''
	return clean(scrub(value.length > SCRUBBED_WITHIN ? value.slice(0, SCRUBBED_WITHIN).replace(/\S*$/, '') : value), max)
}

// A text of several lines that is copied and run (the last block of the check): the controls but the end of a line and the tab, and the
// marks that turn a text round or show nothing (osPlan.js MARKS), by their numbers (a mark of that kind is not to be written in a source
// file). It is kept whole or not at all: a script that was cut, or cleaned, is not the one the core wrote.
const UNSAFE_BLOCK = new RegExp(`[${classOf([[0, 8], [11, 31], [127, 159], ...MARKS])}]`, 'u')
const MAX_BLOCK = 64000
function blockText(value) {
	if (typeof value !== 'string' || value.length > MAX_BLOCK)
		return ''
	const text = value.replace(/\r\n?/g, '\n')
	return UNSAFE_BLOCK.test(text) ? '' : text.trim()
}

// The commands that the person copies into a console: kept whole or dropped. A command that was cut, or that held a control character
// (a second command after a line end, say), is not the one the core wrote.
const MAX_COMMAND = 400
const MAX_COMMANDS = 12
function commandsOf(value) {
	const commands = list(value)
		.filter(item => typeof item === 'string')
		.filter(item => item.trim() && item.trim().length <= MAX_COMMAND && clean(item, MAX_COMMAND + 1) === item.trim())
		.map(item => item.trim())
	// each once: a command the core says twice is one command to copy
	return [...new Set(commands)].slice(0, MAX_COMMANDS)
}

const MAX_NAMES = 20
function names(value) {
	const items = list(value).filter(name => typeof name === 'string' && clean(name)).map(name => clean(name, 80))
	return items.length > MAX_NAMES ? `${items.slice(0, MAX_NAMES).join(', ')}, …` : items.join(', ')
}

const count = value => Number.isInteger(value) && value >= 0 ? value : null

// ---- the words of the page --------------------------------------------------------------------------------------------

// Every sentence the page says that is not the sentence of a code of the core: the headings, the labels, the confirmations, the form of the
// start. The component looks them up and writes nothing of its own.
export const TEXT = {
	heading: 'Upgrade of the operating system',
	// the last state that was read, shown while the core does not answer
	stale: 'This is the last state that was read. It may be out of date.',
	kinds: { refresh: 'Refresh of the current release', rehearsal: 'Rehearsal', hop: 'Upgrade' },
	groups: {
		idle: 'Nothing is open',
		working: 'In progress',
		waiting: 'Waiting for you',
		done: 'Finished',
		stopped: 'Stopped',
		attention: 'Needs you',
		manual: 'Taken over',
		unknown: 'Unknown state',
	},
	summary: {
		kind: 'Kind of run',
		hop: 'Upgrade path',
		step: 'Step {index} of {total}',
		stepAlone: 'Step {index}',
		progress: 'Progress of the upgrade: step {index} of {total}',
		attempt: 'Attempt {n}',
		since: 'Since',
		lastActivity: 'Last activity',
		expires: 'Put back by itself at',
		codes: 'Codes, for support',
	},
	severities: { error: 'Error', warn: 'Warning', info: 'For information' },
	banners: {
		pnr: 'The point of no return is behind: there is no way back except your snapshot.',
		halfUpgraded: 'The machine is half upgraded.',
		busy: 'Backups and automatic updates are held while this goes on.',
	},
	failure: {
		heading: 'Why it stopped',
		stage: 'Stopped in',
		rc: 'Exit status',
		detail: 'The line of the output of the upgrade that says why',
		todo: 'What you do',
	},
	cause: {
		power: 'The machine lost power or restarted while the upgrade was working.',
		killed: 'The upgrade was stopped before it ended.',
		unknown: 'The upgrade was lost, and whether the machine lost power could not be told.',
	},
	lists: {
		barrier: 'Before the restart',
		barrierBlocked: 'The restart is not offered until this is mended.',
		barrierPending: 'Checking the machine before the restart…',
		findings: 'What the check found',
		notJudged: 'Not judged, because the machine could not be asked',
		notReturned: 'Containers that did not come back',
		container: 'The container {name} does not run (restart policy {policy}).',
		containerNoPolicy: 'The container {name} does not run.',
		apps: 'Apps at risk',
		manual: 'Where you stand',
		blocksDone: 'Blocks done',
		nextBlock: 'Next block',
		noneYet: 'none yet',
		pnrBehind: 'The point of no return is behind',
		pnrAhead: 'The point of no return is not reached',
		backupFolder: 'Backup folder',
		yes: 'Yes',
		no: 'No',
		block: 'Block {n}',
		logTail: 'End of the output of the upgrade',
		noLog: 'The upgrade has printed nothing yet.',
	},
	hints: {
		commands: 'Commands to run at a console',
		note: 'ReCasaOS never runs these for you.',
	},
	word: {
		label: 'The word that closes this run',
		help: 'Closing this run lets backups and automatic updates go on, although the machine is half upgraded or needs attention. Type this word to say you looked at it:',
		input: 'Type the word here',
	},
	runbook: {
		show: 'Show the text of the run',
		about: 'This text is yours to read and paste into a console, one block at a time. It holds your package sources as they are.',
		loading: 'Reading the text of the run…',
	},
	beta: {
		label: 'The upgrade of the operating system is a beta',
		on: 'The upgrade is switched on.',
		off: 'The upgrade is switched off.',
		switchOn: 'Switch the upgrade on',
		switchOff: 'Switch the upgrade off',
		confirmTitle: 'Switch the upgrade on?',
		confirmBody: [
			'Switching it on only lets you start a refresh, a rehearsal or the upgrade: nothing changes on the machine until you do.',
			'The upgrade is a beta. There is no way back from its point of no return except a snapshot of the machine, so take one first, and be where you can see the machine\'s screen when it restarts.',
		],
		confirmOk: 'Switch on',
		offNote: 'Switch the upgrade on to start a refresh, a rehearsal or the upgrade.',
	},
	refresh: {
		button: 'Bring the current release up to date',
		about: 'This runs apt-get update and a full upgrade of the release the machine runs now. It removes nothing, and it puts the package sources and the timers of apt back when it ends. Take a snapshot first, and make the plan after it, not before.',
		accept: 'Run it again and accept the change',
		acceptTitle: 'Accept the change of a package source?',
		acceptBody: [
			'apt refused a package source because the description it gives of itself changed (its Origin, Label or Codename).',
			'Accept it only if you know and expect that change: the refresh will then take it, and change nothing else about how apt asks.',
		],
		acceptOk: 'Run it and accept',
	},
	start: {
		rehearsalButton: 'Start a rehearsal',
		hopButton: 'Start the upgrade',
		rehearsalTitle: 'Start a rehearsal',
		hopTitle: 'Start the upgrade',
		rehearsalIntro: 'A rehearsal runs the half of the upgrade that can be undone: the checks, the notes of the machine, the sources of the next release and the download of the packages. It stops with the sources of the next release in place for at most 30 minutes, then puts everything back. It needs no safety net.',
		hopIntro: 'The upgrade changes the packages of the machine and ends with a restart. From its point of no return there is no way back except your snapshot (or a console to repair the machine from). A rehearsal first is recommended.',
		console: 'Be at the console of the machine when it restarts: a machine that does not come back cannot show this page.',
		safetyNet: 'What you have in case the machine does not come back',
		hostname: 'Type the name of this machine again',
		hostnameHelp: 'It must be the name of this machine, as it is known on the network: it says you mean this one.',
		removals: 'Packages the upgrade removes',
		paused: 'Package sources put aside while it runs',
		none: 'none',
		rehearsalOk: 'Start the rehearsal',
		hopOk: 'Start the upgrade',
		missing: 'Fill in what is asked and tick every box to start.',
	},
	confirm: {
		title: 'Are you sure?',
	},
	outage: {
		restarting: 'The machine is restarting. This page goes on by itself.',
		elapsed: 'No answer for {time}.',
		look: 'The machine has not answered for {time}. Look at its screen or console: it may have stopped, or it may be waiting for you.',
		unreadable: 'The state of the upgrade could not be read just now. This page tries again by itself.',
		signin: 'Your session has ended. Sign in again to see the upgrade.',
		hintHeading: 'If the machine does not come back, this is what you need',
		bkPath: 'Backup folder',
		log: 'Log of the upgrade',
		commands: 'Commands to look at the machine from a console',
		block8: 'The text of the last block, to run after the restart',
	},
}

// ---- the states ---------------------------------------------------------------------------------------------------------

// What each state of the run says (the core's osrun.States), with the group it belongs to and the colour of the group. `what` is what it is
// and `next` what the person does, in the words of the core's own documentation of the beta. The buttons are the server's.
//
// `what` and `next` are a key, or a list of options: the first whose `needs` are all there is said (a button the server offers, by its name,
// or one of the flags `pnr` and `half_upgraded`), and the last has none. A sentence that sends the person to a button that is not there, or
// speaks of a machine that is not in the state it describes, would be a false one.
export const STATE_TABLE = {
	idle: {
		group: 'idle',
		tone: 'is-info',
		title: 'No upgrade is open',
		what: 'No upgrade of the operating system is open.',
		next: 'Bring the machine up to date, make the plan, then start a rehearsal or the upgrade.',
	},
	refreshing: {
		group: 'working',
		tone: 'is-info',
		title: 'Refreshing the current release',
		what: 'The current release is being brought to its latest state. Nothing is removed.',
		next: [
			{ needs: ['abort'], key: 'Wait, and do not run apt yourself. You can stop it until it begins to upgrade packages.' },
			{ key: 'Wait, and do not run apt yourself.' },
		],
	},
	reboot_first: {
		group: 'waiting',
		tone: 'is-warning',
		title: 'The machine wants a restart',
		what: 'The current release is up to date, and the machine wants a restart before the upgrade can be planned.',
		next: 'Restart the machine, then close this run and make the plan.',
	},
	refreshed: {
		group: 'done',
		tone: 'is-success',
		title: 'Refresh done',
		what: 'The current release is up to date, and the package sources and the timers of apt are back as they were.',
		next: 'Close this run, then make the plan.',
	},
	rehearsing: {
		group: 'working',
		tone: 'is-info',
		title: 'Rehearsal running',
		what: 'The half of the upgrade that can be undone is running: the checks, the notes of the machine and the download of the packages.',
		next: [
			{ needs: ['abort'], key: 'Wait, and do not run apt or restart the machine. You can stop it.' },
			{ key: 'Wait, and do not run apt or restart the machine.' },
		],
	},
	rehearsed: {
		group: 'waiting',
		tone: 'is-warning',
		title: 'Rehearsal ready',
		what: 'The package sources of the next release are in place for at most 30 minutes. No package was installed.',
		next: 'Put the machine back. ReCasaOS also does it by itself when the time is over or the machine restarts.',
	},
	rehearsal_done: {
		group: 'done',
		tone: 'is-success',
		title: 'Rehearsal done',
		what: 'The rehearsal ended and the machine is as it was. The packages it downloaded stay in the cache of apt.',
		next: 'Close this run, then start the upgrade with the same plan. Make a new plan if ReCasaOS restarted meanwhile.',
	},
	running: {
		group: 'working',
		tone: 'is-info',
		title: 'Upgrade running',
		what: 'The upgrade is running.',
		next: [
			{ needs: ['abort'], key: 'Wait, and do not run apt or restart the machine. You can stop it until the point of no return.' },
			{ key: 'Wait, and do not run apt or restart the machine.' },
		],
	},
	unwinding: {
		group: 'working',
		tone: 'is-info',
		title: 'Putting the machine back',
		what: 'The machine is being put back as it was.',
		next: 'Wait.',
	},
	recovering: {
		group: 'working',
		tone: 'is-info',
		title: 'Repair running',
		what: 'A repair of the upgrade that stopped is running.',
		next: 'Wait, and do not run apt.',
	},
	awaiting_reboot: {
		group: 'waiting',
		tone: 'is-warning',
		title: 'Waiting for the restart',
		what: 'Every step is done and the machine waits for its restart. ReCasaOS never restarts it by itself.',
		next: [
			{ needs: ['reboot'], key: 'Restart the machine when you are ready, or take the run over to finish by hand. The checks before the restart do not look at the names of the network cards: write them down first (ip -br link).' },
			{ needs: ['takeover'], key: 'The restart is not offered yet. Wait, or take the run over to finish by hand.' },
			{ key: 'Wait.' },
		],
	},
	rebooting: {
		group: 'working',
		tone: 'is-info',
		title: 'Restarting',
		what: 'The restart was asked for.',
		next: 'Wait. This page goes on by itself when the machine is back.',
	},
	reboot_stalled: {
		group: 'waiting',
		tone: 'is-danger',
		title: 'The restart is late',
		what: 'The restart was asked for more than 15 minutes ago and the machine has not come back.',
		next: [
			{ needs: ['reboot'], key: 'Look at the screen of the machine. You can ask for the restart again.' },
			{ key: 'Look at the screen of the machine.' },
		],
	},
	resuming: {
		group: 'working',
		tone: 'is-info',
		title: 'Getting ready to check',
		what: 'The machine has restarted and is getting ready to be checked.',
		next: 'Wait.',
	},
	verifying: {
		group: 'working',
		tone: 'is-info',
		title: 'Checking the machine',
		what: 'The machine has restarted and is being checked.',
		next: 'Wait.',
	},
	succeeded: {
		group: 'done',
		tone: 'is-success',
		title: 'Upgrade done',
		what: 'The operating system was upgraded.',
		next: 'Close this run.',
	},
	succeeded_with_findings: {
		group: 'done',
		tone: 'is-warning',
		title: 'Upgrade done, with things to look at',
		what: 'The operating system was upgraded, and the check found things for you to look at.',
		next: [
			{ needs: ['resume'], key: 'Read what the check found. Once you have mended what you could, ask for the check again, then close this run.' },
			{ key: 'Read what the check found, then close this run.' },
		],
	},
	failed: {
		group: 'stopped',
		tone: 'is-danger',
		title: 'The upgrade stopped',
		what: 'A step stopped before the point of no return, and the machine was put back as it was.',
		next: [
			{ needs: ['discard'], key: 'Read why below, then close this run or drop the plan.' },
			{ key: 'Read why below, then close this run.' },
		],
	},
	interrupted: {
		group: 'stopped',
		tone: 'is-danger',
		title: 'The upgrade was interrupted',
		what: 'The upgrade stopped running without saying why, before the point of no return.',
		next: 'Wait: ReCasaOS puts the machine back by itself.',
	},
	stopped_at_waypoint: {
		group: 'stopped',
		tone: 'is-danger',
		title: 'The upgrade stopped half way',
		what: 'A step stopped after the point of no return. The machine is half upgraded.',
		next: [
			{ needs: ['resume', 'takeover'], key: 'Read why below. Go on if it can be gone on from, or take the run over.' },
			{ needs: ['takeover'], key: 'Read why below, then take the run over or close this run.' },
			{ key: 'Read why below, then close this run.' },
		],
	},
	needs_attention: {
		group: 'attention',
		tone: 'is-danger',
		title: 'The upgrade needs you',
		what: 'What the upgrade is doing cannot be told.',
		next: [
			{ needs: ['takeover'], key: 'Look at the machine, then take the run over or close it with the word.' },
			{ key: 'Look at the machine, then close this run with the word.' },
		],
	},
	manual: {
		group: 'manual',
		tone: 'is-warning',
		title: 'You took the run over',
		what: 'ReCasaOS no longer acts on this run. Its text is yours to run, one block at a time, in a console.',
		next: 'Finish by hand from the text of the run, then close it with the word.',
	},
	manual_done: {
		group: 'manual',
		tone: 'is-info',
		title: 'Taken over, and the last block has run',
		what: 'You took the run over, and the last block of the check has run.',
		next: 'Close this run.',
	},
}

// The same states told apart by what the status says besides them: why a run failed or needs attention, the kind of run, and whether the
// point of no return is behind. They are chosen by `variantOf`.
export const STATE_VARIANTS = {
	failed_refresh: {
		group: 'stopped',
		tone: 'is-danger',
		title: 'The refresh stopped',
		what: 'The refresh stopped. Some packages of the current release may have been upgraded. The package sources and the timers of apt are back.',
		next: 'Read why below, then close this run.',
	},
	failed_rehearsal: {
		group: 'stopped',
		tone: 'is-danger',
		title: 'The rehearsal stopped',
		what: 'A step stopped, and the machine was put back as it was.',
		next: 'Read why below, then close this run.',
	},
	failed_not_started: {
		group: 'stopped',
		tone: 'is-danger',
		title: 'The run did not start',
		what: 'The upgrade could not be started, and nothing was changed.',
		next: 'Close this run, then try again.',
	},
	failed_start: {
		group: 'stopped',
		tone: 'is-danger',
		title: 'The upgrade could not go on',
		what: [
			{ needs: ['half_upgraded'], key: 'The next step could not be started, and the machine is half upgraded.' },
			{ key: 'The next step could not be started.' },
		],
		next: [
			{ needs: ['resume', 'takeover'], key: 'Go on, or take the run over.' },
			{ needs: ['takeover'], key: 'Take the run over.' },
			{ key: 'Look at the machine.' },
		],
	},
	failed_verify: {
		group: 'stopped',
		tone: 'is-danger',
		title: 'The check found something wrong',
		what: 'The machine restarted, and the check afterwards found an error, or one of its steps stopped.',
		next: [
			{ needs: ['resume'], key: 'Read what it found below. Ask for the check again once you have mended it, take the run over, or close this run.' },
			{ needs: ['takeover'], key: 'Read what it found below, then take the run over or close this run.' },
			{ key: 'Read why below, then close this run.' },
		],
	},
	failed_half: {
		group: 'stopped',
		tone: 'is-danger',
		title: 'The upgrade could not be finished by itself',
		what: 'ReCasaOS tried to repair the upgrade by itself and could not. The machine is half upgraded.',
		next: [
			{ needs: ['resume', 'takeover'], key: 'Go on, or take the run over.' },
			{ needs: ['takeover'], key: 'Take the run over.' },
			{ key: 'Look at the machine.' },
		],
	},
	interrupted_after: {
		group: 'stopped',
		tone: 'is-danger',
		title: 'The upgrade was interrupted half way',
		what: 'The upgrade stopped running without saying why, after the point of no return. The machine is half upgraded.',
		next: [
			{ needs: ['resume', 'takeover'], key: 'Go on, take the run over, or close this run with the word.' },
			{ needs: ['takeover'], key: 'Take the run over, or close this run with the word.' },
			{ needs: ['acknowledge'], key: 'Close this run with the word.' },
			{ key: 'Look at the machine.' },
		],
	},
	needs_attention_systemd_silent: {
		group: 'attention',
		tone: 'is-danger',
		title: 'systemd does not answer',
		what: 'systemd has not answered for half an hour, and nothing that the log knows of is running.',
		next: 'Close this run with the word: nothing else works without systemd, and the upgrade is not asked about.',
	},
	needs_attention_unwind_partial: {
		group: 'attention',
		tone: 'is-danger',
		title: 'The machine was only partly put back',
		what: 'Putting the machine back was only partly done. The folder of the backup is where it was.',
		next: [
			{ needs: ['takeover'], key: 'From a console, put back the sources and the timers with the commands below. Then take the run over or close this run with the word.' },
			{ key: 'From a console, put back the sources and the timers with the commands below. Then close this run with the word.' },
		],
	},
	needs_attention_run_damaged: {
		group: 'attention',
		tone: 'is-danger',
		title: 'The run cannot be read',
		what: 'The log and the files of the run are not what ReCasaOS wrote, or the run cannot be placed. The sources of the next release may still be in place, with the timers stopped.',
		next: [
			{ needs: ['takeover'], key: 'Look at the machine first. Then take the run over, or close this run with the word.' },
			{ key: 'Look at the machine first. Then close this run with the word.' },
		],
	},
}

// A state the page does not know: said as such, with the raw state as text and no button.
export const STATE_UNKNOWN = {
	group: 'unknown',
	tone: 'is-warning',
	title: 'This page does not know this state',
	what: 'ReCasaOS reports the state below, which this version of the page cannot explain or act on.',
	next: 'Look at the machine, or update ReCasaOS.',
}

const ATTENTION_VARIANTS = {
	systemd_silent: 'needs_attention_systemd_silent',
	unwind_partial: 'needs_attention_unwind_partial',
	run_damaged: 'needs_attention_run_damaged',
}

// The table that holds a state, or its variant, chosen from the status. '' for a state the page does not know.
function variantOf(raw) {
	const state = raw.state
	if (!own(STATE_TABLE, state))
		return ''
	const reason = typeof raw.reason === 'string' ? raw.reason : ''
	const pnr = raw.pnr === true
	switch (state) {
		case 'failed':
			if (reason === 'verify')
				return 'failed_verify'
			if (reason === 'half')
				return 'failed_half'
			if (reason === 'start')
				return pnr ? 'failed_start' : 'failed_not_started'
			if (raw.kind === 'refresh')
				return 'failed_refresh'
			if (raw.kind === 'rehearsal')
				return 'failed_rehearsal'
			return 'failed'
		case 'interrupted':
			return pnr ? 'interrupted_after' : 'interrupted'
		case 'needs_attention':
			return own(ATTENTION_VARIANTS, reason) ?? 'needs_attention'
		default:
			return state
	}
}

// ---- why a run stopped --------------------------------------------------------------------------------------------------

// The classes of a stop (osrun.Classes), and the reasons that stand in for a class when a failed run has none (osrun.Reason*): what it is, and
// what the person mends (`fix`). What they do after it depends on the buttons the server offers and not on the class: see `routeOf`. A reason
// (`route: false`) is told by the state it comes with, and has no fix of its own.
export const CLASS_TABLE = {
	busy: {
		what: 'Another package manager was running, or its lock was held.',
		fix: 'Wait until the other package manager ends.',
	},
	network: {
		what: 'A download or an update did not go through.',
		fix: 'Check the network and the name server of the machine.',
	},
	apt_failed: {
		what: 'apt stopped with an error.',
		fix: 'Read the line below and the end of the output.',
	},
	dpkg_broken: {
		what: 'dpkg stopped with a package half done.',
		fix: 'Read the line below.',
	},
	unknown: {
		what: 'The step stopped for a reason nobody foresaw.',
		fix: 'Read the line below and the end of the output.',
	},
	disk: {
		what: 'There was not enough room on the disk.',
		fix: 'Make room.',
	},
	plan: {
		what: 'The machine no longer matches the plan, so the plan can no longer be trusted.',
		fix: null,
	},
	guard: {
		what: 'A safety check stopped the repair.',
		fix: null,
	},
	converge: {
		what: 'The repair could not bring the packages to a steady state.',
		fix: null,
	},
	barrier_kernel: {
		what: 'The kernel that will start next is not as it must be.',
		fix: 'Mend what the line below says.',
	},
	barrier_initrd: {
		what: 'The initramfs of the new kernel is missing or not as it must be.',
		fix: 'Mend what the line below says.',
	},
	barrier_grub: {
		what: 'The boot loader is not ready for the restart.',
		fix: 'Mend what the line below says.',
	},
	barrier_sshd: {
		what: 'The configuration of the ssh server does not pass its own test.',
		fix: 'Mend what the line below says.',
	},
	barrier_resolver: {
		what: 'The machine would start without a working name resolver.',
		fix: 'Mend what the line below says.',
	},
	barrier_other: {
		what: 'Something that stands before the restart is not as it must be.',
		fix: 'Mend what the line below says.',
	},
	identity: {
		what: 'The machine is not the one that this step expects.',
		fix: 'Look at what the line below says.',
	},
	tools: {
		what: 'A tool that this step needs is missing.',
		fix: 'Install the tool that is missing.',
	},
	unit: {
		what: 'The program that runs the steps did not behave as expected.',
		fix: null,
	},
	integrity: {
		what: 'The files of the run are not what ReCasaOS wrote.',
		fix: null,
	},
	abort: {
		what: 'You stopped the upgrade.',
		fix: null,
	},
	// the reasons
	start: {
		what: 'This step could not be started.',
		fix: null,
		route: false,
	},
	verify: {
		what: 'The check after the restart did not pass.',
		fix: null,
		route: false,
	},
	half: {
		what: 'The repairs that ReCasaOS tries by itself did not succeed.',
		fix: null,
		route: false,
	},
	interrupted_power: {
		what: 'The machine lost power or restarted while the upgrade was working.',
		fix: null,
		route: false,
	},
	interrupted_killed: {
		what: 'The upgrade was stopped before it ended.',
		fix: null,
		route: false,
	},
}
// What the person does after a stop, from the buttons the server offers: going on only when `resume` is offered (a stop before the point of
// no return was undone and has nothing to go on from), the run taken over when that is what is offered, else the run closed.
export const ROUTES = {
	goOn: 'Then go on.',
	takeOver: 'Take the run over.',
	retry: 'Close this run, then try again.',
	close: 'Close this run.',
}
// A refresh whose download of the security updates of Debian 11 did not go through: the repository moved (seen for real on 2026-10-14).
export const REFRESH_NETWORK_NOTE = 'If your package sources still name security.debian.org for Debian 11, change it to archive.debian.org/debian-security: the security updates of Debian 11 have moved there.'
export const CLASS_UNKNOWN = 'The step stopped for a reason this page does not know: {code}.'

// What a hint of the status says (HINT: the unit that runs and is quiet, a putting back that was partial), and what a failure's hint says.
export const HINTS = {
	unit_quiet: [
		'The upgrade has printed nothing for {minutes} minutes. Look at the end of its log and at the processes before you decide anything. Stopping it is your own act at a console, and never while apt or dpkg is writing: ReCasaOS never stops it for you.',
		'The upgrade has printed nothing for a long time. Look at the end of its log and at the processes before you decide anything. Stopping it is your own act at a console, and never while apt or dpkg is writing: ReCasaOS never stops it for you.',
	],
	unwind_partial: [
		'Putting everything back only partly worked. The commands below show the folder of the backup and put back the sources and the timers.',
	],
}
export const HINT_UNKNOWN = 'A hint this page does not know: {code}.'
export const FAILURE_HINTS = {
	releaseinfo_change: [
		'apt refused a package source because the description it gives of itself changed (its Origin, Label or Codename). If you know and expect that change, you can run the refresh again and accept it.',
	],
}

// The blocks of the runs, by their id: the number the text of the runbook gives each of the nine of the hop (BLOCK 0 to BLOCK 8), and the
// sentence the core gives each as its title (the core writes them in English; the nine of the hop were translated with the plan section).
export const BLOCK_NUMBERS = { verify: 0, timers: 1, snapshot: 2, sources: 3, download: 4, minimal: 5, full: 6, prereboot: 7, after: 8 }
export const BLOCK_TITLES = [
	'check that this is the machine of the plan, and that it is ready',
	'stop the timers of apt and unattended-upgrades',
	'write down the state of the machine',
	'write the sources of Debian 12, and read the plan again',
	'download the packages of the minimal upgrade, while the applications run',
	'THE POINT OF NO RETURN: the minimal upgrade, then the protected packages',
	'the full upgrade, and until nothing is left to do',
	'check that the machine will start, then restart it yourself',
	'after the restart: look at the machine, then put the sources and the timers back',
	// the four blocks of a refresh, and the one that mends a hop that stopped
	'check that the old release can be brought up to date, and stop the timers of apt',
	'keep a copy of the sources, and fetch the lists of the old release again',
	'bring the packages of the old release to their last state',
	'put the sources and the timers back, and say whether the machine wants a restart',
	'mend what an interrupted upgrade left half done',
]

// How long the list of blocks of an attempt is, by its phase (osrun.BlockList): what a repair has depends on where the hop stopped, and the
// unwinding has none.
const PHASE_BLOCKS = { refresh: 4, rehearse: 5, run: 8, verify: 1 }

// ---- what the check found, and what stands before the restart ----------------------------------------------------------

// The findings of the judge (osverify.Codes), by code, in the weights the core gives them. The sentence does not repeat the `arg`, which the
// component shows beside it as text.
export const FINDINGS = {
	kernel_unexpected: 'The machine runs another kernel than the one the upgrade installed.',
	casaos_unit_down: 'A unit of ReCasaOS that ran before the upgrade does not run now.',
	docker_down: 'Docker ran before the upgrade and does not run now.',
	mounts_missing: 'A pool of disks that was mounted before the upgrade is not mounted now.',
	dpkg_not_quiet: 'dpkg has a package that is not whole.',
	system_not_ready: 'systemd is still starting, or is stopping.',
	units_failed_new: 'Units fail now that did not fail before the upgrade.',
	ports_missing: 'Ports that were listened on before the upgrade are not listened on now.',
	samba_users_changed: 'Samba does not hold the users it held before the upgrade.',
	route_missing: 'The machine had a default route before the upgrade and has none now.',
	dns_missing: 'The name resolver answered before the upgrade and does not now.',
	docker_version_changed: 'The Docker daemon is not the one that ran before the upgrade.',
	docker_source_unreachable: 'Docker\'s package source could not be asked, so it stays put aside. Update Docker afterwards with its own button.',
	container_not_returned: 'A container with a restart policy ran before the upgrade and does not run now.',
	facts_incomplete: 'Some facts about the machine could not be taken, so they were not judged. That does not say they are well.',
	docker_source_not_published: 'Docker publishes nothing yet for the new release.',
	docker_source_paused: 'Docker\'s package source is still put aside.',
	dpkg_dist_new: 'dpkg left new versions of files beside the ones you edited since the upgrade began.',
	sources_left_paused: 'Package sources that the upgrade put aside are still put aside.',
	changed_since_snapshot: 'Something that ran when the upgrade began was stopped before you asked for the restart. The restart did not do that.',
	prereboot_warning: 'The check before the restart warned of something to look at.',
}
export const FINDING_UNKNOWN = 'A finding this page does not know: {code}.'
export const SEVERITY_RANK = { error: 0, warn: 1, info: 2 }
export const SEVERITY_TONES = { error: 'is-danger', warn: 'is-warning', info: 'is-info' }

// What block 7 warns of before the restart (the word in `arg`): a check that passes and that the person is to read.
export const PREREBOOT_WORDS = {
	initrd_small: 'The initramfs of the new kernel is under 5 MiB. That is right on a machine set up with few modules and wrong on one whose initramfs is cut short: check that it holds the driver of your disk and of your network card.',
	grub_cfg_missing: 'There is no /boot/grub/grub.cfg to look at, so whether the boot loader names the new kernel was not checked. A machine that starts with another boot loader was not tried.',
}
export const PREREBOOT_UNKNOWN = 'Block 7 warned of something this page does not know: {code}.'

// The checks that stand before the restart (the core's: fstab_unresolved and fstab_network, and the warnings of block 7). One that is not
// ok keeps the restart from being offered.
export const BARRIER_CHECKS = {
	fstab_unresolved: 'A disk or partition listed in /etc/fstab cannot be found and is not marked nofail, so the machine would stop in rescue mode at its next start.',
	fstab_network: 'A network share in /etc/fstab is mounted at start without _netdev or nofail, so the start waits for the network and stops in rescue mode when it is late.',
}
export const BARRIER_UNKNOWN = 'A check that stands before the restart, which this page does not know: {code}.'

// What the check could not look at (the facts of osverify), as a phrase that stands alone in a list.
export const NOT_JUDGED = {
	kernel: 'the kernel that runs',
	system: 'whether systemd is ready',
	dpkg: 'the state of dpkg',
	samba: 'the users of Samba',
	mounts: 'the mounts',
	route: 'the default route',
	dns: 'the name resolver',
	units: 'the units of ReCasaOS',
	docker: 'the state of Docker',
	containers: 'the containers',
	sources: 'the package sources',
	listening: 'the ports that are listened on',
	failed_units: 'the units that failed',
	all: 'everything',
}
// a note of the backup folder that was there and could not be read (the fact begins with bk:)
export const NOT_JUDGED_NOTE = 'a note that the upgrade took before the restart'
export const NOT_JUDGED_UNKNOWN = 'a fact this page does not know: {code}'

// ---- the buttons --------------------------------------------------------------------------------------------------------

// The buttons the server can offer (osrun.ActionNames), by name: the call of sys.js that a click makes, the word of the ack call it says, its
// label and its confirmation. `danger` marks the step whose confirmation does not have the focus on its main button.
export const BUTTONS = {
	abort: {
		call: 'abortOsUpgrade',
		label: 'Stop and put the machine back',
		confirm: {
			title: 'Stop the upgrade?',
			body: [
				'The upgrade is stopped and the machine is put back as it was: the package sources and the timers of apt come back. The packages that were downloaded stay in the cache of apt.',
			],
			ok: 'Stop and put back',
			danger: true,
		},
	},
	reboot: {
		call: 'rebootOsUpgrade',
		label: 'Restart the machine now',
		confirm: {
			title: 'Restart the machine now?',
			body: [
				'The machine restarts into the new release and is away for a few minutes. This page goes on by itself when it is back.',
				'Be where you can see the screen of the machine: a machine that does not come back cannot show this page.',
			],
			ok: 'Restart now',
			danger: true,
		},
		// the restart that a refresh asks for brings back the same release, brought up to date
		confirmRefresh: {
			title: 'Restart the machine now?',
			body: [
				'The machine restarts and comes back on the same release, with the packages that were just brought up to date: nothing is upgraded to a new release. It is away for a few minutes, and this page goes on by itself when it is back.',
				'Be where you can see the screen of the machine: a machine that does not come back cannot show this page.',
			],
			ok: 'Restart now',
			danger: true,
		},
	},
	resume: {
		call: 'resumeOsUpgrade',
		label: 'Go on with the upgrade',
		confirm: null,
	},
	acknowledge: {
		call: 'ackOsUpgrade',
		ack: 'acknowledge',
		label: 'Close this run',
		confirm: null,
	},
	discard: {
		call: 'ackOsUpgrade',
		ack: 'discard',
		label: 'Close this run and drop the plan',
		confirm: null,
	},
	takeover: {
		call: 'ackOsUpgrade',
		ack: 'manual',
		label: 'Take the run over',
		confirm: {
			title: 'Take the run over?',
			body: [
				'ReCasaOS stops acting on this run: nothing is launched from now on.',
				'The text of the run becomes yours: you read it and paste it into a console, one block at a time, and you close the run when you are done.',
				'This cannot be undone. To close the run afterwards you will have to type a word that this page gives you.',
			],
			ok: 'Take the run over',
			danger: true,
		},
	},
}
// The label of a button that depends on the state it is in: going on after a check is asking for the check again, and dropping a rehearsal
// is putting the machine back.
export const BUTTON_LABELS = {
	checkAgain: 'Check the machine again',
	putBack: 'Put the machine back',
}

function labelOf(action, raw) {
	if (action === 'resume' && (raw.state === 'succeeded_with_findings' || (raw.state === 'failed' && raw.reason === 'verify')))
		return BUTTON_LABELS.checkAgain
	if (action === 'discard' && raw.state === 'rehearsed')
		return BUTTON_LABELS.putBack
	return BUTTONS[action].label
}

// The buttons of a status: exactly the server's list, in the server's order, each once; a name the page does not know has no button, and a
// state the page does not know has none at all.
function buttonsOf(raw, known, wordNeeded) {
	if (!known)
		return []
	const seen = new Set()
	const buttons = []
	for (const action of list(raw.actions)) {
		const entry = own(BUTTONS, action)
		if (!entry || seen.has(action))
			continue
		seen.add(action)
		buttons.push({
			action,
			call: entry.call,
			ack: entry.ack ?? '',
			label: labelOf(action, raw),
			confirm: action === 'reboot' && raw.kind === 'refresh' ? entry.confirmRefresh : entry.confirm,
			// only the word that closes a run is typed: taking over and dropping are not asked for it
			needsWord: wordNeeded && action === 'acknowledge',
		})
	}
	return buttons
}

/** The body of the ack call of a button: the word it says and the word the person typed (only the one that closes a run takes it). {} for the other buttons. */
export function buttonBody(button, word = '') {
	if (!button || !button.ack)
		return {}
	return { action: button.ack, word: button.needsWord ? String(word ?? '').trim() : '' }
}

// The word the core asks for is made of letters, digits and hyphens, at most 64 (service/system_os_upgrade_ack.go).
const WORD = /^[a-z0-9-]{1,64}$/i

/** Whether the typed text is the word the status asks for: the button that closes a run is enabled only then. Never for a status with no word. */
export function wordOk(typed, ackWord) {
	return typeof typed === 'string' && typeof ackWord === 'string' && WORD.test(ackWord) && typed.trim() === ackWord
}

/** What the person says stands between them and a machine that does not come back (the core's: service/system_os_upgrade.go). */
export const SAFETY_NETS = ['snapshot', 'console_and_backup', 'reinstall_ok']
export const SAFETY_NET_TEXTS = {
	snapshot: 'I took a snapshot of the machine',
	console_and_backup: 'I have access to the console and a backup of my data',
	reinstall_ok: 'I can reinstall the machine if it does not come back',
}

/** The acknowledgements of a start, in the order the core lists them. */
export const START_ACKS = ['no_interruption', 'no_way_back', 'sources_paused', 'removals_read']
export const ACK_TEXTS = {
	no_interruption: 'I will not restart the machine, switch it off or run apt while the upgrade works.',
	no_way_back: 'I understand that from the point of no return there is no way back except my snapshot or a console to repair the machine from.',
	sources_paused: 'I understand that the package sources listed below are put aside while the upgrade runs.',
	removals_read: 'I have read the packages listed below, and I accept that the upgrade removes them.',
}

// ---- the refusals -------------------------------------------------------------------------------------------------------

// What each code of the core's refusals says (the start and the refresh, the buttons, the switch and the text of the run), like the plan's
// errors: a list of sentences, the first whose {placeholders} the core's data fills is said and the last has none; `by` names the field of the
// data that tells the sentences apart.
export const REFUSALS = {
	bad_request: [
		'ReCasaOS did not accept a field of the request ({field}).',
		'ReCasaOS did not accept the request.',
	],
	beta_off: ['The upgrade is switched off. Switch it on first.'],
	not_root: ['ReCasaOS does not run as root on this machine, so it cannot upgrade it.'],
	hop_not_planned: ['ReCasaOS cannot upgrade from this release yet.'],
	identity_unsupported: {
		by: 'unknown',
		variants: { true: ['The machine could not be asked just now whether it can be upgraded. Try again in a moment.'] },
		text: ['This machine is not one that ReCasaOS knows how to upgrade, or it has no later release.'],
	},
	run_open: ['An upgrade is open. Finish it or close it first.'],
	manual_run_found: {
		by: 'unknown',
		variants: { true: ['The folder of backups could not be read, so an upgrade done by hand cannot be ruled out. Try again.'] },
		text: [
			'A folder left by an upgrade that was done by hand is in /var/backups ({folder}). Once you have put the sources and the timers back, move it out of /var/backups.',
			'A folder left by an upgrade that was done by hand is in /var/backups. Once you have put the sources and the timers back, move it out of /var/backups.',
		],
	},
	no_plan: {
		by: 'reason',
		variants: {
			idle: ['There is no plan to start from. Make the plan first.'],
			running: ['The plan is being made: wait for it to end.'],
			failed: ['The last plan failed. Make it again.'],
			expired: ['The plan has expired. Make a new one.'],
		},
		text: ['There is no plan to start from. Make the plan first.'],
	},
	plan_changed: ['A newer plan replaced the one you read. Read the new one, then try again.'],
	plan_blocked: ['The plan has a problem that nothing can accept. Read the plan.'],
	plan_older_than_refresh: ['The current release was brought up to date after this plan was made. Make the plan again.'],
	bad_safety_net: ['Choose what you have in case the machine does not come back.'],
	hostname_mismatch: ['The name you typed is not the name of this machine.'],
	acks_missing: ['Tick every box that the upgrade asks for.'],
	removals_mismatch: ['The packages you accepted are not the ones the plan removes. Read the plan again.'],
	paused_mismatch: ['The package sources you accepted are not the ones the plan puts aside. Read the plan again.'],
	sources_changed: ['The package sources of apt changed since the plan was made. Make the plan again.'],
	readiness_refuses: {
		by: 'state',
		variants: {
			unsupported: ['This system is not one that ReCasaOS can upgrade.'],
			latest: ['This system already runs the latest release that ReCasaOS knows.'],
		},
		text: ['The machine is not ready for the upgrade. Read the readiness report, mend what it says, then try again.'],
	},
	busy: {
		by: 'reason',
		variants: {
			unit: ['The upgrade may be running, or systemd does not answer.'],
			unknown: ['Whether another package manager is at work could not be seen. Try again in a moment.'],
		},
		text: ['Another package manager is at work on this machine. Wait for it to end, then try again.'],
	},
	apps_busy: {
		by: 'unknown',
		variants: { true: ['AppManagement did not say whether an app has an operation in progress. Try again in a moment.'] },
		text: [
			'An app has an operation in progress ({names}). Wait for it to end, then try again.',
			'An app has an operation in progress. Wait for it to end, then try again.',
		],
	},
	no_room: [
		'There is not enough room in {path} for the upgrade: {needed} needed, {free} free. Make room, then try again.',
		'The room that is free in {path} could not be read ({needed} needed). Make room, then try again.',
		'There is not enough room for the upgrade. Make room, then try again.',
	],
	source_unrecognized: [
		'A package source is in a form that cannot be written ({file}, line {line}). If a repository could not be told, run apt-get update first.',
		'A package source is in a form that cannot be written ({file}). If a repository could not be told, run apt-get update first.',
		'A package source is in a form that cannot be written. If a repository could not be told, run apt-get update first.',
	],
	runbook_unsafe: ['The text of the upgrade could not be written safely: a line of your package sources holds what ends a block of it. Nothing was started.'],
	runbook_too_large: ['The text of the upgrade would be too large: shorten the comments in your package sources and the number of third-party source files. Nothing was started.'],
	start_failed: ['ReCasaOS could not carry this out. No package was touched.'],
	no_run: ['There is no upgrade to act on.'],
	run_unreadable: ['The upgrade that is open cannot be read. The only thing to do with it is to close it with the word.'],
	not_abortable: {
		by: 'reason',
		variants: {
			point_of_no_return: ['The upgrade is past its point of no return: it can no longer be called off.'],
			past_block: ['It is too late to stop: the step that upgrades the packages has begun.'],
			not_running: ['The upgrade is not running, so there is nothing to stop.'],
		},
		text: ['The upgrade cannot be stopped now.'],
	},
	not_awaiting_reboot: ['The machine is not waiting for its restart.'],
	barrier_failed: ['Something that stands before the restart is not well. Mend it first.'],
	unit_active: ['The upgrade may still be running, or systemd does not answer, so nothing can be closed or taken over now.'],
	dpkg_locked: ['Another package manager is changing the packages. Wait for it to end, then try again.'],
	reboot_failed: ['systemd would not restart the machine. Try again, or restart it from a console.'],
	not_resumable: ['This run cannot be gone on with from where it stands. Take it over by hand.'],
	not_terminal: ['The upgrade is not in a state that this button is for. The state it is in now is shown above.'],
	word_required: ['The machine is half upgraded or needs attention: type the word to close this run.'],
	bad_word: ['The word you typed is not the one that is asked for.'],
	close_failed: ['The backup folder of the upgrade could not be put away, so the run stays as it was. Try again, or look at the folder.'],
	internal: ['The request could not be carried out.'],
	// the restart and the shutdown of the top bar, while an upgrade works on the machine
	os_upgrade_open: ['An upgrade of the operating system is changing the machine: it cannot be restarted or switched off until the upgrade stops or asks for it.'],
}
export const REFUSAL_UNKNOWN = 'The core refused: {code}'

// The sentences of a call that did not get a refusal: no answer, an answer of a core that does not have the feature, a session that ended.
export const CALL_ERRORS = {
	signin: 'Your session has ended. Sign in again, then try again.',
	unavailable: 'This version of ReCasaOS cannot upgrade the operating system yet. Update ReCasaOS, then try again.',
	timeout: 'The request took too long. It may have gone through: the state above is what the machine says now.',
	failed: 'The request could not be completed. Try again.',
}

// the codes of the refusals that name things the person can read: the checks of the readiness report, those before the restart, the boxes of the start form
const ITEMS = {
	readiness_refuses: (data) => {
		const checks = list(data.checks).filter(isPlain).map(check => clean(check.code, 60)).filter(Boolean)
		return checks.map(code => ({ code, message: own(READINESS_CHECKS, code) ? msg(READINESS_CHECKS[code].label) : null }))
	},
	barrier_failed: (data) => {
		return list(data.checks).filter(isPlain).filter(check => check.ok !== true).map(check => barrierItem(check)).map(item => ({ code: item.code, message: item.message }))
	},
	acks_missing: data => list(data.missing).filter(code => typeof code === 'string').map(code => ({ code: clean(code, 40), message: own(ACK_TEXTS, code) ? msg(ACK_TEXTS[code]) : null })),
}

const MAX_ITEMS = 30

// The parameters a refusal's sentences can use: the plan's (a file, a path, a line, a size) and the few of its own.
function refusalParams(data, locale) {
	const params = paramsOf(data, locale)
	for (const name of ['folder', 'field']) {
		const value = clean(data[name], 120)
		if (value)
			params[name] = value
	}
	const apps = names(data.apps)
	if (apps && !params.names)
		params.names = apps
	return params
}

/**
 * What a call that failed says. A refusal of the core (400, 409 or 500 with `data.error_code`) is the sentence of its code, with the things it
 * names as `items`; a code this page does not know is said as one, with the code as text. Anything else is a call that did not go through: a
 * session that ended, a core that does not have the feature, an answer that did not come, or one that could not be completed. `kind` tells
 * which. A call that changed something and got no answer at all is told like one that timed out: it may have been carried out. A read
 * (`read: true`) changed nothing, and is told to be tried again. Never the core's own words (`data.error`): they are English, and they are
 * only ever the person's to read in the raw answer.
 */
export function failureOf(error, locale = 'en_us', { read = false } = {}) {
	const response = error?.response
	const status = Number.isInteger(response?.status) ? response.status : 0
	const body = isPlain(response?.data) && isPlain(response.data.data) ? response.data.data : null
	const code = body && typeof body.error_code === 'string' ? clean(body.error_code, 60) : ''
	if (code && (status === 409 || status === 400 || status === 500)) {
		const data = isPlain(body.data) ? body.data : {}
		const entry = own(REFUSALS, code)
		const message = entry ? { ...sentenceFor(entry, data, refusalParams(data, locale)) } : msg(REFUSAL_UNKNOWN, { code })
		const items = (entry && own(ITEMS, code) ? ITEMS[code](data) : []).slice(0, MAX_ITEMS)
		return { kind: 'refusal', status, code, message, items }
	}
	let kind = 'failed'
	if (status === 401)
		kind = 'signin'
	else if (status === 404)
		kind = 'unavailable'
	else if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT' || (!read && unanswered(error)))
		kind = 'timeout'
	return { kind, status, code: '', message: msg(CALL_ERRORS[kind]), items: [] }
}

// A request that went out and got no answer at all (the connection dropped, the network failed): it may have reached the core and been
// carried out, as one that timed out may have. An error that is none of the client's own (a mistake of this page's) is not one.
function unanswered(error) {
	return isPlain(error) && !error.response && (error.code === 'ERR_NETWORK' || error.message === 'Network Error' || error.request !== undefined)
}

/** The sentence of the two refusals that the restart and the shutdown of the top bar meet while an upgrade works on the machine, or null for any other failure. */
export function powerRefusal(error) {
	const failure = failureOf(error)
	if (failure.kind === 'refusal' && failure.status === 409 && (failure.code === 'os_upgrade_open' || failure.code === 'barrier_failed'))
		return failure.message
	return null
}

// ---- the barrier, the findings, the lists ---------------------------------------------------------------------------

function barrierItem(check) {
	const code = clean(check.code, 60)
	const arg = shown(check.arg, 80)
	let message
	if (code === 'prereboot_warning') {
		const sentence = own(PREREBOOT_WORDS, arg)
		message = sentence ? msg(sentence) : msg(PREREBOOT_UNKNOWN, { code: arg || '?' })
	} else {
		const sentence = own(BARRIER_CHECKS, code)
		message = sentence ? msg(sentence) : msg(BARRIER_UNKNOWN, { code: code || '?' })
	}
	return { code, message, ok: check.ok === true, severity: severityOf(check.severity) }
}

// the weight of a finding or a check: one this page does not know is a warning, never a pass
function severityOf(severity) {
	return own(SEVERITY_RANK, severity) !== undefined ? severity : 'warn'
}
const severityLabel = severity => TEXT.severities[severity]

function barrierOf(raw) {
	if (!isPlain(raw))
		return null
	const checks = list(raw.checks).filter(isPlain).slice(0, MAX_ITEMS).map((check) => {
		const item = barrierItem(check)
		// a warning of block 7 is a check that passes, and the person's to read: a code that says nothing of it is not one
		const word = item.code === 'prereboot_warning' ? shown(check.arg, 80) : ''
		return { ...item, tone: item.ok ? 'is-info' : 'is-danger', arg: item.code === 'prereboot_warning' && own(PREREBOOT_WORDS, word) ? '' : shown(check.arg, 80) }
	})
	const red = checks.filter(check => !check.ok)
	return {
		// the restart is held back unless the core says it is ok and every check says so: an answer that is not "ok" is not one
		blocked: raw.ok !== true || red.length > 0,
		red,
		warnings: checks.filter(check => check.ok && check.code === 'prereboot_warning'),
	}
}

function findingsOf(raw, hideContainers) {
	return list(raw).filter(isPlain).slice(0, 100)
		.filter(item => !(hideContainers && item.code === 'container_not_returned'))
		.map((item) => {
			const code = clean(item.code, 60)
			const severity = severityOf(item.severity)
			const arg = shown(item.arg, 120)
			let message
			let argText = arg
			if (code === 'prereboot_warning' && own(PREREBOOT_WORDS, arg)) {
				message = msg(PREREBOOT_WORDS[arg])
				argText = ''
			} else if (code === 'prereboot_warning' && arg) {
				message = msg(PREREBOOT_UNKNOWN, { code: arg })
				argText = ''
			} else if (own(FINDINGS, code)) {
				message = msg(FINDINGS[code])
			} else {
				message = msg(FINDING_UNKNOWN, { code: code || '?' })
			}
			// what the check could not judge is listed beside, in words
			if (code === 'facts_incomplete')
				argText = ''
			return {
				code,
				message,
				severity,
				severityLabel: severityLabel(severity),
				tone: SEVERITY_TONES[severity],
				arg: argText,
				apps: list(item.apps).filter(app => typeof app === 'string' && clean(app)).slice(0, MAX_NAMES).map(app => clean(app, 80)),
			}
		})
		.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
}

function notJudgedOf(raw) {
	return list(raw).filter(item => typeof item === 'string' && clean(item)).slice(0, MAX_ITEMS).map((item) => {
		const code = clean(item, 80)
		if (own(NOT_JUDGED, code))
			return { code, message: msg(NOT_JUDGED[code]), arg: '' }
		if (code.startsWith('bk:'))
			return { code, message: msg(NOT_JUDGED_NOTE), arg: code.slice(3) }
		return { code, message: msg(NOT_JUDGED_UNKNOWN, { code }), arg: '' }
	})
}

function notReturnedOf(raw) {
	return list(raw).filter(isPlain).map(item => ({ name: clean(item.container, 80), policy: clean(item.policy, 40) })).filter(item => item.name).slice(0, MAX_NAMES * 5)
		.map(item => ({ ...item, message: item.policy ? msg(TEXT.lists.container, { name: item.name, policy: item.policy }) : msg(TEXT.lists.containerNoPolicy, { name: item.name }) }))
}

function blockOf(raw) {
	if (!isPlain(raw))
		return null
	const id = clean(raw.id, 40)
	const title = clean(raw.title, 160)
	const index = Number.isInteger(raw.index) && raw.index >= 1 ? raw.index : 0
	if (!id && !title && !index)
		return null
	return {
		index,
		id,
		// the number the text of the runbook gives it, when it is one of the hop's nine
		number: own(BLOCK_NUMBERS, id) ?? null,
		title,
		// the sentence of the language files that the title is, or '' when the core sent one that has none
		titleKey: BLOCK_TITLES.includes(title) ? title : '',
	}
}

function progressOf(phase, block) {
	const total = own(PHASE_BLOCKS, phase)
	if (!block || !block.index)
		return { progress: null, step: null }
	if (!total)
		return { progress: null, step: msg(TEXT.summary.stepAlone, { index: block.index }) }
	const index = Math.min(block.index, total)
	return {
		progress: { value: index, max: total, label: msg(TEXT.summary.progress, { index, total }) },
		step: msg(TEXT.summary.step, { index, total }),
	}
}

function manualOf(raw) {
	if (!isPlain(raw))
		return null
	const done = list(raw.blocks_done).filter(id => typeof id === 'string').map(id => clean(id, 40)).filter(Boolean).slice(0, 20)
	const next = clean(raw.next_block, 40)
	const number = id => own(BLOCK_NUMBERS, id) ?? null
	return {
		done: done.map(id => ({ id, number: number(id) })),
		next: next ? { id: next, number: number(next) } : null,
		pnr: raw.pnr === true,
		backupFolder: shown(raw.bk_path, 200),
	}
}

function afterRebootHintOf(raw) {
	if (!isPlain(raw))
		return null
	return {
		backupFolder: shown(raw.bk_path, 200),
		log: shown(raw.log, 200),
		commands: commandsOf(raw.commands),
		block8: blockText(raw.block8),
	}
}

function hintOf(raw) {
	if (!isPlain(raw))
		return null
	const code = clean(raw.code, 40)
	const entry = own(HINTS, code)
	const seconds = Number.isInteger(raw.quiet_seconds) && raw.quiet_seconds > 0 ? raw.quiet_seconds : 0
	return {
		code,
		message: entry ? sentenceFor(entry, {}, seconds ? { minutes: String(Math.max(1, Math.round(seconds / 60))) } : {}) : msg(HINT_UNKNOWN, { code: code || '?' }),
		commands: commandsOf(raw.commands),
	}
}

// What the person does after a stop: what they mend, then where the buttons the server offers lead. Nothing for a stop this page does not
// know, and nothing for a reason (the state says it).
function routeOf(entry, facts) {
	if (facts.has('resume'))
		return entry.fix ? ROUTES.goOn : null
	if (facts.has('takeover'))
		return ROUTES.takeOver
	if (facts.has('acknowledge') || facts.has('discard'))
		return facts.has('pnr') ? ROUTES.close : ROUTES.retry
	return null
}

function failureView(raw, run, facts) {
	if (!isPlain(raw))
		return null
	const code = clean(raw.class, 40)
	const entry = own(CLASS_TABLE, code)
	const hint = own(FAILURE_HINTS, raw.hint)
	const detail = shown(raw.detail_line, 400)
	const rc = Number.isInteger(raw.rc) ? raw.rc : null
	const route = entry && entry.route !== false ? routeOf(entry, facts) : null
	return {
		code,
		stage: clean(raw.stage, 40),
		// the core always sends a status, 0 when no block exited (a check that failed, a run that did not start): it is said when it tells something
		rc: rc !== null && (rc !== 0 || detail) ? rc : null,
		detail,
		what: entry ? msg(entry.what) : msg(CLASS_UNKNOWN, { code: code || '?' }),
		next: [entry?.fix, route].filter(Boolean).map(key => msg(key)),
		// a refresh whose downloads of the security updates did not go through: the repository of Debian 11 moved
		note: run.kind === 'refresh' && code === 'network' ? msg(REFRESH_NETWORK_NOTE) : null,
		hintCode: hint ? raw.hint : '',
		hint: hint ? msg(hint[0]) : null,
	}
}

function causeOf(raw) {
	if (raw.state !== 'interrupted')
		return null
	if (raw.boot_unknown === true)
		return msg(TEXT.cause.unknown)
	const sentence = own(TEXT.cause, raw.cause)
	return msg(sentence ?? TEXT.cause.unknown)
}

// ---- the status ---------------------------------------------------------------------------------------------------------

const MAX_LOG_LINES = 200
const SUCCEEDED = ['succeeded', 'succeeded_with_findings']
const WAITING_FOR_RESTART = ['awaiting_reboot', 'reboot_stalled']

/**
 * The view of GET /v1/sys/os/upgrade/status, or null for an answer that is not a status. A state this page does not know is a view too: it
 * says so, with the raw state as text, and has no button (nothing is guessed). Everything in it is cleaned and cut, and every sentence is a
 * language-file key with its parameters.
 */
export function statusView(raw, locale = 'en_us') {
	if (!isPlain(raw) || typeof raw.state !== 'string' || !raw.state)
		return null
	const variant = variantOf(raw)
	const known = variant !== ''
	const entry = known ? (own(STATE_TABLE, variant) ?? own(STATE_VARIANTS, variant)) : STATE_UNKNOWN
	const runId = clean(raw.run_id, 40)
	const open = raw.state !== 'idle' || runId !== ''
	const word = typeof raw.ack_word === 'string' ? raw.ack_word : ''
	const buttons = buttonsOf(raw, known, word !== '')
	// what the server offers, and the two flags that sentences depend on
	const facts = new Set([...buttons.map(button => button.action), ...raw.pnr === true ? ['pnr'] : [], ...raw.half_upgraded === true ? ['half_upgraded'] : []])
	const failure = failureView(raw.failure, raw, facts)
	const block = blockOf(raw.block)
	const { progress, step } = progressOf(clean(raw.phase, 20), block)
	const notReturned = notReturnedOf(raw.not_returned)
	const idleAndClean = raw.state === 'idle' && runId === ''
	const betaEnabled = raw.beta_enabled === true
	const refreshFailed = raw.state === 'failed' && raw.kind === 'refresh' && raw.pnr !== true && failure?.hintCode === 'releaseinfo_change'
	const view = {
		known,
		state: known ? raw.state : clean(raw.state, 40),
		reason: clean(raw.reason, 40),
		open,
		group: entry.group,
		groupLabel: TEXT.groups[entry.group],
		tone: entry.tone,
		title: entry.title,
		what: pick(entry.what, facts),
		next: pick(entry.next, facts),
		cause: causeOf(raw),
		kind: { code: clean(raw.kind, 20), label: own(TEXT.kinds, raw.kind) ?? '' },
		hop: clean(raw.hop, 40),
		attempt: count(raw.attempt) ?? 0,
		block,
		step,
		progress,
		since: formatMoment(raw.since, locale),
		lastActivity: formatMoment(raw.last_activity_at, locale),
		expiresAt: formatMoment(raw.expires_at, locale),
		banners: [
			// a run that ended well is no longer between the point of no return and the end
			raw.pnr === true && !SUCCEEDED.includes(raw.state) && { id: 'pnr', key: TEXT.banners.pnr, tone: 'is-danger' },
			raw.half_upgraded === true && { id: 'half_upgraded', key: TEXT.banners.halfUpgraded, tone: 'is-danger' },
			raw.busy === true && { id: 'busy', key: TEXT.banners.busy, tone: 'is-warning' },
		].filter(Boolean),
		failure,
		hint: hintOf(raw.hint),
		barrier: barrierOf(raw.barrier),
		// the machine waits for its restart, the restart is not offered, and the checks that hold it back were not made yet
		barrierPending: WAITING_FOR_RESTART.includes(raw.state) && !isPlain(raw.barrier) && !facts.has('reboot'),
		findings: findingsOf(raw.findings, notReturned.length > 0),
		notJudged: notJudgedOf(raw.not_judged),
		notReturned,
		manual: manualOf(raw.manual),
		afterRebootHint: afterRebootHintOf(raw.after_reboot_hint),
		logTail: list(raw.log_tail).filter(item => typeof item === 'string').slice(-MAX_LOG_LINES).map(item => shown(item, 400)).filter(Boolean),
		reboot: isPlain(raw.reboot) ? { stalled: raw.reboot.stalled === true } : null,
		// the word that closes a run, as the core spells it: a word that is not made as the core makes them is not typed, and the button stays shut
		wordNeeded: word !== '',
		ackWord: WORD.test(word) ? word : '',
		buttons,
		// the text of the run is asked for when the run is taken over, and when the person asks for it; a refresh has none to run by hand (the core
		// answers no_run)
		runbook: { auto: raw.state === 'manual' || raw.state === 'manual_done', available: known && open && raw.kind !== 'refresh' },
		// what begins something: the switch, the refresh, the rehearsal and the upgrade are offered when no run is open, and the refresh again
		// (with the change accepted) for a refresh that apt stopped for a repository whose release information changed
		launch: {
			betaEnabled,
			switch: idleAndClean,
			refresh: betaEnabled && (idleAndClean || refreshFailed),
			acceptChange: betaEnabled && refreshFailed,
			start: betaEnabled && idleAndClean,
		},
		planId: typeof raw.plan_id === 'string' && /^p1-[0-9a-f]{32}$/.test(raw.plan_id) ? raw.plan_id : '',
		runId: /^[0-9a-f-]{36}$/.test(runId) ? runId : '',
	}
	// the codes that the sentences are about, shown small beside them as text, for support
	view.codes = [...new Set([view.state, view.reason, failure?.code, failure?.stage].filter(Boolean))]
	view.changeKey = changeKey(view)
	return view
}

/** What makes two views the same change: a new state, or the same state for another reason, another class of stop, another cause. */
export function changeKey(view) {
	return view ? [view.state, view.reason, view.failure?.code ?? '', view.cause?.key ?? '', view.reboot?.stalled ? 'stalled' : ''].join('|') : ''
}

/** The sentence for the live region when the state changed between two views: one per change, none before the first view or for the same state. */
export function announcement(previous, next) {
	if (!previous || !next || previous.changeKey === next.changeKey)
		return null
	return msg(next.title)
}

// ---- polling, and a core that does not answer ---------------------------------------------------------------------------

/** How long to wait before asking for the status again, in milliseconds. */
export const POLL_MS = { open: 5000, idle: 15000, error: 10000 }

/**
 * When to ask for the status next: nothing at all while the document is hidden (the page asks at once when it is shown again, with
 * `last` set back to 'none'), at once when nothing was asked yet, 10 seconds after an error whatever else is true, then 5 seconds while a run
 * is open and 15 when none is. `last` is 'none', 'ok' or 'error'; anything else is an error.
 */
export function nextPoll(last, options = {}) {
	const { hidden = false, runOpen = false } = isPlain(options) ? options : {}
	if (hidden)
		return null
	if (last === 'none')
		return 0
	if (last !== 'ok')
		return POLL_MS.error
	return runOpen ? POLL_MS.open : POLL_MS.idle
}

/**
 * Why the status could not be read, from the error of the call: a session that ended ('signin'), a core that does not have the feature
 * ('unavailable'), a core that does not answer or whose gateway says it is gone ('down': no answer, a timeout, a 5xx), or something else
 * ('failed': an answer that is not a status, a refusal, or no answer at all from a browser that is offline).
 */
export function statusFailure(error) {
	const status = error?.response?.status
	if (status === 401)
		return 'signin'
	if (status === 404)
		return 'unavailable'
	// no answer at all while the browser itself is offline is the person's own network, and not a core that restarts
	if (!error?.response)
		return typeof navigator !== 'undefined' && navigator.onLine === false ? 'failed' : 'down'
	if (Number.isInteger(status) && status >= 500)
		return 'down'
	return 'failed'
}

/** After how long without an answer the page stops saying that the machine is restarting and says to look at its screen. */
export const RESTART_LOOK_AFTER_MS = 15 * 60 * 1000

/**
 * How much longer than the asks are apart a silence has to be for the page to know that it was the one that was paused (a tab put to sleep,
 * a closed lid) and not the core that was away: the longest wait between two asks is 15 seconds, and an ask that gets no answer waits 10.
 */
export const PAUSE_GAP_MS = 60 * 1000

/**
 * When the outage that is on the screen began, in milliseconds: at the first ask that failed after an answer, and again when the page was
 * not asking for longer than the asks are apart. `since` is when it began (0 for none), `previousAt` when the ask before this one was made
 * (0 for none) and `now` when this one failed. The page says how long the core has not answered from here, so that a tab that was hidden
 * for twenty minutes does not tell the person that the machine has been silent for twenty minutes.
 */
export function outageStart(since, previousAt, now) {
	const began = Number.isFinite(since) && since > 0 ? since : 0
	if (!began)
		return now
	return Number.isFinite(previousAt) && previousAt > 0 && now - previousAt > PAUSE_GAP_MS ? now : began
}

/**
 * How long, written the same in every language (the units are the symbols s, min and h): seconds under a minute, minutes and seconds under an
 * hour, then hours and minutes.
 */
export function formatElapsed(ms) {
	const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0
	const two = value => String(value).padStart(2, '0')
	if (total < 60)
		return `${total} s`
	if (total < 3600)
		return `${Math.floor(total / 60)} min ${two(total % 60)} s`
	return `${Math.floor(total / 3600)} h ${two(Math.floor(total / 60) % 60)} min`
}

/**
 * What to say while the status cannot be read. `kind` is `statusFailure` of the error, `elapsedMs` the time since the outage began (see
 * `outageStart`) and `last` the last good view. A core that restarts during the hop is not an error: while a run is open the page says that the
 * machine is restarting and that it goes on by itself, with the time, and after 15 minutes says to look at the machine, with what the status
 * carried before the restart for that case. Without a run that is open, nothing is known of a restart, and the page says only that the state
 * could not be read. The same clock runs for any failure while a run is open (an answer that is not a status, a refusal, a gateway's login
 * page): only a core that is away is said to be restarting, but after 15 minutes of anything the person is sent to the machine. So is a page
 * that read nothing, opened while the core was away: it cannot tell that a run is open, and cannot keep silent about it for an hour.
 * `unavailable` has no message: the core does not have the feature, and the section says nothing.
 */
export function outageView({ kind, elapsedMs = 0, last = null }) {
	if (kind === 'signin')
		return { level: 'signin', message: msg(TEXT.outage.signin), elapsed: null, hint: null }
	if (kind === 'unavailable')
		return { level: 'unavailable', message: null, elapsed: null, hint: null }
	const unreadable = { level: 'unreadable', message: msg(TEXT.outage.unreadable), elapsed: null, hint: null }
	if (last && !last.open)
		return unreadable
	const time = formatElapsed(elapsedMs)
	if (elapsedMs >= RESTART_LOOK_AFTER_MS)
		return { level: 'look', message: msg(TEXT.outage.look, { time }), elapsed: null, hint: last?.afterRebootHint ?? null }
	if (kind !== 'down' || !last)
		return unreadable
	// nothing is said of the time before a second has gone by
	return { level: 'restarting', message: msg(TEXT.outage.restarting), elapsed: elapsedMs >= 1000 ? msg(TEXT.outage.elapsed, { time }) : null, hint: null }
}

// ---- starting -----------------------------------------------------------------------------------------------------------

// the name of a machine as the core takes it (service/system_os_upgrade_start.go)
const HOSTNAME = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i

/** Whether the text is shaped like the name of a machine. Whether it is the name of THIS machine is the core's to say: it never says it. */
export function hostnameOk(text) {
	return typeof text === 'string' && HOSTNAME.test(text.trim())
}

// the removals that the person is asked to accept and the sources that are put aside, as the core compares them to what it has (it reads the same
// two places of its plan): the names of the problems `removal_manual`, and the files of the paused sources with their line when they have one.
// Exactly as the plan lists them, sorted, each once; nothing is cleaned, so that what is sent is what the core compares.
function removalNames(plan) {
	const found = list(plan.problems).filter(problem => isPlain(problem) && problem.code === 'removal_manual' && isPlain(problem.data) && typeof problem.data.name === 'string' && problem.data.name)
	return [...new Set(found.map(problem => problem.data.name))].sort()
}
function pausedNames(plan) {
	const found = list(plan.paused).filter(item => isPlain(item) && typeof item.file === 'string' && item.file)
	return [...new Set(found.map(item => Number.isInteger(item.line) && item.line > 0 ? `${item.file}:${item.line}` : item.file))].sort()
}

/**
 * What a start of this plan asks of the person, from the plan as the core sent it: the id of the plan, whether it blocks (a start of a blocked
 * plan is refused), the acknowledgements it needs (`no_interruption` always, `no_way_back` for the upgrade and not for a rehearsal,
 * `sources_paused` when it puts sources aside, `removals_read` when it has removals to accept), whether it needs a safety net, and the
 * removals and sources the person accepts, as the plan lists them. null for something that is not a plan.
 */
export function startNeeds(plan, rehearsal = false) {
	if (!isPlain(plan))
		return null
	const view = planView(plan)
	if (!view || !view.id)
		return null
	const removals = removalNames(plan)
	const paused = pausedNames(plan)
	// the core asks for the acknowledgement of the sources whenever the plan puts one aside, a Docker one included
	const sourcesPut = list(plan.paused).some(item => isPlain(item))
	const needed = ['no_interruption']
	if (!rehearsal)
		needed.push('no_way_back')
	if (sourcesPut)
		needed.push('sources_paused')
	if (removals.length)
		needed.push('removals_read')
	return { planId: view.id, blocked: view.verdict === 'blocked', safetyNet: !rehearsal, acks: needed, removals, paused }
}

/**
 * The request of a start, or what is missing from it. `plan` is the plan as the core sent it; `input` is what the person said: { rehearsal,
 * safetyNet, hostname, acks } (the acknowledgements ticked, as a list or a Set). The body has exactly the fields the core knows, spelled as it
 * spells them; `accept_removals` and `paused_sources` are the plan's own lists, never what the person ticked; a rehearsal sends no safety net
 * (an empty one, which the core takes) and needs neither that nor `no_way_back`. `missing` names what is not there, in the order of the form:
 * `plan`, `safety_net`, `hostname`, then the acknowledgements by their names. There is no body while anything is missing.
 */
export function startBody(plan, given = {}) {
	const input = isPlain(given) ? given : {}
	const rehearsal = input.rehearsal === true
	const needs = startNeeds(plan, rehearsal)
	if (!needs || needs.blocked)
		return { ok: false, body: null, missing: ['plan'] }
	const ticked = new Set(input.acks instanceof Set ? [...input.acks] : list(input.acks))
	const missing = []
	if (needs.safetyNet && !SAFETY_NETS.includes(input.safetyNet))
		missing.push('safety_net')
	if (!hostnameOk(input.hostname))
		missing.push('hostname')
	for (const ack of needs.acks) {
		if (!ticked.has(ack))
			missing.push(ack)
	}
	if (missing.length)
		return { ok: false, body: null, missing }
	return {
		ok: true,
		missing,
		body: {
			plan_id: needs.planId,
			rehearsal,
			safety_net: needs.safetyNet ? input.safetyNet : '',
			hostname: input.hostname.trim(),
			accept_removals: needs.removals,
			paused_sources: needs.paused,
			acks: needs.acks,
		},
	}
}

// ---- every key ----------------------------------------------------------------------------------------------------------

// Every string of a table that is only strings (a key, a list of keys, a table of such), for the language files' test.
function strings(value) {
	if (typeof value === 'string')
		return [value]
	if (Array.isArray(value))
		return value.flatMap(strings)
	if (isPlain(value))
		return Object.entries(value).filter(([name]) => name !== 'by' && name !== 'needs').flatMap(([, item]) => strings(item))
	return []
}

/**
 * Every language-file key that this module says, once: the tables above, with the placeholders as they are. The component looks up no other
 * key for the upgrade; the language files have each of them in English (as itself) and in French.
 */
export const UPGRADE_KEYS = [...new Set([
	...strings(TEXT),
	...[STATE_TABLE, STATE_VARIANTS].flatMap(table => Object.values(table)).flatMap(entry => [entry.title, ...keysOf(entry.what), ...keysOf(entry.next)]),
	STATE_UNKNOWN.title,
	STATE_UNKNOWN.what,
	STATE_UNKNOWN.next,
	...Object.values(CLASS_TABLE).flatMap(entry => [entry.what, entry.fix]).filter(Boolean),
	...strings(ROUTES),
	REFRESH_NETWORK_NOTE,
	CLASS_UNKNOWN,
	...strings(HINTS),
	HINT_UNKNOWN,
	...strings(FAILURE_HINTS),
	...BLOCK_TITLES,
	...strings(FINDINGS),
	FINDING_UNKNOWN,
	...strings(PREREBOOT_WORDS),
	PREREBOOT_UNKNOWN,
	...strings(BARRIER_CHECKS),
	BARRIER_UNKNOWN,
	...strings(NOT_JUDGED),
	NOT_JUDGED_NOTE,
	NOT_JUDGED_UNKNOWN,
	...Object.values(BUTTONS).flatMap(entry => [entry.label, ...[entry.confirm, entry.confirmRefresh].flatMap(confirm => confirm ? [confirm.title, ...confirm.body, confirm.ok] : [])]),
	...strings(BUTTON_LABELS),
	...strings(REFUSALS),
	REFUSAL_UNKNOWN,
	...strings(CALL_ERRORS),
	...strings(SAFETY_NET_TEXTS),
	...strings(ACK_TEXTS),
])].filter(key => typeof key === 'string' && key)
