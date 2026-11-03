// The words the tabs pick by a value a box sends (language-file keys), kept here so that the keys' test sees them.

// A grid item's status; anything else is shown as the box wrote it.
export const STATE_WORDS = { running: 'Running', exited: 'Stopped', paused: 'Paused', restarting: 'Restarting' }

// A VM's state, as the VM page words them.
export const VM_STATE_WORDS = { 'running': 'Running', 'shut-off': 'Stopped', 'paused': 'Paused', 'crashed': 'Crashed' }

// GET /v1/sys/autoupdate state, as the top bar words them.
export const AUTO_WORDS = { up_to_date: 'Up to date', waiting: 'Waiting', updating: 'Updating…', paused: 'Paused' }

// GET /v1/sys/os support.state: the word and the tag's tone. `unknown` shows no tag.
export const SUPPORT_WORDS = { supported: ['Supported', 'is-success'], ending_soon: ['Support ends soon', 'is-warning'], security_ended: ['Support ended', 'is-danger'] }

export const FLEET_WORDS = [
	...Object.values(STATE_WORDS),
	...Object.values(VM_STATE_WORDS),
	...Object.values(AUTO_WORDS),
	...Object.values(SUPPORT_WORDS).map(([word]) => word),
]
