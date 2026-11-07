import { describe, expect, it } from 'vitest'
import { groupSchedules, spreadGroups } from './backupScheduleGroups.js'

const nightly = { destination: 'nas', every: 'daily', at: '03:00', weekday: 1, keep: 7, hold_still: true, enabled: true }

describe('schedules shown per set of settings', () => {
	it('puts the apps that share every setting in one schedule, and keeps the others apart', () => {
		const groups = groupSchedules([
			{ app: 'blog', ...nightly, last_run: '2026-11-06T03:00:00Z' },
			{ app: 'casaos-system', ...nightly, last_run: '2026-11-05T03:00:00Z' },
			{ app: 'photos', ...nightly, at: '04:00' },
		])

		expect(groups).toEqual([
			{ ...nightly, apps: ['blog', 'casaos-system'] },
			{ ...nightly, at: '04:00', apps: ['photos'] },
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
