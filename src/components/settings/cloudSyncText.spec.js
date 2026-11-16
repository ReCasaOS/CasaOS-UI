import { describe, expect, it } from 'vitest'
import { lastOf, noticeOf, routeOf, ruleOf } from './cloudSyncText.js'

// a $t that returns its key with the named params filled in
const t = (key, params = {}) => key.replace(/\{(\w+)\}/g, (_, name) => params[name])

const task = {
	destination: 'Dropbox',
	remote_path: 'Photos',
	local_path: '/DATA/Gallery/Photos',
	direction: 'download',
	mirror: false,
	archive: true,
	archive_days: 30,
	every: 'daily',
	at: '02:00',
	weekday: 0,
	last_run: '0001-01-01T00:00:00Z',
	last_result: '',
	last_error: '',
	last_files: 0,
	last_bytes: 0,
}

describe('the route of a task', () => {
	it('puts the cloud first and the arrow where the files go', () => {
		expect(routeOf(task)).toBe('Dropbox /Photos → /DATA/Gallery/Photos')
		expect(routeOf({ ...task, direction: 'upload' })).toBe('Dropbox /Photos ← /DATA/Gallery/Photos')
		expect(routeOf({ ...task, direction: 'both' })).toBe('Dropbox /Photos ↔ /DATA/Gallery/Photos')
	})
})

describe('the rule of a task', () => {
	it('says the schedule, that nothing is deleted, and how long copies are kept', () => {
		expect(ruleOf(task, t)).toBe('Every day at 02:00 · nothing is ever deleted · copies kept 30 days')
	})

	it('says deletions are carried over when it mirrors', () => {
		expect(ruleOf({ ...task, mirror: true }, t)).toContain('deletions are carried over')
	})

	it('says nothing of copies when none are kept, and forever when the days are zero', () => {
		expect(ruleOf({ ...task, archive: false }, t)).not.toContain('copies kept')
		expect(ruleOf({ ...task, archive_days: 0 }, t)).toContain('copies kept forever')
	})

	it('reads an hourly task by its minute only', () => {
		expect(ruleOf({ ...task, every: 'hourly', at: '00:20' }, t)).toMatch(/^Every hour at :20 /)
	})

	it('names the weekday in the language it is given', () => {
		const weekly = { ...task, every: 'weekly', weekday: 0 }
		expect(ruleOf(weekly, t, 'fr-FR')).toContain('dimanche')
		expect(ruleOf(weekly, t, 'en-US')).toContain('Sunday')
		expect(ruleOf(weekly, t)).toContain('Sunday')
	})

	it('names the weekday of a weekly task', () => {
		expect(ruleOf({ ...task, every: 'weekly', weekday: 1 }, t)).toMatch(/^Every week on \S+ at 02:00 /)
	})
})

describe('the last pass of a task', () => {
	const now = new Date(2026, 10, 16, 12, 0)
	const ran = { ...task, last_run: new Date(2026, 10, 15, 2, 0).toISOString(), last_result: 'ok', last_files: 212, last_bytes: 1.4 * 1024 ** 3 }

	it('says when, how it ended and how much', () => {
		expect(lastOf(ran, t, now)).toMatch(/^Last pass: yesterday at .+, pass done, 212 files, 1\.4 GB$/)
	})

	it('leaves the figures out when the box gave none', () => {
		expect(lastOf({ ...ran, last_files: 0, last_bytes: 0 }, t, now)).toMatch(/^Last pass: yesterday at .+, pass done$/)
	})

	it('says never run when it has not', () => {
		expect(lastOf(task, t, now)).toBe('never run')
	})

	it('gives the error of a failed pass', () => {
		expect(lastOf({ ...ran, last_result: 'failed', last_error: 'token expired' }, t, now)).toBe('Last pass failed: token expired')
	})
})

describe('the notice of a task', () => {
	it('is null when all is well', () => {
		expect(noticeOf(task, t)).toBeNull()
	})

	it('asks for a first pass before anything else', () => {
		expect(noticeOf({ ...task, needs_first_pass: true, needs_delete_confirm: true, last_result: 'recovered' }, t))
			.toEqual({ kind: 'first-pass', text: 'This task lost track of the two sides' })
	})

	it('asks to confirm the deletions, then mentions a recovery', () => {
		expect(noticeOf({ ...task, needs_delete_confirm: true, last_result: 'recovered' }, t))
			.toEqual({ kind: 'deletes', text: 'More than half of the files on one side are gone' })
		expect(noticeOf({ ...task, last_result: 'recovered' }, t))
			.toEqual({ kind: 'recovered', text: 'Resumed after an interruption: files deleted since may have come back' })
	})
})
