// The server keeps one schedule per app and destination. The page shows one per
// set of settings, with every app it covers, so a nightly backup of ten apps is
// made and changed once, not ten times. Saving spreads it back to one per app.

// The name the box's own backups are filed under, as the server knows it.
export const SYSTEM_APP = 'casaos-system'

const SETTINGS = ['destination', 'every', 'at', 'weekday', 'keep', 'hold_still', 'enabled']

export function groupSchedules(schedules) {
	const groups = new Map()
	for (const schedule of schedules) {
		const settings = Object.fromEntries(SETTINGS.map(key => [key, schedule[key]]))
		const key = JSON.stringify(settings)
		if (!groups.has(key)) {
			groups.set(key, { ...settings, apps: [], last_run: '' })
		}
		const group = groups.get(key)
		if (!group.apps.includes(schedule.app)) {
			group.apps.push(schedule.app)
		}
		// the latest run of its apps; Go's zero time means none
		const last = schedule.last_run && !schedule.last_run.startsWith('0001') ? schedule.last_run : ''
		if (last && (!group.last_run || new Date(last) > new Date(group.last_run))) {
			group.last_run = last
		}
	}

	return [...groups.values()]
}

export function spreadGroups(groups) {
	return groups.flatMap(group => group.apps.map(app => ({
		app,
		...Object.fromEntries(SETTINGS.map(key => [key, group[key]])),
	})))
}

// When a schedule goes off next, by the server's own rule: the most recent slot
// at or before now is run if the last run is before it (a missed slot catches
// up at the next check), otherwise the slot after it. null when disabled.
export function nextRun(schedule, now = new Date()) {
	if (!schedule.enabled) {
		return null
	}
	const [hour, minute] = String(schedule.at).split(':').map(Number)
	if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
		return null
	}
	const slot = new Date(now)
	slot.setHours(hour, minute, 0, 0)
	const step = schedule.every === 'weekly' ? 7 : 1
	if (schedule.every === 'weekly') {
		slot.setDate(slot.getDate() - ((slot.getDay() - Number(schedule.weekday) + 7) % 7))
	}
	if (slot > now) {
		slot.setDate(slot.getDate() - step)
	}
	if (!schedule.last_run || new Date(schedule.last_run) < slot) {
		return { due: true, at: slot }
	}
	slot.setDate(slot.getDate() + step)

	return { due: false, at: slot }
}
