// The state of each scheduled backup of THIS box, from the box's own answers. The rules are
// those of the master's Go `assess` (CasaOS pkg/fleet/backups.go), so that a box's own tile
// and the master's Backups tab never disagree; pkg/fleet/backups_test.go has the cases, and
// backupStatus.spec.js runs the same ones.

import { whenOf } from '../settings/backupScheduleGroups.js'

// a scheduled backup is late once its slot is over an hour old with no run since
const LATE_AFTER = 60 * 60000
const MAX_REASON = 120

// Go's zero time ("0001-01-01T00:00:00Z"), an absent field and a bad date all read as "no date" (NaN)
function instant(iso) {
	const ms = Date.parse(iso)

	return ms > Date.parse('0002-01-01T00:00:00Z') ? ms : Number.NaN
}

const startOf = run => instant(run.started_at) || Number.NEGATIVE_INFINITY

// `now` is the caller's (a Date or milliseconds): no clock is read here.
export function coupleStates({ runs = [], schedules = [], operations = [], osUpgradeOpen = false }, now) {
	const backing = new Set(operations.filter(o => o.kind === 'backup').map(o => o.app))
	const couples = []
	for (const s of schedules) {
		if (!s.enabled) {
			continue
		}
		const slot = instant(s.last_slot)
		const running = backing.has(s.app)
		// The slot judged: the last one, or while it is in its grace hour the one before it (a stopped scheduler
		// is otherwise ok for that hour every day), found one interval back. A run from up to an hour earlier
		// (half an interval for short ones) still covers it, for the day that daylight saving makes 23 or 25 hours long.
		let due = slot
		let floor = slot
		const interval = instant(s.next_slot) - slot
		if (!Number.isNaN(slot) && +now - slot <= LATE_AFTER && interval > 0) {
			due = slot - interval
			floor = due - Math.min(LATE_AFTER, interval / 2)
		}
		const lastRun = instant(s.last_run)
		let last = null
		let lastOk = null
		let afterSlot = false
		for (const r of runs) {
			if (r.app !== s.app || r.destination !== s.destination || r.restore) {
				continue
			}
			// a run without a start time is the earliest (Go's zero time): it never wins, nor counts as after the slot
			const at = startOf(r)
			// strictly later wins, so that the first of two runs at the same moment stays
			if (!last || at > startOf(last)) {
				last = r
			}
			if (!r.error && (!lastOk || at > startOf(lastOk))) {
				lastOk = r
			}
			if (!Number.isNaN(slot) && !(at < floor)) {
				afterSlot = true
			}
		}

		let state
		if (last?.error) {
			state = 'failed'
		} else if (!last && Number.isNaN(lastRun)) {
			// a schedule that ran has only lost its records (AM keeps 200)
			state = 'never'
		} else if (Number.isNaN(slot)) {
			state = 'unknown'
		} else if (+now - due > LATE_AFTER && !(lastRun >= floor) && !afterSlot && !running) {
			state = osUpgradeOpen ? 'suspended' : 'late'
		} else {
			state = 'ok'
		}
		couples.push({
			app: s.app,
			destination: s.destination,
			state,
			running,
			last_run_at: last?.started_at ?? '',
			last_ok_at: lastOk ? (instant(lastOk.finished_at) ? lastOk.finished_at : lastOk.started_at) : '',
			last_ok_stamp: lastOk?.stamp ?? '',
			last_error: last?.error ?? '',
			next_slot: s.next_slot ?? '',
		})
	}

	return couples.sort((x, y) => (x.app === y.app ? x.destination.localeCompare(y.destination) : x.app.localeCompare(y.app)))
}

// English with {placeholders} filled: what a caller without a translator gets
const plain = (key, params = {}) => key.replace(/\{(\w+)\}/g, (_, n) => params[n])

const ATTENTION_TITLES = { late: 'Backup late', never: 'No backup yet', unknown: 'Backup state unknown', suspended: 'Backups paused by a system upgrade' }
// worst first, among the states that are neither ok nor failed
const ATTENTION_ORDER = ['late', 'never', 'unknown', 'suspended']

function shortReason(error) {
	const text = String(error).replace(/\s+/g, ' ').trim()

	return text.length > MAX_REASON ? `${text.slice(0, MAX_REASON - 1)}…` : text
}

// The badge of one app: its enabled schedules' worst state (failed, then attention, then ok), or
// null when it has none. `t` is the component's $t.
export function badgeOfApp(states, app, t = plain) {
	const mine = (states || []).filter(c => c.app === app)
	if (!mine.length) {
		return null
	}
	const failed = mine.find(c => c.state === 'failed')
	if (failed) {
		return { kind: 'failed', title: t('Backup failed: {reason}', { reason: shortReason(failed.last_error) }) }
	}
	const worst = ATTENTION_ORDER.find(state => mine.some(c => c.state === state))
	if (worst) {
		return { kind: 'attention', title: t(ATTENTION_TITLES[worst]) }
	}
	// ok with no date: the schedule ran, but its run records rolled off
	const undated = mine.find(c => Number.isNaN(instant(c.last_ok_at)))
	if (undated) {
		return { kind: 'ok', title: t('Backed up to {destination}', { destination: undated.destination }) }
	}
	// the weakest guarantee of the app: its oldest last success
	const oldest = mine.reduce((a, b) => (instant(b.last_ok_at) < instant(a.last_ok_at) ? b : a))

	return { kind: 'ok', title: t('Backed up {when} to {destination}', { when: whenOf(new Date(oldest.last_ok_at), t), destination: oldest.destination }) }
}
