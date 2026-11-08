import { describe, expect, it } from 'vitest'
import { ageText, badgeFor, boxLevel, couplesOf, lastOkOf, nextOf, stateLevel, summaryOf } from './backupsData'

const NOW = new Date('2026-11-08T12:00:00Z')
const ago = ms => new Date(NOW.getTime() - ms).toISOString()
const MIN = 60000
const HOUR = 60 * MIN
const t = (key, params = {}) => key.replace(/\{(\w+)\}/g, (_, k) => params[k])

const couple = (over = {}) => ({ app: 'immich', destination: 'nas', state: 'ok', running: false, last_error: '', verify: { state: 'none', error: '' }, ...over })
const box = (over = {}) => ({ box_id: 'a', name: 'Home', online: true, polled_at: ago(MIN), stale: false, error: '', state: 'ok', green: true, problems: 0, couples: [couple()], ...over })

describe('stateLevel', () => {
	it.each([
		['ok', 'ok'],
		['failed', 'danger'],
		['late', 'warning'],
		['never', 'none'],
		['unknown', 'none'],
		['suspended', 'none'],
		['none', 'none'],
		['whatever', 'none'],
	])('%s is %s', (state, level) => {
		expect(stateLevel(state)).toBe(level)
	})
})

describe('boxLevel', () => {
	it('is ok for an online, fresh, green box', () => {
		expect(boxLevel(box())).toBe('ok')
	})

	it('is none for an offline box whose last state was ok', () => {
		expect(boxLevel(box({ online: false }))).toBe('none')
	})

	it('is none for a stale box', () => {
		expect(boxLevel(box({ stale: true }))).toBe('none')
	})

	it('is none, never ok, when the box is not green without a failure', () => {
		expect(boxLevel(box({ green: false, state: 'unknown' }))).toBe('none')
		expect(boxLevel(box({ green: false, state: 'suspended' }))).toBe('none')
		expect(boxLevel(box({ green: false, state: 'never' }))).toBe('none')
	})

	it('is danger when the state is failed', () => {
		expect(boxLevel(box({ green: false, state: 'failed' }))).toBe('danger')
	})

	it('is warning when the backups are late', () => {
		expect(boxLevel(box({ green: false, state: 'late' }))).toBe('warning')
	})

	it('is danger when a verification failed even though the backups are ok', () => {
		const verify = { state: 'failed', error: 'x' }
		expect(boxLevel(box({ couples: [couple({ verify })] }))).toBe('danger')
	})

	it('is not danger when a couple is not_verifiable', () => {
		const verify = { state: 'not_verifiable', error: '' }
		expect(boxLevel(box({ couples: [couple({ verify })] }))).not.toBe('danger')
	})
})

describe('summaryOf', () => {
	it('is all green only when every box is ok', () => {
		expect(summaryOf([box(), box({ box_id: 'b' })])).toEqual({ allGreen: true, problems: 0, offline: 0, unknown: 0 })
	})

	it('is not all green with an offline box, which counts as offline', () => {
		expect(summaryOf([box(), box({ box_id: 'b', online: false })])).toEqual({ allGreen: false, problems: 0, offline: 1, unknown: 0 })
	})

	it('is not all green with an unknown box, which counts as unknown', () => {
		expect(summaryOf([box(), box({ box_id: 'b', green: false, state: 'unknown' })])).toEqual({ allGreen: false, problems: 0, offline: 0, unknown: 1 })
	})

	it('adds the problems of the boxes that can be read, one at least for a box in trouble', () => {
		const failing = box({ box_id: 'b', green: false, state: 'failed', problems: 2 })
		const gone = box({ box_id: 'c', online: false, problems: 5 })
		expect(summaryOf([box(), failing, gone])).toEqual({ allGreen: false, problems: 2, offline: 1, unknown: 0 })
	})

	it('counts a failed box as one problem at least', () => {
		expect(summaryOf([box({ green: false, state: 'failed', problems: 0 })]).problems).toBe(1)
	})

	it('is not all green with no box at all', () => {
		expect(summaryOf([]).allGreen).toBe(false)
	})
})

describe('ageText', () => {
	it.each([
		[30 * 1000, 'just now'],
		[4 * MIN, '4 min ago'],
		[2 * HOUR, '2 h ago'],
		[50 * HOUR, '2 d ago'],
	])('%d ms is "%s"', (ms, text) => {
		expect(ageText(ago(ms), NOW, t)).toBe(text)
	})

	it('is empty without a date, and just now for a date in the future', () => {
		expect(ageText(undefined, NOW, t)).toBe('')
		expect(ageText('', NOW, t)).toBe('')
		expect(ageText(ago(-5 * MIN), NOW, t)).toBe('just now')
	})
})

describe('couplesOf', () => {
	it('sorts failure, late, never, unknown, suspended, ok', () => {
		const states = ['ok', 'suspended', 'unknown', 'never', 'late', 'failed']
		const sorted = couplesOf(box({ couples: states.map((state, i) => couple({ app: `app${i}`, state })) }))
		expect(sorted.map(c => c.state)).toEqual(['failed', 'late', 'never', 'unknown', 'suspended', 'ok'])
	})

	it('puts a failed verification with the failures', () => {
		const sorted = couplesOf(box({ couples: [couple({ app: 'a' }), couple({ app: 'b', verify: { state: 'failed', error: '' } })] }))
		expect(sorted.map(c => c.app)).toEqual(['b', 'a'])
	})

	it('does not touch the box and survives a box without couples', () => {
		const b = box({ couples: [couple({ state: 'ok' }), couple({ state: 'failed' })] })
		couplesOf(b)
		expect(b.couples[0].state).toBe('ok')
		expect(couplesOf({ ...b, couples: undefined })).toEqual([])
	})
})

describe('lastOkOf and nextOf', () => {
	it('give the latest success and the earliest next slot of the couples', () => {
		const b = box({ couples: [couple({ last_ok_at: ago(3 * HOUR), next_slot: '2026-11-09T02:00:00Z' }), couple({ last_ok_at: ago(HOUR), next_slot: '2026-11-09T01:00:00Z' }), couple()] })
		expect(lastOkOf(b)).toBe(ago(HOUR))
		expect(nextOf(b)).toBe('2026-11-09T01:00:00Z')
		expect(lastOkOf(box())).toBe('')
		expect(nextOf(box())).toBe('')
	})
})

describe('badgeFor', () => {
	it('is null for an app without a couple in the box', () => {
		expect(badgeFor(box(), 'plex')).toBeNull()
		expect(badgeFor(box({ couples: [] }), 'immich')).toBeNull()
		expect(badgeFor(box({ couples: undefined }), 'immich')).toBeNull()
	})

	it('is ok when every couple of the app is ok', () => {
		expect(badgeFor(box(), 'immich')).toBe('ok')
	})

	it('is the worst of the couples of the app: failed, then attention, then ok', () => {
		const mixed = box({ couples: [couple({ destination: 'a' }), couple({ destination: 'b', state: 'late' }), couple({ app: 'plex', state: 'failed' })] })
		expect(badgeFor(mixed, 'immich')).toBe('attention')
		const worse = box({ couples: [...mixed.couples, couple({ destination: 'c', state: 'failed' })] })
		expect(badgeFor(worse, 'immich')).toBe('failed')
	})

	it('is attention for never, unknown and suspended', () => {
		for (const state of ['never', 'unknown', 'suspended']) {
			expect(badgeFor(box({ couples: [couple({ state })] }), 'immich')).toBe('attention')
		}
	})

	it('is failed when the verification of the app failed', () => {
		expect(badgeFor(box({ couples: [couple({ verify: { state: 'failed', error: '' } })] }), 'immich')).toBe('failed')
	})

	it('is attention, whatever the last state, for a box offline, stale, never polled or in error', () => {
		for (const over of [{ online: false }, { stale: true }, { polled_at: undefined }, { error: 'boom' }]) {
			expect(badgeFor(box({ ...over, couples: [couple({ state: 'failed' })] }), 'immich')).toBe('attention')
			expect(badgeFor(box(over), 'immich')).toBe('attention')
		}
	})

	it('is attention on a box that is not green with nothing in it to show why (a carried alert)', () => {
		const carried = over => box({ green: false, problems: 0, ...over })
		// a backup running, or a restic couple whose verify is unknown, keeps the master's alert up
		expect(badgeFor(carried({ couples: [couple({ running: true })] }), 'immich')).toBe('attention')
		expect(badgeFor(carried({ couples: [couple({ restic: false, verify: { state: 'unknown', error: '' } })] }), 'immich')).toBe('attention')
		// every app of that box with a couple, not only the one that explains it
		expect(badgeFor(carried({ couples: [couple(), couple({ app: 'plex' })] }), 'plex')).toBe('attention')
		// still nothing for an app without a schedule
		expect(badgeFor(carried({ couples: [couple()] }), 'plex')).toBeNull()
	})

	it('keeps ok on a not green box when a couple of the box explains it, for an app that is fine', () => {
		const late = box({ green: false, state: 'late', couples: [couple(), couple({ app: 'plex', state: 'late' })] })
		expect(badgeFor(late, 'immich')).toBe('ok')
		expect(badgeFor(late, 'plex')).toBe('attention')
		const verifyFailed = box({ green: false, couples: [couple(), couple({ app: 'plex', verify: { state: 'failed', error: '' } })] })
		expect(badgeFor(verifyFailed, 'immich')).toBe('ok')
		expect(badgeFor(verifyFailed, 'plex')).toBe('failed')
	})

	it('is still null for an offline box that has no couple of the app', () => {
		expect(badgeFor(box({ online: false }), 'plex')).toBeNull()
	})
})
