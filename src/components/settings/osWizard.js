/**
 * The guided journey of the upgrade of the operating system, as a function of the views the window already has: the status of the run, the
 * readiness report and the plan. Nothing here asks the core or keeps anything: the window can be reloaded, or opened in another browser, and
 * the same journey is read again from the core's own answers.
 *
 * A step is `done` only when the core said so (a state it reported, a plan it holds). A step that the window cannot tell about, because the
 * core keeps no trace of it, is `skipped` ("not confirmed") and never `done`. A state the window does not know blocks everything.
 */
import { startNeeds } from './osUpgrade'

const isPlain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const own = (table, key) => typeof key === 'string' && Object.hasOwn(table, key) ? table[key] : undefined

export const STEP_IDS = ['check', 'refresh', 'plan', 'rehearse', 'start', 'finish']

export const TEXT = {
	heading: 'Upgrade guide',
	stepsLabel: 'Steps of the upgrade',
	stepOf: 'Step {n} of {total}: {title}',
	changed: 'Now at step {n} of {total}: {title}',
	skip: 'Skip the rehearsal',
	already: 'I already did it',
	details: 'Details of this step',
	finished: 'The upgrade is finished and the operation is closed.',
	steps: {
		check: {
			title: 'Check the machine',
			what: 'Reads the machine and says whether it can be upgraded, then you switch the upgrade on. Nothing is changed on the machine.',
		},
		refresh: {
			title: 'Bring the current release up to date',
			what: 'Installs the pending updates of the current release, removes nothing, and restarts the machine if it asks for it.',
		},
		plan: {
			title: 'Prepare the plan',
			what: 'Works out what apt would do to upgrade, in a temporary folder. Nothing is changed on the machine.',
		},
		rehearse: {
			title: 'Rehearse',
			what: 'Runs the half of the upgrade that can be undone, then puts the machine back. Optional, and recommended.',
		},
		start: {
			title: 'Start the upgrade',
			what: 'Upgrades the packages. Take a snapshot and be at the console first: from the point of no return there is no way back except your snapshot.',
		},
		finish: {
			title: 'Restart and check',
			what: 'Restarts the machine into the new release, checks it, and gives the verdict. The machine is away for a few minutes.',
		},
	},
	states: {
		done: 'Done',
		current: 'Current step',
		todo: 'To do',
		blocked: 'Blocked',
		stopped: 'Stopped',
		skipped: 'Not confirmed',
	},
	reasons: {
		skipped: 'This page cannot tell whether this was done.',
		stopped: 'The operation stopped at this step. Read why below.',
		bad_check: 'The check says the machine is not ready.',
		unsupported: 'This system cannot be upgraded from here.',
		latest: 'This system already runs the latest release.',
		no_plan: 'A plan cannot be made on this machine just now.',
		plan_blocked: 'The plan has a problem that nothing can accept.',
	},
	actions: {
		continue: 'Continue',
		beta: 'Switch the upgrade on',
		checkAgain: 'Check again',
		reboot: 'Restart now',
		discard: 'Put the machine back',
		start: 'Start the upgrade',
		finish: 'Finish',
	},
}

// What the person does next, by where the journey stands.
export const NEXT = {
	reading: 'Reading the state of the machine.',
	unknown: 'This page does not know the state of the operation. Look at the machine, or update ReCasaOS.',
	unavailable: 'The upgrade guide is not available for this machine.',
	stale: 'The state shown is the last one that was read. This page keeps asking.',
	stopped: 'The operation stopped at this step. Read why below and use the buttons of the operation.',
	finished: TEXT.finished,
	check_idle: 'Check that this machine can be upgraded. Nothing is changed on the machine.',
	check_busy: 'The machine is being checked. This takes up to 20 seconds.',
	check_failed: 'The check could not be made. Try it again.',
	check_blocked: 'The check found something that stops the upgrade. Mend what the report says, then check again.',
	check_unsupported: 'This system cannot be upgraded from here.',
	check_latest: 'This system already runs the latest release.',
	check_beta: 'The machine can be checked. Switch the upgrade on to go on.',
	refresh_idle: 'Bring the current release up to date. Nothing is removed, and the machine is restarted only if it asks for it.',
	refresh_working: 'The current release is being brought up to date. Wait, and do not run apt yourself.',
	refresh_restart: 'The machine wants a restart before the upgrade can be planned. Restart it now: this page goes on by itself when it is back.',
	refresh_close: 'The current release is up to date. Continue to close this operation and prepare the plan.',
	plan_wait: 'Reading whether a plan can be made.',
	plan_idle: 'Prepare the plan: what apt would do to upgrade, with the machine unchanged.',
	plan_older: 'The current release was brought up to date after this plan was made. The plan has to be prepared again.',
	plan_running: 'The plan is being prepared. This takes a few minutes.',
	plan_failed: 'The plan failed. Read why below, then prepare it again.',
	plan_unavailable: 'A plan cannot be made on this machine just now. Read the details below.',
	rehearse_idle: 'Rehearse the half of the upgrade that can be undone. This is recommended, and you can skip it.',
	rehearse_working: 'The rehearsal is running. Wait, and do not run apt or restart the machine.',
	rehearse_discard: 'The rehearsal is ready. Put the machine back to go on.',
	rehearse_close: 'The machine is as it was. Continue to close the rehearsal and go on.',
	start_idle: 'Start the upgrade. You will confirm with your snapshot, a console and the name of the machine. After the point of no return there is no way back except your snapshot.',
	start_working: 'The upgrade is running. Wait, and do not run apt or restart the machine.',
	start_blocked: 'The plan has a problem that nothing can accept. Read the plan.',
	finish_restart: 'Every step is done and the machine waits for its restart. Restart it when you are ready, and be where you can see its screen.',
	finish_working: 'The machine is restarting or being checked. This page goes on by itself.',
	finish_close: 'The upgrade is over. Finish to close this operation.',
	finish_findings: 'The upgrade is over, with things to look at. Read them, then finish.',
}

// The state of the run as the guide reads it: nothing to do but wait (`working`), a restart (`restart`), closing the operation (`close`),
// putting the machine back after a rehearsal (`discard`), or a stop that needs the person and has its own buttons (`stopped`).
export const STATE_PHASES = {
	idle: 'idle',
	refreshing: 'working',
	reboot_first: 'restart',
	refreshed: 'close',
	rehearsing: 'working',
	rehearsed: 'discard',
	rehearsal_done: 'close',
	running: 'working',
	unwinding: 'working',
	recovering: 'working',
	awaiting_reboot: 'restart',
	rebooting: 'working',
	reboot_stalled: 'stopped',
	resuming: 'working',
	verifying: 'working',
	succeeded: 'close',
	succeeded_with_findings: 'close',
	failed: 'stopped',
	interrupted: 'stopped',
	stopped_at_waypoint: 'stopped',
	needs_attention: 'stopped',
	manual: 'stopped',
	manual_done: 'close',
}

// the states of the last step: the machine waits for its restart, restarts, is checked, or has its verdict
const FINISH_STATES = new Set(['awaiting_reboot', 'rebooting', 'reboot_stalled', 'resuming', 'verifying', 'succeeded', 'succeeded_with_findings', 'manual_done'])
const VERDICT_STATES = new Set(['succeeded', 'succeeded_with_findings', 'manual_done'])
const BAD_READINESS = new Set(['blocked', 'unsupported', 'latest'])

/** What the guide remembers of this visit. It is only a memory of what the core said: nothing in it is a step done by itself. */
export const newMemory = () => ({ refreshed: false, refreshSkipped: false, rehearsed: false, rehearseSkipped: false, finished: false, closeRehearsal: false, stalePlanIds: [] })

/**
 * The memory after the status moved from `before` to `after` (views of the status, or null): a refresh that the core reported as refreshed
 * and that was then closed is a refresh done; so is a rehearsal that was put back and closed, and an upgrade that had its verdict and was
 * closed. `planId` is the plan that is alive when a refresh is seen: it is older than the refresh.
 */
export function remember(memory, before, after, planId = '') {
	const next = { ...memory, stalePlanIds: [...memory.stalePlanIds] }
	if (isPlain(before) && !after?.open) {
		if (before.kind?.code === 'refresh' && before.state === 'refreshed')
			next.refreshed = true
		if (before.kind?.code === 'rehearsal' && (before.state === 'rehearsal_done' || before.state === 'rehearsed')) {
			next.rehearsed = true
			next.closeRehearsal = false
		}
		if (before.kind?.code === 'hop' && VERDICT_STATES.has(before.state))
			next.finished = true
	}
	if (after?.open && after.kind?.code === 'refresh' && planId && !next.stalePlanIds.includes(planId))
		next.stalePlanIds.push(planId)
	return next
}

/**
 * The memory once a plan is alive: a plan that is not older than a refresh means the person went past the refresh (or left it out), so that
 * making the plan again from the plan's own section does not take the guide back to the refresh. It says nothing of a refresh being done.
 */
export function notePlan(memory, planId) {
	if (!planId || memory.stalePlanIds.includes(planId) || memory.refreshed || memory.refreshSkipped)
		return memory
	return { ...memory, refreshSkipped: true }
}

/** The memory after the core refused a start because the plan is older than the refresh: the core says the refresh was done, and the plan is not good. */
export function forgetPlan(memory, planId) {
	if (!planId)
		return memory
	return { ...memory, refreshed: true, stalePlanIds: memory.stalePlanIds.includes(planId) ? memory.stalePlanIds : [...memory.stalePlanIds, planId] }
}

const buttonOf = (view, action) => view.buttons.find(button => button.action === action) ?? null

/**
 * What the guide does by itself once the status is read: after a rehearsal was put back, the operation that ended is closed. Only after the
 * person asked to put the machine back, and only when the core offers the close without a word.
 */
export function autoAction(view, memory) {
	if (!isPlain(view) || !isPlain(memory) || memory.closeRehearsal !== true || view.state !== 'rehearsal_done' || !Array.isArray(view.buttons))
		return null
	const button = buttonOf(view, 'acknowledge')
	return button && !button.needsWord ? 'close' : null
}

function stepOfRun(view) {
	if (view.kind.code === 'refresh')
		return 'refresh'
	if (view.kind.code === 'rehearsal')
		return 'rehearse'
	return FINISH_STATES.has(view.state) || view.reason === 'verify' ? 'finish' : 'start'
}

function phaseOf(view) {
	const phase = own(STATE_PHASES, view.state) ?? 'stopped'
	// the core puts a run back by itself before the point of no return
	return view.state === 'interrupted' && view.pnr !== true ? 'working' : phase
}

const act = (action, label) => ({ action, label })

/**
 * Where the journey stands. `status` is the view of the status (statusView) or null; `stale` is true when the last ask failed; `readiness`
 * is { asked, busy, failed, state }; `plan` is { ready, plannable, running, failed, raw } with `raw` the plan on the screen, or null;
 * `memory` is newMemory() as remember() moved it; `canCheck` is whether the machine can be checked at all.
 * Returns { steps: [{ id, state, reason }], current, next: { key, params }, primary, secondary, blocked, busy, auto, mode }: `primary` is the
 * one action of the window ({ action, label }) or null, `secondary` the one other choice, `blocked` that nothing here can go on, `busy` that
 * the machine works, `auto` what the window asks of the core by itself on arriving here ('plan' or '').
 */
export function wizardView(input = {}) {
	const given = isPlain(input) ? input : {}
	const status = isPlain(given.status) && given.status.known === true && typeof given.status.state === 'string' && Array.isArray(given.status.buttons) && isPlain(given.status.launch) && isPlain(given.status.kind) ? given.status : null
	const readiness = isPlain(given.readiness) ? given.readiness : {}
	const plan = isPlain(given.plan) ? given.plan : {}
	const memory = isPlain(given.memory) ? { ...newMemory(), ...given.memory } : newMemory()
	if (!Array.isArray(memory.stalePlanIds))
		memory.stalePlanIds = []
	const stale = given.stale === true
	const canCheck = given.canCheck !== false
	const needs = startNeeds(plan.raw ?? null, false)
	const planId = needs ? needs.planId : ''
	const planAlive = Boolean(planId) && !memory.stalePlanIds.includes(planId)
	const planOlder = Boolean(planId) && !planAlive
	const rest = { memory, status, planAlive, readiness, stale }
	const out = (current, mode, options = {}) => settle({ ...rest, current, mode, ...options })

	if (isPlain(given.status) && given.status.known === false)
		return out(null, 'unknown', { blocked: 'unknown' })
	if (!status)
		return out(null, 'reading', { blocked: 'reading' })
	if (!status.open && !canCheck)
		return out(null, 'unavailable', { blocked: 'unavailable' })
	if (status.open)
		return place(status, stale, out)

	// ---- no run is open ----
	if (memory.finished)
		return out(null, 'finished')
	const beta = status.launch.betaEnabled === true
	const state = typeof readiness.state === 'string' ? readiness.state : ''
	const go = action => stale ? null : action
	if (readiness.busy === true)
		return out('check', 'check_busy', { busy: true })
	if (BAD_READINESS.has(state))
		return out('check', `check_${state}`, { blocked: state === 'blocked' ? 'bad_check' : state, primary: state === 'blocked' ? go(act('check', TEXT.actions.checkAgain)) : null })
	if (!beta) {
		if (readiness.failed === true)
			return out('check', 'check_failed', { primary: go(act('check', TEXT.actions.checkAgain)) })
		if (state === 'ready' || state === 'attention')
			return out('check', 'check_beta', { primary: go(act('beta', TEXT.actions.beta)) })
		return out('check', 'check_idle', { primary: go(act('check', TEXT.actions.continue)) })
	}
	if (!(memory.refreshed || memory.refreshSkipped || planAlive)) {
		return out('refresh', 'refresh_idle', {
			primary: status.launch.refresh ? go(act('refresh', TEXT.actions.continue)) : null,
			secondary: go({ action: 'already', label: TEXT.already }),
		})
	}
	if (!planAlive) {
		if (plan.running === true)
			return out('plan', 'plan_running', { busy: true })
		if (plan.ready !== true)
			return out('plan', 'plan_wait', { busy: true })
		if (plan.plannable !== true)
			return out('plan', 'plan_unavailable', { blocked: 'no_plan' })
		if (plan.failed === true)
			return out('plan', 'plan_failed', { primary: go(act('plan', TEXT.actions.continue)) })
		return out('plan', planOlder ? 'plan_older' : 'plan_idle', { primary: go(act('plan', TEXT.actions.continue)), auto: stale ? '' : 'plan' })
	}
	const rehearsalPassed = memory.rehearsed || memory.rehearseSkipped
	if (needs.blocked)
		return out(rehearsalPassed ? 'start' : 'rehearse', 'start_blocked', { blocked: 'plan_blocked' })
	const startable = status.launch.start === true
	if (!rehearsalPassed) {
		return out('rehearse', 'rehearse_idle', {
			primary: startable ? go(act('rehearse', TEXT.actions.continue)) : null,
			secondary: go({ action: 'skip', label: TEXT.skip }),
		})
	}
	return out('start', 'start_idle', { primary: startable ? go(act('start', TEXT.actions.start)) : null })
}

// A run is open: its step is the one of its kind and state, and what the person can do is what the core offers.
function place(status, stale, out) {
	const current = stepOfRun(status)
	const phase = phaseOf(status)
	if (phase === 'stopped')
		return out(current, 'stopped', { stopped: true, blocked: 'stopped' })
	if (phase === 'working')
		return out(current, `${current}_working`, { busy: true })
	let action = null
	if (phase === 'restart') {
		action = buttonOf(status, 'reboot') ? act('reboot', TEXT.actions.reboot) : null
	} else if (phase === 'discard') {
		action = buttonOf(status, 'discard') ? act('discard', TEXT.actions.discard) : null
	} else {
		const button = buttonOf(status, 'acknowledge')
		// the word that closes a run is typed in the operation's own box, never here
		if (button && !button.needsWord)
			action = act('close', current === 'finish' ? TEXT.actions.finish : TEXT.actions.continue)
	}
	const mode = `${current}_${phase}`
	return out(current, mode === 'finish_close' && status.state === 'succeeded_with_findings' ? 'finish_findings' : mode, { primary: stale ? null : action })
}

// the state of every step, from where the journey stands
function settle({ current, mode, memory, status, planAlive, readiness, stale, blocked = '', stopped = false, busy = false, primary = null, secondary = null, auto = '' }) {
	const open = Boolean(status?.open)
	const kind = status?.kind?.code ?? ''
	// what the core said, step by step: true is "done" and nothing less
	const said = {
		check: open || readiness.state === 'ready' || readiness.state === 'attention',
		refresh: memory.refreshed,
		plan: planAlive || (open && kind !== 'refresh'),
		rehearse: memory.rehearsed,
		start: open && kind !== 'refresh' && kind !== 'rehearsal' && current === 'finish',
		finish: memory.finished,
	}
	const index = mode === 'finished' ? STEP_IDS.length : (current ? STEP_IDS.indexOf(current) : -1)
	const steps = STEP_IDS.map((id, at) => {
		if (mode === 'finished')
			return { id, state: 'done', reason: null }
		if (index < 0 || at > index)
			return { id, state: 'todo', reason: null }
		if (at < index)
			return said[id] ? { id, state: 'done', reason: null } : { id, state: 'skipped', reason: TEXT.reasons.skipped }
		if (stopped)
			return { id, state: 'stopped', reason: TEXT.reasons.stopped }
		if (blocked)
			return { id, state: 'blocked', reason: own(TEXT.reasons, blocked) ?? null }
		return { id, state: 'current', reason: null }
	})
	// a state the window cannot read says so; a stale answer keeps the place and says it is old
	const sentence = ['reading', 'unknown', 'unavailable'].includes(mode) ? mode : (stale && mode !== 'finished' ? 'stale' : mode)
	return {
		steps,
		current,
		next: { key: own(NEXT, sentence) ?? NEXT.reading, params: {} },
		primary,
		secondary,
		blocked: Boolean(blocked),
		busy,
		auto: blocked ? '' : auto,
		mode,
	}
}

/** Every language-file key that this module says, once, for the language files' test. */
export const WIZARD_KEYS = (() => {
	const keys = []
	const walk = (value) => {
		if (typeof value === 'string')
			keys.push(value)
		else if (isPlain(value))
			Object.values(value).forEach(walk)
	}
	walk(TEXT)
	walk(NEXT)
	return [...new Set(keys)]
})()
