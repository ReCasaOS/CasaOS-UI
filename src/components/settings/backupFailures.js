// A scheduled backup that failed at three in the morning went into the run log
// and nowhere else: the dashboard was closed, and History is a tab nobody opens
// until they need a backup. So the failures still standing are said once, where
// the dashboard opens.
//
// Standing: the latest backup of an app to a destination is a scheduled one
// that failed. A later success of the same pair retires the failure; a run
// somebody asked for by hand was watched by that somebody; a restore is not a
// backup.

const STORAGE_KEY = 'casaos-backup-failures-seen'

export function failuresToAnnounce(runs, seen = []) {
	const latest = new Map()
	for (const run of runs || []) {
		if (!run || run.restore)
			continue
		const key = `${run.app}|${run.destination}`
		const current = latest.get(key)
		if (!current || Date.parse(run.started_at) > Date.parse(current.started_at))
			latest.set(key, run)
	}

	return [...latest.values()].filter(run => run.scheduled && run.error && !seen.includes(run.stamp))
}

export function seenBackupFailures() {
	try {
		const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')

		return Array.isArray(list) ? list : []
	} catch {
		return []
	}
}

export function rememberBackupFailures(stamps) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(stamps.slice(-50)))
	} catch {
		// a browser with storage off: the failure is said again next time, which is no worse than before
	}
}
