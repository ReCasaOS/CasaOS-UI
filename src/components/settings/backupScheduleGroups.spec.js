import { describe, expect, it } from 'vitest'
import { durationText, groupSchedules, nextOfAll, nextRun, spreadGroups } from './backupScheduleGroups.js'

const nightly = { destination: 'nas', every: 'daily', at: '03:00', weekday: 1, keep: 7, hold_still: true, enabled: true }

describe('schedules shown per set of settings', () => {
	it('puts the apps that share every setting in one schedule, and keeps the others apart', () => {
		const groups = groupSchedules([
			{ app: 'blog', ...nightly, last_run: '2026-11-06T03:00:00Z' },
			{ app: 'casaos-system', ...nightly, last_run: '2026-11-05T03:00:00Z' },
			{ app: 'photos', ...nightly, at: '04:00' },
		])

		expect(groups).toEqual([
			{ ...nightly, apps: ['blog', 'casaos-system'], last_run: '2026-11-06T03:00:00Z' },
			{ ...nightly, at: '04:00', apps: ['photos'], last_run: '' },
		])
	})

	it('goes back to one schedule per app, the settings copied to each', () => {
		const schedules = spreadGroups([{ ...nightly, apps: ['blog', 'casaos-system'] }])

		expect(schedules).toEqual([{ app: 'blog', ...nightly }, { app: 'casaos-system', ...nightly }])
	})

	it('saves what it loaded unchanged', () => {
		const loaded = [{ app: 'a', ...nightly }, { app: 'b', ...nightly, every: 'weekly', weekday: 5 }, { app: 'c', ...nightly }]

		expect(spreadGroups(groupSchedules(loaded))).toEqual([loaded[0], loaded[2], loaded[1]])
	})
})

describe('the next run of a schedule', () => {
	// local times, like the box's own clock
	const at = (day, hour, minute = 0) => new Date(2026, 10, day, hour, minute)
	const now = at(7, 10)

	it('is the next slot once the last one has run', () => {
		const next = nextRun({ ...nightly, last_run: at(7, 3).toISOString() }, now)
		expect(next).toEqual({ due: false, at: at(8, 3) })
	})

	it('is the missed slot, due at the next check, when the last run is before it', () => {
		const next = nextRun({ ...nightly, last_run: at(6, 3).toISOString() }, now)
		expect(next).toEqual({ due: true, at: at(7, 3) })
	})

	it('steps a week for a weekly schedule, and is null when disabled', () => {
		// 2026-11-08 is a Sunday
		const weekly = { ...nightly, every: 'weekly', weekday: 0, last_run: at(1, 3).toISOString() }
		expect(nextRun(weekly, now)).toEqual({ due: false, at: at(8, 3) })
		expect(nextRun({ ...weekly, enabled: false }, now)).toBeNull()
	})
})

describe('the first run to come over every schedule', () => {
	const at = (day, hour) => new Date(2026, 10, day, hour)
	const now = at(7, 10)

	it('is a missed slot before a future one, else the earliest, and null without a schedule enabled', () => {
		const ran = { ...nightly, last_run: at(7, 3).toISOString() }
		expect(nextOfAll([ran, { ...nightly, at: '01:00', last_run: at(7, 1).toISOString() }], now)).toEqual({ due: false, at: at(8, 1) })
		expect(nextOfAll([ran, { ...nightly, at: '05:00', last_run: at(6, 5).toISOString() }], now)).toEqual({ due: true, at: at(7, 5) })
		expect(nextOfAll([{ ...nightly, enabled: false }], now)).toBeNull()
		expect(nextOfAll(undefined, now)).toBeNull()
	})

	it('says a duration in the unit that fits', () => {
		expect(durationText(12000)).toBe('12 s')
		expect(durationText(4 * 60000)).toBe('4 min')
		expect(durationText(5400000)).toBe('1 h 30')
	})
})
