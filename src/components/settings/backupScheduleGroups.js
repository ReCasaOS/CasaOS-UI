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
			groups.set(key, { ...settings, apps: [] })
		}
		const group = groups.get(key)
		if (!group.apps.includes(schedule.app)) {
			group.apps.push(schedule.app)
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
