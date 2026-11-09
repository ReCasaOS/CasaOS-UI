// The server keeps one schedule per app and destination. The page shows one per
// set of settings, with every app it covers, so a nightly backup of ten apps is
// made and changed once, not ten times. Saving spreads it back to one per app.

import { ice_i18n } from '@/mixins/base/common-i18n'

// The name the box's own backups are filed under, as the server knows it.
export const SYSTEM_APP = 'casaos-system'

// What a backup event is about: the box, or the app by its title. The title is
// optional JSON (an app with no `x-casaos` has none), so a bad one falls back to the name.
export function backupSubject(properties, t, box = 'this box') {
	if (properties['app:name'] === SYSTEM_APP) {
		return t(box)
	}
	try {
		const title = properties['app:title'] && ice_i18n(JSON.parse(properties['app:title']))
		if (title) {
			return title
		}
	} catch {
		// fall through to the name
	}

	return properties['app:name']
}

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
		// the box's own slots: the same for every app of a group
		if (schedule.last_slot && schedule.next_slot && !group.last_slot) {
			group.last_slot = schedule.last_slot
			group.next_slot = schedule.next_slot
		}
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

// A slot the box gives, "2026-11-07T03:00:00+01:00": `at` is a date whose local fields
// are the box's wall clock, so it reads as the box says it whatever zone the browser is in;
// `instant` is the moment itself.
function boxSlot(iso) {
	const [, year, month, day, hour, minute] = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(iso || '') || []
	const instant = Date.parse(iso)
	if (!year || Number.isNaN(instant)) {
		return null
	}

	return { at: new Date(Number(year), month - 1, day, hour, minute), instant }
}

// A due slot older than this is overdue, not "within a minute": the box checks every minute.
export const DUE_GRACE = 5 * 60000

// When a schedule goes off next, by the server's own rule: the most recent slot
// at or before now is run if the last run is before it (a missed slot catches
// up at the next check), otherwise the slot after it. null when disabled. `late` is
// how long a due slot has been due, in ms. The box gives its slots (`last_slot`, `next_slot`);
// an older box does not, and they are worked out from `at` in the browser's zone.
export function nextRun(schedule, now = new Date()) {
	if (!schedule.enabled) {
		return null
	}
	const last = boxSlot(schedule.last_slot)
	const next = boxSlot(schedule.next_slot)
	if (last && next) {
		if (!schedule.last_run || new Date(schedule.last_run) < last.instant) {
			return { due: true, at: last.at, late: Math.max(0, now - last.instant) }
		}

		return { due: false, at: next.at }
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
		return { due: true, at: slot, late: Math.max(0, now - slot) }
	}
	slot.setDate(slot.getDate() + step)

	return { due: false, at: slot }
}

// Which schedule goes off first, over all of them: a missed slot (due) before any
// future one, then the earliest. null when none is enabled.
export function nextOfAll(schedules, now = new Date()) {
	return (Array.isArray(schedules) ? schedules : [])
		.map(schedule => nextRun(schedule, now))
		.filter(Boolean)
		.sort((a, b) => (b.due - a.due) || (a.at - b.at))[0] || null
}

// How long a go took: the longest run of the batch taken alone. Not first start to last
// finish, which counts the wait between runs and one stray record as work.
export function longestRun(batch) {
	const spans = batch.map(run => Date.parse(run.finished_at) - Date.parse(run.started_at)).filter(span => span >= 0)

	return spans.length ? Math.max(...spans) : null
}

// "4 min", "1 h 30", "12 s"
export function durationText(ms) {
	const seconds = Math.max(0, Math.round(ms / 1000))
	if (seconds < 60) {
		return `${seconds} s`
	}
	const minutes = Math.round(seconds / 60)
	if (minutes < 60) {
		return `${minutes} min`
	}

	return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
}

// A moment, the way one says it: today, tomorrow or yesterday with the time, a weekday
// within the week, the date beyond. `t` is the component's $t, bound.
export function whenOf(date, t) {
	const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
	const today = new Date()
	today.setHours(0, 0, 0, 0)
	const days = Math.round((new Date(date).setHours(0, 0, 0, 0) - today) / 86400000)
	if (days === 0) {
		return t('today at {time}', { time })
	}
	if (days === 1) {
		return t('tomorrow at {time}', { time })
	}
	if (days === -1) {
		return t('yesterday at {time}', { time })
	}
	if (Math.abs(days) < 7) {
		return date.toLocaleString(undefined, { weekday: 'long', hour: '2-digit', minute: '2-digit' })
	}

	return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
