// One status for each state of the core, with the buttons the core lists for it (osrun.ActionsFor), and where the guide puts it.
// ---- the core's words, pinned here ------------------------------------------------------------------------------------
// This list MIRRORS the core (osrun.States, pkg/osrun/vocab.go of the engine of v0.4.74): a state added to the core without a place in the
// journey, or dropped from it, is noticed.
export const STATES = ['idle', 'refreshing', 'reboot_first', 'refreshed', 'rehearsing', 'rehearsed', 'rehearsal_done', 'running', 'unwinding', 'recovering', 'awaiting_reboot', 'rebooting', 'reboot_stalled', 'resuming', 'verifying', 'succeeded', 'succeeded_with_findings', 'failed', 'interrupted', 'stopped_at_waypoint', 'needs_attention', 'manual', 'manual_done']

export const RUN = '0b9cbd61-5d2c-4a39-9c3e-2f7c0a1d6a11'
export const ACK_WORD = 'I-KNOW-THIS-MACHINE-IS-HALF-UPGRADED'

export function raw(state, changes = {}) {
	return {
		beta_enabled: true,
		state,
		hop: 'debian-11-12',
		attempt: 0,
		pnr: false,
		half_upgraded: false,
		busy: false,
		since: null,
		last_activity_at: null,
		actions: [],
		log_tail: [],
		run_id: state === 'idle' ? '' : RUN,
		...changes,
	}
}

// The status of each state with the buttons the core lists for it (osrun.ActionsFor), and where the journey puts it.
export const CASES = {
	idle: { extra: {}, actions: [], step: null },
	refreshing: { extra: { kind: 'refresh' }, actions: ['abort'], step: 'refresh', phase: 'working' },
	reboot_first: { extra: { kind: 'refresh' }, actions: ['reboot', 'acknowledge'], step: 'refresh', phase: 'restart', primary: 'reboot' },
	refreshed: { extra: { kind: 'refresh' }, actions: ['acknowledge'], step: 'refresh', phase: 'close', primary: 'close' },
	rehearsing: { extra: { kind: 'rehearsal' }, actions: ['abort'], step: 'rehearse', phase: 'working' },
	rehearsed: { extra: { kind: 'rehearsal' }, actions: ['discard'], step: 'rehearse', phase: 'discard', primary: 'discard' },
	rehearsal_done: { extra: { kind: 'rehearsal' }, actions: ['acknowledge'], step: 'rehearse', phase: 'close', primary: 'close' },
	running: { extra: { kind: 'hop', pnr: true }, actions: [], step: 'start', phase: 'working' },
	unwinding: { extra: { kind: 'hop' }, actions: [], step: 'start', phase: 'working' },
	recovering: { extra: { kind: 'hop', pnr: true }, actions: [], step: 'start', phase: 'working' },
	awaiting_reboot: { extra: { kind: 'hop', pnr: true }, actions: ['reboot', 'takeover'], step: 'finish', phase: 'restart', primary: 'reboot' },
	rebooting: { extra: { kind: 'hop', pnr: true }, actions: [], step: 'finish', phase: 'working' },
	reboot_stalled: { extra: { kind: 'hop', pnr: true }, actions: ['reboot', 'takeover'], step: 'finish', phase: 'stopped' },
	resuming: { extra: { kind: 'hop', pnr: true }, actions: [], step: 'finish', phase: 'working' },
	verifying: { extra: { kind: 'hop', pnr: true }, actions: [], step: 'finish', phase: 'working' },
	succeeded: { extra: { kind: 'hop', pnr: true }, actions: ['acknowledge'], step: 'finish', phase: 'close', primary: 'close' },
	succeeded_with_findings: { extra: { kind: 'hop', pnr: true }, actions: ['resume', 'acknowledge'], step: 'finish', phase: 'close', primary: 'close' },
	failed: { extra: { kind: 'hop', reason: 'network' }, actions: ['acknowledge', 'discard'], step: 'start', phase: 'stopped' },
	interrupted: { extra: { kind: 'hop', pnr: true, half_upgraded: true }, actions: [], step: 'start', phase: 'stopped' },
	stopped_at_waypoint: { extra: { kind: 'hop', pnr: true, half_upgraded: true, ack_word: ACK_WORD }, actions: ['resume', 'acknowledge', 'takeover'], step: 'start', phase: 'stopped' },
	needs_attention: { extra: { kind: 'hop', reason: 'run_damaged', half_upgraded: true, ack_word: ACK_WORD }, actions: ['acknowledge', 'takeover'], step: 'start', phase: 'stopped' },
	manual: { extra: { kind: 'hop', pnr: true, ack_word: ACK_WORD }, actions: ['acknowledge'], step: 'start', phase: 'stopped' },
	manual_done: { extra: { kind: 'hop', pnr: true }, actions: ['acknowledge'], step: 'finish', phase: 'close', primary: 'close' },
}
