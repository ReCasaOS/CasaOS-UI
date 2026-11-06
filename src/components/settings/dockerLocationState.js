// The state of a Docker data move, for the dashboard; no network here, so
// it can be tested alone.

// The phases of a move, as i18n keys.
export const PHASES = {
	stopping: 'Stopping the apps and Docker…',
	copying: 'Copying the data…',
	switching: 'Switching to the new place…',
	starting: 'Starting Docker and the apps…',
}

export function moving(state) {
	return Boolean(state && PHASES[state.phase])
}

// How far the copy is, as a whole percent; null before it starts. The two
// sizes are not measured the same way (the copied bytes are rsync's, the total
// is what the data takes on disk), so the figure is an estimate: it stops at 99
// until the copy is over rather than sit at 100 while it goes on.
export function copyPercent(state) {
	if (!state?.total_bytes || !state.copied_bytes) {
		return null
	}
	return Math.min(99, Math.floor(state.copied_bytes / state.total_bytes * 100))
}

// Where the data is, for people.
export function locationLabel(state) {
	return state?.location || '/var/lib/docker'
}
