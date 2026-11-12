import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { badgeOfApp, coupleStates } from './backupStatus.js'

const NOW = Date.parse('2026-11-08T12:00:00Z')
const MIN = 60000
const HOUR = 60 * MIN
const ago = ms => new Date(NOW - ms).toISOString()
const ZERO = '0001-01-01T00:00:00Z'

const a = 'app'
const d = 'dest'
function run(app, dest, error, startedAgo) {
	return {
		app,
		destination: dest,
		stamp: String(startedAgo),
		started_at: ago(startedAgo),
		finished_at: new Date(NOW - startedAgo + MIN).toISOString(),
		error,
	}
}
// The current slot in its grace hour: the slot before it, one interval (next_slot - last_slot) earlier,
// decides; a daylight-saving hour either way is tolerated. Same helper as `within` in the Go table.
function within(lastRunAgo, interval, ...runs) {
	const s = sched(a, d, true, lastRunAgo, 30 * MIN)
	s.next_slot = new Date(Date.parse(s.last_slot) + interval).toISOString()

	return { runs, schedules: [s] }
}
function sched(app, dest, enabled, lastRunAgo, slotAgo) {
	return {
		app,
		destination: dest,
		enabled,
		last_run: lastRunAgo === null ? ZERO : ago(lastRunAgo),
		...(slotAgo === null ? {} : { last_slot: ago(slotAgo) }),
	}
}

// The cases below are the ones of TestAssessCoupleState (and the neighbouring tests) in
// CasaOS pkg/fleet/backups_test.go, which checks the master's Go `assess`. This file is
// the same rules, run on the box's own answers: if one changes, change both.
describe('the state of a scheduled couple (same cases as the master)', () => {
	const cases = [
		['ok', { runs: [run(a, d, '', 2 * HOUR)], schedules: [sched(a, d, true, 2 * HOUR, 2 * HOUR)] }, 'ok', false],
		['last run failed', { runs: [run(a, d, '', 5 * HOUR), run(a, d, 'disk full', 2 * HOUR)], schedules: [sched(a, d, true, 2 * HOUR, 2 * HOUR)] }, 'failed', false],
		['failed then on-demand success', { runs: [run(a, d, 'disk full', 3 * HOUR), run(a, d, '', HOUR)], schedules: [sched(a, d, true, HOUR, 3 * HOUR)] }, 'ok', false],
		['never run', { schedules: [sched(a, d, true, null, 5 * HOUR)] }, 'never', false],
		['restore runs do not count', { runs: [{ app: a, destination: d, started_at: ago(HOUR), restore: true, error: 'boom' }], schedules: [sched(a, d, true, null, 5 * HOUR)] }, 'never', false],
		['slot 59 minutes old', { runs: [run(a, d, '', 25 * HOUR)], schedules: [sched(a, d, true, 25 * HOUR, 59 * MIN)] }, 'ok', false],
		['slot exactly an hour old', { runs: [run(a, d, '', 25 * HOUR)], schedules: [sched(a, d, true, 25 * HOUR, HOUR)] }, 'ok', false],
		['slot 61 minutes old', { runs: [run(a, d, '', 25 * HOUR)], schedules: [sched(a, d, true, 25 * HOUR, 61 * MIN)] }, 'late', false],
		['slot passed but forced run after it', { runs: [run(a, d, '', 25 * HOUR), run(a, d, '', 90 * MIN)], schedules: [sched(a, d, true, 25 * HOUR, 2 * HOUR)] }, 'ok', false],
		['schedule says it ran after the slot but the only run is older', { runs: [run(a, d, '', 25 * HOUR)], schedules: [sched(a, d, true, 30 * MIN, 2 * HOUR)] }, 'ok', false],
		['run started exactly at the slot', { runs: [run(a, d, '', 2 * HOUR)], schedules: [sched(a, d, true, 25 * HOUR, 2 * HOUR)] }, 'ok', false],
		['slot passed and a run in progress', { runs: [run(a, d, '', 25 * HOUR)], schedules: [sched(a, d, true, 25 * HOUR, 2 * HOUR)], operations: [{ app: a, kind: 'backup' }] }, 'ok', true],
		['operation of another kind does not mask late', { runs: [run(a, d, '', 25 * HOUR)], schedules: [sched(a, d, true, 25 * HOUR, 2 * HOUR)], operations: [{ app: a, kind: 'restore' }, { app: 'other', kind: 'backup' }] }, 'late', false],
		['upgrade open suspends late', { runs: [run(a, d, '', 25 * HOUR)], schedules: [sched(a, d, true, 25 * HOUR, 2 * HOUR)], osUpgradeOpen: true }, 'suspended', false],
		['upgrade open keeps failed', { runs: [run(a, d, 'disk full', 3 * HOUR)], schedules: [sched(a, d, true, 3 * HOUR, 2 * HOUR)], osUpgradeOpen: true }, 'failed', false],
		['upgrade open keeps never', { schedules: [sched(a, d, true, null, 5 * HOUR)], osUpgradeOpen: true }, 'never', false],
		['failed wins over late', { runs: [run(a, d, 'disk full', 25 * HOUR)], schedules: [sched(a, d, true, 25 * HOUR, 5 * HOUR)] }, 'failed', false],
		['slot unknown', { runs: [run(a, d, '', 2 * HOUR)], schedules: [sched(a, d, true, 2 * HOUR, null)] }, 'unknown', false],
		['slot unknown but failed', { runs: [run(a, d, 'disk full', 2 * HOUR)], schedules: [sched(a, d, true, 2 * HOUR, null)] }, 'failed', false],
		['slot unknown but never', { schedules: [sched(a, d, true, null, null)] }, 'never', false],
		['runs of another destination are not mine', { runs: [run(a, 'other', '', HOUR)], schedules: [sched(a, d, true, null, 5 * HOUR)] }, 'never', false],
		['scheduler stopped, current slot in its grace hour', within(48.5 * HOUR, 24 * HOUR, run(a, d, '', 48.5 * HOUR)), 'late', false],
		['healthy, current slot in its grace hour', within(24.5 * HOUR, 24 * HOUR, run(a, d, '', 24.5 * HOUR)), 'ok', false],
		['healthy across a 23 h day', within(24.5 * HOUR, 23 * HOUR, run(a, d, '', 24.5 * HOUR)), 'ok', false],
		['healthy across a 25 h day', within(24.5 * HOUR, 25 * HOUR, run(a, d, '', 24.5 * HOUR)), 'ok', false],
		['scheduler stopped across a 23 h day', within(48.5 * HOUR, 23 * HOUR, run(a, d, '', 48.5 * HOUR)), 'late', false],
		['scheduler stopped in the grace hour, upgrade open', { ...within(48.5 * HOUR, 24 * HOUR, run(a, d, '', 48.5 * HOUR)), osUpgradeOpen: true }, 'suspended', false],
		['scheduler stopped in the grace hour, backup running', { ...within(48.5 * HOUR, 24 * HOUR, run(a, d, '', 48.5 * HOUR)), operations: [{ app: a, kind: 'backup' }] }, 'ok', true],
		// AM keeps the last 200 runs: a couple whose records rolled off is not "never"
		['no run record but the schedule ran, slot covered', { schedules: [sched(a, d, true, 2 * HOUR, 2 * HOUR)] }, 'ok', false],
		['no run record but the schedule ran, slot missed', { schedules: [sched(a, d, true, 26 * HOUR, 2 * HOUR)] }, 'late', false],
		['no run record but the schedule ran, slot unknown', { schedules: [sched(a, d, true, 2 * HOUR, null)] }, 'unknown', false],
	]

	it.each(cases)('%s', (_, input, state, running) => {
		const couples = coupleStates({ runs: [], schedules: [], operations: [], osUpgradeOpen: false, ...input }, NOW)
		expect(couples).toHaveLength(1)
		expect(couples[0]).toMatchObject({ app: a, destination: d, state, running })
	})

	it('treats a slot at the zero time as unknown, like Go does', () => {
		const schedule = { ...sched(a, d, true, 2 * HOUR, 2 * HOUR), last_slot: ZERO }
		expect(coupleStates({ runs: [run(a, d, '', 2 * HOUR)], schedules: [schedule] }, NOW)[0].state).toBe('unknown')
	})

	it('does not count a run without a start time as after the slot', () => {
		// a malformed run (no started_at, or Go's zero time) must not turn a late couple green
		const schedules = [sched(a, d, true, 25 * HOUR, 2 * HOUR)]
		const base = run(a, d, '', 25 * HOUR)
		expect(coupleStates({ runs: [base, { ...base, started_at: undefined }], schedules }, NOW)[0].state).toBe('late')
		expect(coupleStates({ runs: [base, { ...base, started_at: ZERO }], schedules }, NOW)[0].state).toBe('late')
		expect(coupleStates({ runs: [base, { ...base, started_at: 'not a date' }], schedules }, NOW)[0].state).toBe('late')
	})

	it('reads a run without a start time as the earliest, so a later valid failed run still wins', () => {
		const schedules = [sched(a, d, true, 2 * HOUR, 2 * HOUR)]
		const malformed = { app: a, destination: d, error: '' }
		const failed = run(a, d, 'disk full', HOUR)
		expect(coupleStates({ runs: [malformed, failed], schedules }, NOW)[0]).toMatchObject({ state: 'failed', last_error: 'disk full' })
		expect(coupleStates({ runs: [{ ...malformed, started_at: ZERO }, failed], schedules }, NOW)[0].state).toBe('failed')
		expect(coupleStates({ runs: [failed, malformed], schedules }, NOW)[0].state).toBe('failed')
	})

	it('stays late when the schedule has a zero last_run and no run is after the slot', () => {
		const schedules = [sched(a, d, true, null, 2 * HOUR)]
		expect(coupleStates({ runs: [run(a, d, '', 25 * HOUR)], schedules }, NOW)[0].state).toBe('late')
	})

	it('compares instants, not strings, when the box writes an offset', () => {
		// the slot is 07:00Z, five hours old at NOW
		const schedules = [{ app: a, destination: d, enabled: true, last_run: ZERO, last_slot: '2026-11-08T08:00:00+01:00' }]
		const at = started => ({ app: a, destination: d, started_at: started, finished_at: started, error: '' })
		// 07:30Z is after the slot
		expect(coupleStates({ runs: [at('2026-11-08T07:30:00Z')], schedules }, NOW)[0].state).toBe('ok')
		// 07:30+01:00 is 06:30Z, before it
		expect(coupleStates({ runs: [at('2026-11-08T07:30:00+01:00')], schedules }, NOW)[0].state).toBe('late')
		expect(coupleStates({ runs: [at('2026-11-08T08:00:00+01:00')], schedules }, NOW)[0].state).toBe('ok')
	})

	it('has no couple for a disabled schedule or an app with runs but no schedule', () => {
		const input = { runs: [run('a', d, '', HOUR), run('b', d, '', HOUR)], schedules: [sched('a', d, false, HOUR, HOUR)] }
		expect(coupleStates(input, NOW)).toEqual([])
	})

	it('gives the fields the badge reads, from the latest run', () => {
		const bad = run(a, d, 'disk full', 2 * HOUR)
		const ok = run(a, d, '', 30 * HOUR)
		const [c] = coupleStates({ runs: [bad, ok], schedules: [sched(a, d, true, 2 * HOUR, 2 * HOUR)] }, NOW)
		expect(c).toMatchObject({ last_error: 'disk full', last_run_at: bad.started_at, last_ok_at: ok.finished_at, last_ok_stamp: ok.stamp })
	})

	it('reads no clock: the same answers with a later now are late', () => {
		const input = { runs: [run(a, d, '', 25 * HOUR)], schedules: [sched(a, d, true, 25 * HOUR, 30 * MIN)] }
		expect(coupleStates(input, NOW)[0].state).toBe('ok')
		expect(coupleStates(input, NOW + 31 * MIN)[0].state).toBe('late')
	})

	it('sorts the couples by app then destination', () => {
		const input = { schedules: [sched('b', 'z', true, null, HOUR), sched('a', 'z', true, null, HOUR), sched('a', 'd', true, null, HOUR)] }
		expect(coupleStates(input, NOW).map(c => `${c.app}/${c.destination}`)).toEqual(['a/d', 'a/z', 'b/z'])
	})
})

// interpolating stand-in for $t: the English sentence itself
const t = (key, params = {}) => key.replace(/\{(\w+)\}/g, (_, n) => params[n])
const couple = (over = {}) => ({ app: a, destination: 'GDrive', state: 'ok', running: false, last_error: '', last_ok_at: ago(HOUR), ...over })

describe('the badge of an app', () => {
	it('is null when the app has no enabled schedule', () => {
		expect(badgeOfApp([], a, t)).toBeNull()
		expect(badgeOfApp([couple({ app: 'other', state: 'failed' })], a, t)).toBeNull()
	})

	it('is ok with the time and the destination when every couple is ok', () => {
		const badge = badgeOfApp([couple()], a, t)
		expect(badge.kind).toBe('ok')
		expect(badge.title).toMatch(/^Backed up .+ to GDrive$/)
	})

	it('says no date when a couple is ok but its run records rolled off, never "Invalid Date"', () => {
		// the master's rolled-off case: the schedule ran, AM no longer lists the run
		const badge = badgeOfApp([couple({ last_ok_at: '' }), couple({ destination: 'other' })], a, t)
		expect(badge).toEqual({ kind: 'ok', title: 'Backed up to GDrive' })
	})

	it('says the oldest success of the app when it has several couples', () => {
		const badge = badgeOfApp([couple({ destination: 'recent' }), couple({ destination: 'old', last_ok_at: ago(30 * HOUR) })], a, t)
		expect(badge.title).toMatch(/to old$/)
	})

	it('is failed with a short reason, and failed wins over the others', () => {
		const badge = badgeOfApp([couple({ state: 'late' }), couple({ state: 'failed', last_error: 'disk full' }), couple()], a, t)
		expect(badge).toEqual({ kind: 'failed', title: 'Backup failed: disk full' })
	})

	it('caps the reason at 120 characters', () => {
		const badge = badgeOfApp([couple({ state: 'failed', last_error: 'x'.repeat(500) })], a, t)
		expect(badge.title.length).toBeLessThanOrEqual('Backup failed: '.length + 120)
		expect(badge.title.endsWith('…')).toBe(true)
	})

	it.each([
		['late', 'Backup late'],
		['never', 'No backup yet'],
		['suspended', 'Backups paused by a system upgrade'],
		['unknown', 'Backup state unknown'],
	])('is attention, never ok, for %s', (state, title) => {
		expect(badgeOfApp([couple(), couple({ state })], a, t)).toEqual({ kind: 'attention', title })
	})

	it('ignores the couples of other apps', () => {
		expect(badgeOfApp([couple({ app: 'other', state: 'failed', last_error: 'x' }), couple()], a, t).kind).toBe('ok')
	})
})

describe('the words of the badge', () => {
	const lang = file => JSON.parse(readFileSync(join(import.meta.dirname, '../../assets/lang', file), 'utf8'))

	it.each([['en_US.json'], ['fr_FR.json']])('are all in %s', (file) => {
		const words = lang(file)
		const used = ['Backed up {when} to {destination}', 'Backed up to {destination}', 'Backup failed: {reason}', 'Backup late', 'No backup yet', 'Backup state unknown', 'Backups paused by a system upgrade']
		expect(used.filter(key => !words[key])).toEqual([])
	})
})
