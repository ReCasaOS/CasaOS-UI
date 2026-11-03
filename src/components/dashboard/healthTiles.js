// What the beta dashboard's health strip and its attention list say. The data is what
// the classic widgets already read (the utilization payload, the backup runs, the
// SnapRAID state); this only decides the wording and the severity, so it is tested
// without a component.
import { snapraidTag, snapraidWhen } from '@/components/Storage/snapraid'

export function percent(used, total) {
	const u = Number(used)
	const t = Number(total)
	if (!Number.isFinite(u) || !Number.isFinite(t) || t <= 0) {
		return 0
	}
	return Math.min(100, Math.floor(u * 100 / t))
}

// bytes per second between two samples of one interface, null until there are two
// (a counter that went back, an interface that was reset, reads as no traffic)
export function netSpeed(prev, cur) {
	if (!prev || !cur) {
		return null
	}
	const gap = Number(cur.time) - Number(prev.time)
	if (!(gap > 0)) {
		return null
	}
	return {
		up: Math.max(0, (cur.bytesSent - prev.bytesSent) / gap),
		down: Math.max(0, (cur.bytesRecv - prev.bytesRecv) / gap),
	}
}

// From GET /backup/runs, newest first, failures included: a restore is not a backup.
// `at` is the last backup that worked, so a failed one still says how old the last
// good copy is.
export function backupTile(runs) {
	const own = (Array.isArray(runs) ? runs : []).filter(run => !run.restore)
	const last = own[0]
	if (!last) {
		return { status: 'none', at: '', error: '' }
	}
	const lastOk = own.find(run => !run.error)
	return { status: last.error ? 'failed' : 'ok', at: (lastOk || last).started_at, error: last.error || '' }
}

const LEVELS = { 'is-success': 'ok', 'is-info': 'info', 'is-warning': 'warning', 'is-danger': 'danger' }

// null when there is no SnapRAID to talk about (an older box, or none set up)
export function snapraidTile(state, t) {
	if (!state || !state.configured) {
		return null
	}
	const tag = snapraidTag(state, t)
	return { level: LEVELS[tag.type] || 'info', text: tag.text, at: snapraidWhen(state.last && state.last.sync && state.last.sync.at) }
}

// What needs a person, worst first. `health` is the system drive's SMART answer
// ('passed' | 'failed' | 'unavailable'): no SMART data is not a failure.
export function attentionItems({ health, snapraid, backup }, t) {
	const items = []
	if (health === 'failed') {
		items.push({ key: 'disk', level: 'danger', text: t('The system drive reports a failure') })
	}
	const raid = snapraidTile(snapraid, t)
	if (raid && (raid.level === 'danger' || raid.level === 'warning')) {
		items.push({ key: 'snapraid', level: raid.level, text: `SnapRAID: ${raid.text}` })
	}
	if (backup && backup.status === 'failed') {
		items.push({ key: 'backup', level: 'danger', text: t('The last backup failed') })
	}
	return items.sort((a, b) => (a.level === 'danger' ? 0 : 1) - (b.level === 'danger' ? 0 : 1))
}
