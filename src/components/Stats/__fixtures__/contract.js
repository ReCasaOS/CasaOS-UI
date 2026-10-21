// Contract-shaped builders (contract sections 1-2) for every Stats spec and the stub.
export const HOSTILE = '<img src=x onerror="window.pwned = 1">'

export function anItem(over = {}) {
	return {
		id: 'app:jellyfin:web:1',
		name: 'Jellyfin',
		kind: 'app-container',
		group: 'Conteneurs',
		state: 'running',
		started_at: '2026-10-19T08:00:00Z',
		detail: 'jellyfin/jellyfin:10.9',
		cpu_percent: 12.5,
		memory_used: 268435456,
		memory_limit: 1073741824,
		alerts: 0,
		...over,
	}
}

// [[t, avg, min, max], ...]; fn(i) gives the avg (null = gap); gaps = indexes forced to a gap.
export function makePoints({ from = 1760000000, step = 5, count = 180, fn = i => (i % 50) + 1, gaps = [] } = {}) {
	return Array.from({ length: count }, (_, i) => {
		const t = from + i * step
		const v = gaps.includes(i) ? null : fn(i)
		return v === null || v === undefined ? [t, null, null, null] : [t, v, v, v]
	})
}

// `live`: 5-s steps over 15 minutes.
const LIVE = { from: 1760000000, step: 5, count: 180 }

// key is 'chart/name' or 'chart/name:instance' (instance = after the first ':').
function s(key, unit, fn) {
	const slash = key.indexOf('/')
	return { chart: key.slice(0, slash), name: key.slice(slash + 1), unit, points: makePoints({ ...LIVE, fn }) }
}

export const CONTAINER_SERIES = [
	s('cpu/user', 'percent'),
	s('cpu/system', 'percent'),
	s('cpu/iowait', 'percent'),
	s('cpu/throttled', 'percent'),
	s('memory/rss', 'bytes'),
	s('memory/cache', 'bytes'),
	s('memory/swap', 'bytes'),
	s('memory/limit', 'bytes', () => 1073741824),
	s('network/rx:eth0', 'bytes_per_second'),
	s('network/tx:eth0', 'bytes_per_second'),
	s('network/dropped:eth0', 'packets_per_second'),
	s('disk/read', 'bytes_per_second'),
	s('disk/write', 'bytes_per_second'),
	s('disk/iops_read', 'ops_per_second'),
	s('disk/iops_write', 'ops_per_second'),
	s('pids/count', 'count'),
	s('pids/fds', 'count'),
	s('restarts/count', 'count', () => 0),
	s('health/ok', 'flag', () => 1),
]

export const VM_SERIES = [
	s('cpu/total', 'percent'),
	s('cpu/vcpus', 'count', () => 2),
	s('memory/assigned', 'bytes', () => 2147483648),
	s('memory/used', 'bytes'),
	s('network/rx:52:54:00:aa:bb:cc', 'bytes_per_second'),
	s('network/tx:52:54:00:aa:bb:cc', 'bytes_per_second'),
	s('disk/read:vda', 'bytes_per_second'),
	s('disk/write:vda', 'bytes_per_second'),
	s('disk/iops_read:vda', 'ops_per_second'),
	s('disk/iops_write:vda', 'ops_per_second'),
	s('health/ok', 'flag', () => 1),
]

export const HOST_SERIES = [
	s('cpu/total', 'percent'),
	s('cpu/vcpus', 'count', () => 4),
	s('memory/rss', 'bytes'),
	s('memory/limit', 'bytes', () => 8589934592),
	s('network/rx:eth0', 'bytes_per_second'),
	s('network/tx:eth0', 'bytes_per_second'),
	s('disk/read', 'bytes_per_second'),
	s('disk/write', 'bytes_per_second'),
	s('fs/free_percent:/DATA', 'percent', () => 60),
	s('fs/free_percent:/', 'percent', () => 35),
]

export function aSeries(over = {}) {
	return {
		id: 'app:jellyfin:web:1',
		range: 'live',
		step_seconds: LIVE.step,
		from: LIVE.from,
		to: LIVE.from + LIVE.step * (LIVE.count - 1),
		scale: { cpu: 'percent_of_one_core', cpu_allocation: 2, memory_limit: 1073741824 },
		series: CONTAINER_SERIES,
		notes: [],
		...over,
	}
}

export function anAlerts(over = {}) {
	return {
		rules: [
			{ key: 'cpu_high', enabled: true, threshold: 90, minutes: 10 },
			{ key: 'mem_high', enabled: true, threshold: 90, minutes: 5 },
		],
		active: [],
		...over,
	}
}
