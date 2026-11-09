// The Backups tab's reading of GET /v1/fleet/backups: levels and words only. The server computes `online`, `stale`
// and every state; nothing here recomputes a backup's health.
// Only 'ok' is ever green: offline, stale, never, unknown, suspended and not_verifiable all read as 'none' or worse.

const LEVELS = { ok: 'ok', failed: 'danger', late: 'warning' }

export function stateLevel(state) {
	return LEVELS[state] ?? 'none'
}

const verifyFailed = c => c.verify?.state === 'failed'

// a box the master cannot vouch for right now: whatever it last said does not count
const unreadable = box => !box.online || !!box.stale

export function boxLevel(box) {
	if (unreadable(box)) {
		return 'none'
	}
	if (box.state === 'failed' || (box.couples ?? []).some(verifyFailed)) {
		return 'danger'
	}
	if (box.green) {
		return 'ok'
	}
	// not green without a failure: late is a warning, everything else (never, unknown, suspended, error) is grey
	return box.state === 'late' ? 'warning' : 'none'
}

export function summaryOf(boxes) {
	const levels = boxes.map(boxLevel)
	return {
		allGreen: boxes.length > 0 && levels.every(l => l === 'ok'),
		// a box in danger or warning is at least one problem, whatever count it sends
		problems: boxes.reduce((n, b, i) => n + (['danger', 'warning'].includes(levels[i]) ? Math.max(b.problems || 0, 1) : 0), 0),
		offline: boxes.filter(b => !b.online).length,
		// online but not vouched for: stale, never polled, unknown, suspended
		unknown: boxes.filter((b, i) => b.online && levels[i] === 'none').length,
	}
}

// "4 min ago", "2 h ago"; `t` is the translate function, so that the keys stay visible to the keys' test.
export function ageText(iso, now, t) {
	const at = iso ? new Date(iso).getTime() : Number.NaN
	if (Number.isNaN(at)) {
		return ''
	}
	const min = Math.floor((now.getTime() - at) / 60000)
	if (min < 1) {
		return t('just now')
	}
	if (min < 60) {
		return t('{n} min ago', { n: min })
	}
	return min < 48 * 60 ? t('{n} h ago', { n: Math.floor(min / 60) }) : t('{n} d ago', { n: Math.floor(min / 1440) })
}

const RANK = { failed: 0, late: 1, never: 2, unknown: 3, suspended: 4, ok: 5 }
const rankOf = c => verifyFailed(c) ? 0 : (RANK[c.state] ?? RANK.unknown)

// worst first; ties keep the box's order
export function couplesOf(box) {
	return [...(box.couples ?? [])].sort((a, b) => rankOf(a) - rankOf(b))
}

// the latest / earliest of some ISO dates, '' when there are none
const dates = list => list.filter(Boolean).sort((a, b) => new Date(a) - new Date(b))
const fieldOf = (box, field) => (box.couples ?? []).map(c => c[field])

export const lastOkOf = box => dates(fieldOf(box, 'last_ok_at')).at(-1) ?? ''
export const nextOf = box => dates(fieldOf(box, 'next_slot'))[0] ?? ''
export const lastVerifyOf = box => dates((box.couples ?? []).map(c => c.verify?.at)).at(-1) ?? ''

// whether the master can vouch for what it holds of this box: online, fresh, polled at least once, no error
export const vouchedFor = box => !unreadable(box) && !!box.polled_at && !box.error

// The badge of one app on one box's tile: the worst of its couples, grey when the box cannot be vouched for.
// null when the app has no schedule there.
export function badgeFor(box, app) {
	const own = (box.couples ?? []).filter(c => c.app === app)
	if (!own.length) {
		return null
	}
	if (!vouchedFor(box)) {
		return 'attention'
	}
	// a box that is not green with nothing in it to show why holds an alert the master carries (a backup running, a
	// verification it cannot read): no app of it is green
	if (!box.green && !box.couples.some(c => c.state !== 'ok' || verifyFailed(c))) {
		return 'attention'
	}
	if (own.some(c => c.state === 'failed' || verifyFailed(c))) {
		return 'failed'
	}
	return own.every(c => c.state === 'ok') ? 'ok' : 'attention'
}
