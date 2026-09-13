import { describe, expect, it } from 'vitest'
import { failuresToAnnounce } from './backupFailures'

const failed = { app: 'nextcloud', destination: 'offsite', stamp: '20260913T030000Z', started_at: '2026-09-13T03:00:00Z', scheduled: true, error: 'rclone: connection refused' }

describe('which failures are said', () => {
	it('says a scheduled backup that failed and was not followed by a good one', () => {
		expect(failuresToAnnounce([failed]).map(r => r.stamp)).toEqual([failed.stamp])
	})

	it('is quiet once a later backup of the same app to the same place landed', () => {
		const later = { ...failed, stamp: '20260914T030000Z', started_at: '2026-09-14T03:00:00Z', error: '' }
		expect(failuresToAnnounce([failed, later])).toEqual([])
		// whatever order the log lists them in
		expect(failuresToAnnounce([later, failed])).toEqual([])
	})

	it('keeps a failure that a later success elsewhere does not retire', () => {
		const elsewhere = { ...failed, destination: 'nas', stamp: '20260914T030000Z', started_at: '2026-09-14T03:00:00Z', error: '' }
		expect(failuresToAnnounce([failed, elsewhere]).map(r => r.stamp)).toEqual([failed.stamp])
	})

	it('leaves a run somebody asked for by hand to that somebody', () => {
		expect(failuresToAnnounce([{ ...failed, scheduled: false }])).toEqual([])
	})

	it('does not count a restore as a backup', () => {
		const restore = { ...failed, stamp: '20260914T030000Z', started_at: '2026-09-14T03:00:00Z', restore: true, error: '' }
		expect(failuresToAnnounce([failed, restore]).map(r => r.stamp)).toEqual([failed.stamp])
	})

	it('says each failure once', () => {
		expect(failuresToAnnounce([failed], [failed.stamp])).toEqual([])
	})

	it('survives nothing at all', () => {
		expect(failuresToAnnounce(null)).toEqual([])
		expect(failuresToAnnounce([null])).toEqual([])
	})
})
