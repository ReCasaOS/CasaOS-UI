// What the dashboard says about ZFS, from LocalStorage's GET /v1/disks/zfs (sizes in bytes, times in Unix seconds, -1 for "not said").
import { renderSize } from '@/mixins/file_utils'

const LIVE_STATES = {
	ONLINE: { type: 'is-success', icon: 'mdi-check' },
	DEGRADED: { type: 'is-warning', icon: 'mdi-alert' },
}

// The health of a pool as a tag: its Buefy type, an icon (the shape says it as well as the colour), and its text, translated with t.
// Only ONLINE is green. A pool whose state could not be read is grey and says so; a state this code does not know is red.
export function zfsTag(pool, t) {
	if (!pool.known) {
		return { type: 'is-light', icon: 'mdi-help', text: t('State unknown') }
	}
	const names = {
		ONLINE: t('Online'),
		DEGRADED: t('Degraded'),
		FAULTED: t('Faulted'),
		UNAVAIL: t('Unavailable'),
		OFFLINE: t('Offline'),
		REMOVED: t('Device removed'),
		SUSPENDED: t('Pool suspended'),
	}
	const live = LIVE_STATES[pool.state] || { type: 'is-danger', icon: 'mdi-close' }
	return { ...live, text: names[pool.state] || pool.state }
}

// The colour of a capacity bar: ZFS slows down well before a pool is full.
export function zfsCapacityType(percent) {
	if (percent >= 90) {
		return 'is-danger'
	}
	return percent >= 80 ? 'is-warning' : 'is-info'
}

// used / (used + available): what ZFS itself announces, which counts quotas and reservations; not relative to the pool.
export function zfsUsedPercent(dataset) {
	const total = dataset.used + dataset.available
	return total > 0 ? Math.min(100, (dataset.used * 100) / total) : 0
}

// The datasets of all the pools as rows in tree order, each with its depth: a pool's root first, then its children by name.
export function zfsRows(datasets) {
	const byName = new Map(datasets.map(d => [d.name, d]))
	const children = new Map()
	const roots = []
	for (const d of datasets) {
		const cut = d.name.lastIndexOf('/')
		const parent = cut > 0 ? d.name.slice(0, cut) : ''
		if (parent && byName.has(parent)) {
			children.set(parent, [...(children.get(parent) || []), d])
		} else {
			roots.push(d)
		}
	}
	const rows = []
	const walk = (list, depth) => {
		for (const d of [...list].sort((a, b) => a.name.localeCompare(b.name))) {
			rows.push({ ...d, depth, short: depth === 0 ? d.name : d.name.slice(d.name.lastIndexOf('/') + 1) })
			walk(children.get(d.name) || [], depth + 1)
		}
	}
	walk(roots, 0)
	return rows
}

// Where a dataset is mounted, or why it is not: { text, locked }.
export function zfsMount(dataset, t) {
	if (dataset.type === 'volume') {
		return { text: t('Volume'), locked: false }
	}
	if (dataset.key_status === 'unavailable') {
		return { text: t('Locked'), locked: true }
	}
	if (dataset.mountpoint === 'legacy') {
		return { text: t('Mounted by the system'), locked: false }
	}
	if (!dataset.mounted || !dataset.mountpoint || dataset.mountpoint === 'none') {
		return { text: t('Not mounted'), locked: false }
	}
	return { text: dataset.mountpoint, locked: false }
}

// 1007 seconds as 00:16:47
export function zfsDuration(seconds) {
	if (!(seconds >= 0)) {
		return ''
	}
	const pad = n => String(n).padStart(2, '0')
	return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(Math.floor(seconds % 60))}`
}

function zfsWhen(seconds) {
	return seconds > 0 ? new Date(seconds * 1000).toLocaleString() : ''
}

// The last scan (ZFS keeps one only: a resilver wipes the memory of the scrub before it) as a sentence, and whether it is a problem.
export function zfsScanText(scan, t) {
	const kind = scan.kind === 'resilver' ? t('resilver') : t('scrub')
	if (scan.kind === 'none') {
		return { text: t('No scrub has run yet.'), problem: false }
	}
	if (scan.kind === 'other') {
		return { text: scan.raw, problem: false }
	}
	if (scan.state === 'running') {
		const left = scan.remaining >= 0 ? t(', {time} left', { time: zfsDuration(scan.remaining) }) : ''
		return { text: t('{kind} in progress: {percent} %{left}', { kind, percent: scan.percent >= 0 ? scan.percent.toFixed(1) : '?', left }), problem: false }
	}
	if (scan.state === 'paused') {
		return { text: t('{kind} paused', { kind }), problem: false }
	}
	if (scan.state === 'canceled') {
		return { text: t('{kind} canceled', { kind }), problem: false }
	}
	const errors = scan.errors > 0 ? t('{count} errors', { count: scan.errors }) : t('no error')
	const took = scan.duration >= 0 ? t(', took {time}', { time: zfsDuration(scan.duration) }) : ''
	const on = zfsWhen(scan.ended) ? t(', on {date}', { date: zfsWhen(scan.ended) }) : ''
	return { text: t('Last scan: {kind}, {errors}{took}{on}', { kind, errors, took, on }), problem: scan.errors > 0 }
}

// The rates between two readings of the counters of a pool, per second; null when they say nothing (no earlier reading, a pool imported again, no time between).
export function zfsRates(before, after) {
	if (!before || !after) {
		return null
	}
	const seconds = (after.at - before.at) / 1000
	const read = after.read_bytes - before.read_bytes
	const write = after.write_bytes - before.write_bytes
	const readOps = after.read_ops - before.read_ops
	const writeOps = after.write_ops - before.write_ops
	if (seconds <= 0 || read < 0 || write < 0 || readOps < 0 || writeOps < 0) {
		return null
	}
	return { read: read / seconds, write: write / seconds, readOps: readOps / seconds, writeOps: writeOps / seconds }
}

export function zfsRate(bytesPerSecond) {
	return `${renderSize(Math.round(bytesPerSecond))}/s`
}

// 1320 as 1.32 k
export function zfsOps(perSecond) {
	return perSecond >= 1000 ? `${(perSecond / 1000).toFixed(2)} k` : String(Math.round(perSecond))
}

// The disks of a pool: the leaves of its tree that are disks, with the disk they are on.
export function zfsDisks(vdevs) {
	const disks = []
	const walk = (list) => {
		for (const v of list) {
			if (v.children?.length) {
				walk(v.children)
			} else if (v.kind === 'disk') {
				disks.push({ name: v.name.slice(v.name.lastIndexOf('/') + 1), disk: v.disk, state: v.state })
			}
		}
	}
	walk(vdevs)
	return disks
}

// The layout of a pool in a word: mirror-0, raidz1-0... of its top vdevs that hold data (not logs, cache, spares), or "disk" for a pool of plain disks.
export function zfsLayout(vdevs) {
	const data = vdevs.filter(v => v.kind !== 'group' && v.kind !== 'disk').map(v => v.name)
	return data.length ? data.join(', ') : ''
}

// The rows of the vdev tree with their depth, for the detail.
export function zfsVdevRows(vdevs, depth = 0) {
	return vdevs.flatMap(v => [{ ...v, depth }, ...zfsVdevRows(v.children || [], depth + 1)])
}
