// What the dashboard says about a software RAID array, from LocalStorage's GET /v1/disks/raid.

// raid1 → RAID 1, raid10 → RAID 10, linear → Linear
export function raidLevel(level = '') {
	return level.startsWith('raid') ? `RAID ${level.slice(4)}` : level.charAt(0).toUpperCase() + level.slice(1)
}

// The state of an array as a tag: its Buefy type and its text, translated with t.
export function raidTag(array, t) {
	const percent = array.progress >= 0 ? Math.floor(array.progress) : null
	const withPercent = (key, fallback) => (percent === null ? t(fallback) : t(key, { percent }))
	switch (array.state) {
		case 'ok':
			return { type: 'is-success', text: t('Healthy') }
		case 'degraded':
			return { type: 'is-danger', text: t('Degraded') }
		case 'rebuilding':
			return { type: 'is-warning', text: withPercent('Rebuilding {percent} %', 'Rebuilding') }
		case 'resyncing':
			return { type: 'is-info', text: withPercent('Resyncing {percent} %', 'Resyncing') }
		case 'checking':
			return { type: 'is-info', text: withPercent('Checking {percent} %', 'Checking') }
		case 'reshaping':
			return { type: 'is-info', text: t('Reshaping') }
		default:
			return { type: 'is-danger', text: t('Not running') }
	}
}

// An array that needs someone: one that lacks a disk, has a failed one, is rebuilding or does not run.
export function raidNeedsAttention(array) {
	return ['degraded', 'rebuilding', 'inactive'].includes(array.state)
}

// "1 h 20 min left", "5 min left", or '' when the time is not known
export function raidRemaining(seconds, t) {
	if (!(seconds >= 0)) {
		return ''
	}
	const minutes = Math.max(1, Math.round(seconds / 60))
	if (minutes < 60) {
		return t('{minutes} min left', { minutes })
	}
	return t('{hours} h {minutes} min left', { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
}

// The levels a new array can be made at, each with the least number of disks it takes. raid0 is not here: one failed disk loses everything on it.
export const RAID_LEVELS = { raid1: 2, raid5: 3, raid6: 4, raid10: 4 }

// What an array of disks of these sizes holds, and how many failed disks it is sure to survive; null when there are too few disks for the level.
export function raidEstimate(level, sizes) {
	const count = sizes.length
	if (!(count >= RAID_LEVELS[level])) {
		return null
	}
	const smallest = Math.min(...sizes)
	// raid10 keeps two copies: a failed disk is lost with its twin only, but only one is certain
	const data = { raid1: 1, raid5: count - 1, raid6: count - 2, raid10: count / 2 }[level]
	const survives = { raid1: count - 1, raid5: 1, raid6: 2, raid10: 1 }[level]
	return { capacity: data * smallest, survives }
}
