// A stub of the three statistics services, built from the contract fixtures: a pure `handle(request, options)`.
//
// request: { method, path, query, body }  ->  { status, body }
// options: {
//   envelope: 'real' | 'bare'   'real' wraps the core in {success, message, data}, the two v2 services answer bare;
//                               'bare' answers all three bare (a deliberate violation: the core column must fail)
//   now:      seconds           the clock; the series end at it, so a live chart moves
//   alerts:   boolean           one container has 2 active alerts
//   down:     [source]          sources whose list answers 503
//   rules:    Map               the rules PUT so far, by item id (optional; without it a PUT is only validated and echoed)
// }
import { CONTAINER_SERIES, HOST_SERIES, VM_SERIES, anAlerts, anItem } from '../../src/components/Stats/__fixtures__/contract.js'

const PREFIXES = {
	'/v2/app_management/stats': 'app_management',
	'/v2/virt_management/stats': 'virt_management',
	'/v1/sys/stats': 'core',
}

// range -> [step in seconds, number of points]
const RANGES = { 'live': [5, 180], '15m': [60, 15], '1h': [60, 60], '24h': [300, 288], '7d': [1800, 336] }

const BYTES_PER_GIB = 1073741824
const CORE_ALERTING = 'app:immich:server:1'

const ITEMS = {
	app_management: [
		anItem({ id: 'app:jellyfin:web:1', name: 'web', app: 'Jellyfin', seed: 1 }),
		anItem({ id: 'app:plex:web:1', name: 'web', app: 'Plex', detail: 'plexinc/pms-docker:latest', seed: 2 }),
		anItem({ id: CORE_ALERTING, name: 'server', app: 'Immich', detail: 'immich-app/immich-server:release', seed: 3 }),
		anItem({ id: 'container:postgres', name: 'postgres', kind: 'container', group: 'Autres conteneurs', app: undefined, detail: 'postgres:16', seed: 4 }),
	],
	virt_management: [
		anItem({ id: 'vm:11111111-aaaa', name: 'Debian', kind: 'vm', group: 'Machines virtuelles', app: undefined, detail: 'Debian 12', memory_limit: 2 * BYTES_PER_GIB, seed: 5 }),
		anItem({ id: 'vm:22222222-bbbb', name: 'Windows', kind: 'vm', group: 'Machines virtuelles', app: undefined, detail: 'Windows 11', memory_limit: 4 * BYTES_PER_GIB, seed: 6 }),
	],
	core: [
		anItem({ id: 'host', name: 'stagevet-box', kind: 'host', group: 'Machine', app: undefined, detail: null, memory_limit: 8 * BYTES_PER_GIB, seed: 7 }),
	],
}

const OTHER_SERIES = { app_management: CONTAINER_SERIES, virt_management: VM_SERIES, core: HOST_SERIES }

const wave = (t, seed, period) => (Math.sin((t / period) + seed) + 1) / 2

// The value of one series at second t, as a number in the unit's natural range
function valueAt(chart, name, unit, t, seed) {
	const key = `${chart}/${name}`
	if (key === 'cpu/vcpus') {
		return seed === 7 ? 4 : 2
	}
	if (key === 'memory/limit') {
		return seed === 7 ? 8 * BYTES_PER_GIB : BYTES_PER_GIB
	}
	if (key === 'memory/assigned') {
		return (seed === 5 ? 2 : 4) * BYTES_PER_GIB
	}
	if (chart === 'fs') {
		return name.endsWith(':/') ? 35 : 60
	}
	if (key === 'health/ok') {
		return 1
	}
	if (key === 'restarts/count') {
		return 0
	}
	const w = wave(t, seed, 30 + seed * 7)
	switch (unit) {
		case 'percent': return 5 + w * 60
		case 'bytes': return (0.1 + w * 0.5) * BYTES_PER_GIB
		case 'bytes_per_second': return w * 5000000
		case 'packets_per_second': return w * 3
		case 'ops_per_second': return w * 400
		default: return Math.round(10 + w * 30)
	}
}

const round = n => Math.round(n * 1000) / 1000

function pointsOf({ chart, name, unit }, { from, step, count }, seed, gapAt) {
	return Array.from({ length: count }, (_, i) => {
		const t = from + i * step
		if (gapAt.includes(i)) {
			return [t, null, null, null]
		}
		const avg = round(valueAt(chart, name, unit, t, seed))
		return [t, avg, round(avg * 0.9), round(avg * 1.1)]
	})
}

const reply = (status, body) => ({ status, body })
const fail = (status, code) => reply(status, { message: code })

function find(id) {
	for (const source of Object.keys(ITEMS)) {
		const item = ITEMS[source].find(candidate => candidate.id === id)
		if (item) {
			return { source, item }
		}
	}
	return null
}

function listOf(source, now, alerts) {
	const cpu = item => round(valueAt('cpu', 'total', 'percent', now, item.seed))
	return {
		items: ITEMS[source].map(({ seed, ...item }) => ({
			...item,
			// the fixtures give every key; a null detail stays null
			cpu_percent: cpu({ seed }),
			alerts: alerts && item.id === CORE_ALERTING ? 2 : 0,
		})),
		notes: [],
	}
}

function seriesOf(source, item, range, now) {
	const [step, count] = RANGES[range]
	const to = Math.floor(now / step) * step
	const frame = { from: to - (count - 1) * step, step, count }
	// the 7-day chart has a hole in the middle: the machine was off for a while
	const gapAt = range === '7d' ? Array.from({ length: 12 }, (_, i) => Math.floor(count / 2) + i) : []
	const noMemoryUsed = item.id === 'vm:22222222-bbbb'
	const noCpuLimit = item.id === 'app:plex:web:1'
	const list = OTHER_SERIES[source].filter(s => !(noMemoryUsed && s.chart === 'memory' && s.name === 'used'))
	const notes = []
	if (noMemoryUsed) {
		notes.push('vm_memory_used_unavailable')
	}
	if (noCpuLimit) {
		notes.push('no_cpu_limit')
	}
	const vcpus = source === 'app_management' ? (noCpuLimit ? 4 : 2) : (item.id === 'host' ? 4 : 2)
	return {
		id: item.id,
		range,
		step_seconds: step,
		from: frame.from,
		to,
		scale: { cpu: 'percent_of_one_core', cpu_allocation: vcpus, memory_limit: item.memory_limit ?? null },
		series: list.map(s => ({ chart: s.chart, name: s.name, unit: s.unit, points: pointsOf(s, frame, item.seed, gapAt) })),
		notes,
	}
}

const KEYS = ['cpu_high', 'mem_high']
const inRange = (n, min, max) => typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max

// the first refused field of a PUT body as 'rules[i].field', 'rules' for a body that has no list
function refusal(body) {
	if (!body || !Array.isArray(body.rules)) {
		return 'rules'
	}
	for (let i = 0; i < body.rules.length; i++) {
		const rule = body.rules[i]
		if (!rule || typeof rule !== 'object' || !KEYS.includes(rule.key)) {
			return `rules[${i}].key`
		}
		if (typeof rule.enabled !== 'boolean') {
			return `rules[${i}].enabled`
		}
		if (!inRange(rule.threshold, 1, 100)) {
			return `rules[${i}].threshold`
		}
		if (!inRange(rule.minutes, 1, 120)) {
			return `rules[${i}].minutes`
		}
	}
	return ''
}

function alertsOf(item, options, now) {
	const stored = options.rules?.get(item.id)
	const base = anAlerts()
	const firing = options.alerts && item.id === CORE_ALERTING
	return {
		rules: stored || base.rules,
		active: firing
			? [
					{ key: 'cpu_high', since: new Date((now - 600) * 1000).toISOString(), value: 93 },
					{ key: 'mem_high', since: new Date((now - 300) * 1000).toISOString(), value: 95 },
				]
			: [],
	}
}

function route(method, source, rest, query, body, options, now) {
	const segments = rest.split('/').filter(Boolean)
	if (segments.length === 0) {
		if (method !== 'GET') {
			return fail(405, 'method_not_allowed')
		}
		return options.down?.includes(source) ? fail(503, 'stats_unavailable') : reply(200, listOf(source, now, options.alerts))
	}
	let id
	try {
		id = decodeURIComponent(segments[0])
	} catch {
		return fail(404, 'unknown_item')
	}
	if (id === 'broken') {
		return fail(503, 'stats_unavailable')
	}
	const found = find(id)
	if (!found || found.source !== source || segments.length > 2) {
		return fail(404, 'unknown_item')
	}
	if (segments.length === 1) {
		if (method !== 'GET') {
			return fail(405, 'method_not_allowed')
		}
		const range = query?.range ?? 'live'
		return Object.prototype.hasOwnProperty.call(RANGES, range) ? reply(200, seriesOf(source, found.item, range, now)) : fail(400, 'bad_range')
	}
	if (segments[1] !== 'alerts') {
		return fail(404, 'unknown_item')
	}
	if (method === 'GET') {
		return reply(200, alertsOf(found.item, options, now))
	}
	if (method === 'PUT') {
		const field = refusal(body)
		if (field) {
			return fail(400, `bad_rules: ${field}`)
		}
		// a PUT updates the keys it sends and leaves the others
		const merged = new Map(alertsOf(found.item, options, now).rules.map(rule => [rule.key, rule]))
		body.rules.forEach(rule => merged.set(rule.key, { key: rule.key, enabled: rule.enabled, threshold: rule.threshold, minutes: rule.minutes }))
		const rules = [...merged.values()]
		options.rules?.set(found.item.id, rules)
		return reply(200, { ...alertsOf(found.item, options, now), rules })
	}
	return fail(405, 'method_not_allowed')
}

export function handle({ method = 'GET', path = '', query = {}, body = null } = {}, options = {}) {
	const prefix = Object.keys(PREFIXES).find(candidate => path === candidate || path.startsWith(`${candidate}/`))
	if (!prefix) {
		return fail(404, 'not_found')
	}
	const source = PREFIXES[prefix]
	const now = options.now ?? Date.now() / 1000
	const answer = route(method.toUpperCase(), source, path.slice(prefix.length), query, body, options, now)
	// the core's habitual envelope; errors keep their HTTP status and carry the code in `message`
	if (source === 'core' && (options.envelope ?? 'real') === 'real') {
		const ok = answer.status < 300
		return reply(answer.status, ok ? { success: 200, message: 'ok', data: answer.body } : { success: answer.status, message: answer.body.message })
	}
	return answer
}
