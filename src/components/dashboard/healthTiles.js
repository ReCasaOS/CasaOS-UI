// What the beta dashboard's health strip and its attention list say. The data is what
// the classic widgets already read (the utilization payload, the backup runs, the
// SnapRAID state); this only decides the wording and the severity, so it is tested
// without a component.
import { wasStopped } from '@/components/backup/liveBackup.js'
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

// Watts between two samples of the CPU energy counter (microjoules, Intel RAPL). A box
// without the counter sends 0, and a counter that wrapped goes back: both read as no figure.
export function cpuWatts(prev, cur) {
	const before = Number(prev?.value)
	const after = Number(cur?.value)
	const gap = Number(cur?.timestamp) - Number(prev?.timestamp)
	if (!(before > 0) || !(after >= before) || !(gap > 0)) {
		return null
	}
	return (after - before) / gap / 1e6
}

// "3.4 GHz" from MHz; null when the core sends no frequency
export function cpuFrequency(mhz) {
	const value = Number(mhz)
	if (!(value > 0)) {
		return null
	}
	return value >= 1000 ? `${(value / 1000).toFixed(1)} GHz` : `${Math.round(value)} MHz`
}

// From GET /backup/runs, newest first, failures included: a restore is not a backup.
// `at` is the last backup that worked, so a failed one still says how old the last
// good copy is.
export function backupTile(runs) {
	const own = (Array.isArray(runs) ? runs : []).filter(run => !run.restore)
	const last = own[0]
	if (!last) {
		return { status: 'none', at: '', destination: '', error: '' }
	}
	const lastOk = own.find(run => !run.error) || last
	// a backup somebody stopped did not fail: it wears neither the red chip nor the error
	return { status: last.error ? (wasStopped(last.error) ? 'stopped' : 'failed') : 'ok', at: lastOk.started_at, destination: lastOk.destination || '', error: last.error || '', batch: runBatch(own, lastOk) }
}

// The runs one go set off, around `last`: one per app, sequential, to the same destination
// the same way (scheduled or by hand), started within six hours before it. shortcut: the
// records carry no batch id, so time and destination stand in; two goes are a day apart at least.
export function runBatch(runs, last) {
	const anchor = Date.parse(last.started_at)

	return runs.filter((run) => {
		const started = Date.parse(run.started_at)

		return run.destination === last.destination && !!run.scheduled === !!last.scheduled
			&& started >= anchor - 6 * 3600000 && started <= anchor + 60000
	})
}

// A USB disk of the utilization payload: `used` where the box gives it, size - avail
// where it does not (the Storage widget reads it the same way)
export function usbPercent(disk) {
	const used = Number(disk.used)
	return percent(Number.isFinite(used) && used >= 0 ? used : Number(disk.size) - Number(disk.avail), disk.size)
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
// The fleet panel of a master: the boxes, each one online, gone (seen before) or never come (its code may be
// on its way). Null on a box that is not a master, or on a core that has no fleet.
export function fleetPanel(status) {
	if (status?.role !== 'master') {
		return null
	}
	const boxes = (status.master?.boxes || []).map(box => ({
		key: box.id,
		name: box.name,
		state: box.online ? 'online' : (box.last_seen ? 'offline' : 'never'),
		lastSeen: box.last_seen,
	}))
	return { total: boxes.length, online: boxes.filter(box => box.state === 'online').length, boxes }
}

// the core raises its own alert for a box after as long
const FLEET_GONE_MS = 10 * 60 * 1000

// `mounts` are the mounts df cannot read (GET /v1/disks/unreadable), an empty mount point when df itself hangs.
export function attentionItems({ health, snapraid, backup, fleet, mounts, guard }, t, now = Date.now()) {
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
	for (const mount of Array.isArray(mounts) ? mounts : []) {
		items.push(mount.mount_point
			? { key: `mount_${mount.mount_point}`, level: 'warning', text: t('The mount {path} cannot be read ({error}): check /etc/fstab or the server it comes from', { path: mount.mount_point, error: mount.error }) }
			: { key: 'mount_hung', level: 'warning', text: t('A mount does not answer: check /etc/fstab or the servers of the network shares') })
	}
	for (const box of fleetPanel(fleet)?.boxes || []) {
		if (box.state === 'offline' && now - Date.parse(box.lastSeen) >= FLEET_GONE_MS) {
			items.push({ key: `fleet_${box.key}`, level: 'warning', text: t('The box {name} is offline', { name: box.name }) })
		}
	}
	items.push(...guardItems(guard, t))
	return items.sort((a, b) => (a.level === 'danger' ? 0 : 1) - (b.level === 'danger' ? 0 : 1))
}

// `guard` is the view of GET /v1/share/guard, null on a core without it. `apps` lists the shared apps only:
// a wave on an app that is not shared any more is history.
function guardItems(guard, t) {
	if (!guard) {
		return []
	}
	const items = []
	if (guard.reset) {
		items.push({ key: 'share-reset', level: 'danger', text: t('Protection settings of shared apps were reset: every shared app asks for a code, people must be added again') })
	}
	for (const { app, bans } of guard.waves || []) {
		if (!guard.apps || Object.hasOwn(guard.apps, app)) {
			items.push({ key: `share-wave-${app}`, level: 'danger', text: t('{app}: {n} addresses banned in 10 minutes', { app, n: bans }) })
		}
	}
	const filters = Object.values(guard.apps || {}).some(app => app.effective?.countries?.mode && app.effective.countries.mode !== 'none')
	if (guard.protection && filters && guard.geo?.country === false) {
		items.push({ key: 'share-geo', level: 'warning', text: t('Country filtering of shared apps is not working') })
	}
	return items
}

// The Storage panel's rows of the ZFS pools (GET /v1/disks/zfs): their disks hold no mounted volume, so
// GET /v1/storage never lists them. ONLINE is healthy, any other state read is not; an unread one says nothing.
export function zfsPoolRows(pools) {
	return (Array.isArray(pools) ? pools : []).map(pool => ({
		key: `zfs_${pool.name}`,
		name: pool.name,
		role: 'zfs',
		known: pool.known,
		state: pool.state,
		health: pool.known ? (pool.state === 'ONLINE' ? 'passed' : 'failed') : '',
		size: pool.size,
		used: pool.allocated,
	}))
}

// The Storage panel's rows, one per disk, from GET /v1/storage (the disks with their volumes, the
// system one among them), GET /v1/disks (the drives: SMART and temperature) and the volumes
// SnapRAID holds by mount point ('data' | 'parity', see snapraidHeld). The system disk may not
// be among the drives: its SMART comes from the utilization payload, the caller's business.
export function diskRows(storages, drives, held) {
	const byPath = new Map((Array.isArray(drives) ? drives : []).map(drive => [drive.path, drive]))
	return (Array.isArray(storages) ? storages : []).map((disk) => {
		const volumes = disk.children || []
		const sum = field => volumes.reduce((total, volume) => total + (Number(volume[field]) || 0), 0)
		const system = disk.disk_name === 'System'
		return {
			key: disk.path,
			name: disk.disk_model || disk.disk_name || disk.path,
			role: system ? 'system' : (volumes.map(volume => held[volume.mount_point]).find(Boolean) || ''),
			size: sum('size'),
			used: sum('used'),
			drive: byPath.get(disk.path) || null,
		}
	})
}
