/**
 * What the Statistics window makes of what the three services send: cleaning (every value may be absent, odd or hostile),
 * grouping, the chart definitions and the mapping of contract series to apexcharts series.
 *
 * A point that is not a finite, non-negative, sane number is a gap (null), never 0. A string from a service is plain text:
 * apexcharts builds its tooltip as HTML, so the series NAME it receives is escaped first (`name`); `label` is for Vue text.
 */
import escape from 'lodash/escape'
import { FORMAT_KEYS, formatTime, formatValue } from './statsFormat'
import { clean } from '@/components/settings/osPlan'

const MAX_ITEMS = 500
const MAX_SERIES = 500
const MAX_INSERTED = 2000
const MAX_VALUE = 1e18
const STATES = ['running', 'stopped', 'paused', 'crashed', 'unknown']
const PALETTE = ['#00ab44', '#3b9cf5', '#f5a623', '#e0568a', '#9a6bf0']
const REF_COLOR = '#8a8f98'

export const GROUPS = [
	{ id: 'containers', label: 'Containers', kinds: ['app-container'] },
	{ id: 'other', label: 'Other containers', kinds: ['container'] },
	{ id: 'vms', label: 'Virtual Machines', kinds: ['vm'] },
	{ id: 'host', label: 'Machine', kinds: ['host'] },
]

const KINDS = GROUPS.flatMap(g => g.kinds)

const own = (table, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined
const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const isNumber = v => typeof v === 'number' && Number.isFinite(v)
const saneValue = v => isNumber(v) && v >= 0 && v <= MAX_VALUE ? v : null
const nonNegative = v => isNumber(v) && v >= 0 ? v : null

// ---------------------------------------------------------------- items

export function normalizeItems(raw, source) {
	if (!isPlain(raw) || !Array.isArray(raw.items)) {
		return []
	}
	const items = []
	for (const entry of raw.items.slice(0, MAX_ITEMS)) {
		if (!isPlain(entry)) {
			continue
		}
		const { id, kind } = entry
		if (typeof id !== 'string' || id === '' || id.length > 300 || !KINDS.includes(kind)) {
			continue
		}
		const started = typeof entry.started_at === 'string' ? Date.parse(entry.started_at) : Number.NaN
		items.push({
			id,
			source,
			kind,
			name: clean(entry.name, 80) || clean(id, 80),
			state: STATES.includes(entry.state) ? entry.state : 'unknown',
			cpu_percent: nonNegative(entry.cpu_percent),
			memory_used: nonNegative(entry.memory_used),
			memory_limit: nonNegative(entry.memory_limit),
			alerts: nonNegative(entry.alerts) ?? 0,
			started_at: Number.isNaN(started) ? null : entry.started_at,
			detail: Array.from(clean(entry.detail, 800)).slice(0, 200).join('').trim() || null,
		})
	}
	return items
}

export function listNotes(raw) {
	if (!isPlain(raw) || !Array.isArray(raw.notes)) {
		return []
	}
	return raw.notes.filter(n => typeof n === 'string').slice(0, 5).map(n => clean(n, 60))
}

export function groupItems(items) {
	return GROUPS
		.map(g => ({
			id: g.id,
			label: g.label,
			items: items.filter(i => g.kinds.includes(i.kind)).sort((a, b) => a.name.localeCompare(b.name)),
		}))
		.filter(g => g.items.length > 0)
}

// ---------------------------------------------------------------- charts

// Every key is `chart/name`, matched exactly or with an instance (`:eth0`).
export const CHARTS = [
	{ id: 'cpu', title: 'Processor', stacked: true, wide: true, unit: 'percent', keys: [
		{ key: 'cpu/user', label: 'User', kind: 'area', color: PALETTE[0] },
		{ key: 'cpu/system', label: 'System', kind: 'area', color: PALETTE[1] },
		{ key: 'cpu/iowait', label: 'Waiting for disk', kind: 'area', color: PALETTE[2] },
		{ key: 'cpu/throttled', label: 'Throttled', kind: 'line', color: PALETTE[3] },
		{ key: 'cpu/total', label: 'Total', kind: 'area', color: PALETTE[0] },
		{ key: 'cpu/vcpus', label: 'Processor limit', kind: 'ref', color: REF_COLOR },
	] },
	{ id: 'memory', title: 'Memory', stacked: true, unit: 'bytes', keys: [
		{ key: 'memory/rss', label: 'Resident', kind: 'area', color: PALETTE[0] },
		{ key: 'memory/cache', label: 'Cache', kind: 'area', color: PALETTE[1] },
		{ key: 'memory/swap', label: 'Swap', kind: 'area', color: PALETTE[2] },
		{ key: 'memory/limit', label: 'Memory limit', kind: 'ref', color: REF_COLOR },
		{ key: 'memory/assigned', label: 'Assigned', kind: 'line', color: PALETTE[3] },
		{ key: 'memory/used', label: 'Used', kind: 'area', color: PALETTE[0] },
	] },
	{ id: 'network', title: 'Network', stacked: false, unit: 'bytes_per_second', keys: [
		{ key: 'network/rx', label: 'Received', kind: 'area', color: PALETTE[0] },
		{ key: 'network/tx', label: 'Sent', kind: 'area', color: PALETTE[1] },
	] },
	{ id: 'network_dropped', title: 'Dropped packets', stacked: false, unit: 'packets_per_second', keys: [
		{ key: 'network/dropped', label: 'Dropped', kind: 'line', color: PALETTE[3] },
	] },
	{ id: 'disk', title: 'Disk', stacked: false, unit: 'bytes_per_second', keys: [
		{ key: 'disk/read', label: 'Read', kind: 'area', color: PALETTE[0] },
		{ key: 'disk/write', label: 'Write', kind: 'area', color: PALETTE[1] },
	] },
	{ id: 'disk_iops', title: 'Disk operations', stacked: false, unit: 'ops_per_second', keys: [
		{ key: 'disk/iops_read', label: 'Read operations', kind: 'line', color: PALETTE[0] },
		{ key: 'disk/iops_write', label: 'Write operations', kind: 'line', color: PALETTE[1] },
	] },
	{ id: 'fs', title: 'Free space', stacked: false, unit: 'percent', keys: [
		{ key: 'fs/free_percent', label: 'Free', kind: 'line', color: PALETTE[0] },
	] },
	{ id: 'pids', title: 'Processes', stacked: false, unit: 'count', keys: [
		{ key: 'pids/count', label: 'Processes', kind: 'line', color: PALETTE[0] },
		{ key: 'pids/fds', label: 'Open files', kind: 'line', color: PALETTE[1] },
	] },
	{ id: 'restarts', title: 'Restarts', stacked: false, unit: 'count', keys: [
		{ key: 'restarts/count', label: 'Restarts', kind: 'step', color: PALETTE[2] },
	] },
	{ id: 'health', title: 'Health', stacked: false, unit: 'flag', keys: [
		{ key: 'health/ok', label: 'Healthy', kind: 'step', color: PALETTE[0] },
	] },
]

const NOTE_TEXTS = {
	vm_memory_used_unavailable: 'The memory used inside the virtual machine is not reported.',
	no_cpu_limit: 'No processor limit is set: the cores of the machine are the reference.',
	no_memory_limit: 'No memory limit is set.',
	container_gone: 'This container no longer exists: only its history is shown.',
	stats_capacity: 'Too many items: some of them are not measured.',
}
// The chart a note belongs to; the others are for the page.
const NOTE_CHART = { vm_memory_used_unavailable: 'memory', no_cpu_limit: 'cpu', no_memory_limit: 'memory' }

const VCPUS_VM = 'Capacity of the virtual processors'
const VCPUS_HOST = 'Processor limit'

export const STATS_KEYS = [...new Set([
	...GROUPS.map(g => g.label),
	...CHARTS.flatMap(c => [c.title, ...c.keys.map(k => k.label)]),
	VCPUS_VM,
	VCPUS_HOST,
	...Object.values(NOTE_TEXTS),
	'Note from the service: {code}',
	'{label} (max)',
	'% of one core',
	'{n} cores allocated',
	'no limit set',
	'on {size} allowed',
	'Processor',
	'Memory',
	'Received',
	'Sent',
	'Disk',
	'Processes',
	'Virtual CPUs',
	'No data for this period',
	...FORMAT_KEYS,
])]

export function noteText(code, t) {
	const key = own(NOTE_TEXTS, code)
	return key ? t(key) : t('Note from the service: {code}', { code: clean(code, 60) })
}

export function cleanSeries(raw, { stepSeconds } = {}) {
	const byTime = new Map()
	for (const p of Array.isArray(raw) ? raw : []) {
		if (!Array.isArray(p) || !isNumber(p[0])) {
			continue
		}
		const avg = saneValue(p[1])
		byTime.set(p[0], { t: p[0], avg, min: saneValue(p[2]) ?? avg, max: saneValue(p[3]) ?? avg })
	}
	const sorted = [...byTime.values()].sort((a, b) => a.t - b.t)
	if (!(stepSeconds > 0) || !Number.isFinite(stepSeconds)) {
		return { points: sorted }
	}
	const points = []
	let inserted = 0
	for (const p of sorted) {
		const last = points.at(-1)
		if (last && p.t - last.t > 1.5 * stepSeconds && inserted < MAX_INSERTED) {
			points.push({ t: last.t + stepSeconds, avg: null, min: null, max: null })
			inserted++
		}
		points.push(p)
	}
	return { points }
}

const matches = (base, key) => key === base || key.startsWith(`${base}:`)

function buildOne(def, byKey, { range, hidden, kind, t }, response) {
	// the series of this chart, in the order of the definition
	const found = []
	for (const k of def.keys) {
		let ordinal = 0
		for (const [key, cleaned] of byKey) {
			if (matches(k.key, key)) {
				const instance = key.length > k.key.length ? key.slice(k.key.length + 1) : ''
				const color = k.kind === 'ref' ? k.color : PALETTE[(PALETTE.indexOf(k.color) + ordinal) % PALETTE.length]
				found.push({ def: k, key, instance, color, points: cleaned.points })
				ordinal++
			}
		}
	}
	if (found.length === 0) {
		return null
	}
	const notes = Array.isArray(response.notes) ? response.notes : []
	const alloc = response.scale?.cpu_allocation
	const labelOf = (f) => {
		let base = f.key === 'cpu/vcpus' ? t(kind === 'vm' ? VCPUS_VM : VCPUS_HOST) : t(f.def.label)
		if (f.instance) {
			base += ` · ${clean(f.instance, 40)}`
		}
		return base
	}
	// a stacked chart has a gap wherever any component has one
	if (def.stacked) {
		const parts = found.filter(f => f.def.kind === 'area')
		const bad = new Set()
		const times = new Set(parts.flatMap(f => f.points.map(p => p.t)))
		for (const time of times) {
			if (parts.some(f => (f.points.find(p => p.t === time)?.avg ?? null) === null)) {
				bad.add(time)
			}
		}
		for (const f of parts) {
			f.points = f.points.map(p => bad.has(p.t) ? { t: p.t, avg: null, min: null, max: null } : p)
		}
	}
	const scaleRef = f => f.def.kind === 'ref' && f.key === 'cpu/vcpus'
		? { ...f, points: f.points.map(p => ({ t: p.t, avg: p.avg === null ? null : p.avg * 100, min: p.min === null ? null : p.min * 100, max: p.max === null ? null : p.max * 100 })) }
		: f
	const list = found.map(scaleRef)
	// the processor limit of a container comes from the scale, not from a series
	if (def.id === 'cpu' && !byKey.has('cpu/vcpus') && !notes.includes('no_cpu_limit') && isNumber(alloc) && alloc > 0) {
		const base = found.find(f => f.def.kind !== 'ref')
		if (base) {
			list.push({ def: { key: 'cpu/allocation', label: 'Processor limit', kind: 'ref' }, key: 'cpu/allocation', instance: '', color: REF_COLOR, points: base.points.map(p => ({ t: p.t, avg: alloc * 100, min: alloc * 100, max: alloc * 100 })) })
		}
	}
	const empty = !list.some(f => f.def.kind !== 'ref' && f.points.some(p => p.avg !== null))
	const series = []
	// every line the person can toggle, hidden or not (the legend)
	const legend = []
	for (const f of list) {
		const label = labelOf(f)
		legend.push({ key: f.key, label, color: f.color, kind: f.def.kind, hidden: hidden.has(f.key) })
		if (hidden.has(f.key)) {
			continue
		}
		const toData = pick => f.points.map(p => ({ x: p.t * 1000, y: p[pick] }))
		series.push({ key: f.key, name: escape(label), label, color: f.color, kind: f.def.kind, points: toData('avg'), cleaned: f.points })
		if ((range === '24h' || range === '7d') && f.def.kind === 'area') {
			const maxLabel = t('{label} (max)', { label })
			series.push({ key: `${f.key}#max`, name: escape(maxLabel), label: maxLabel, color: f.color, kind: 'line', points: toData('max'), cleaned: f.points.map(p => ({ ...p, avg: p.max })) })
		}
	}
	return {
		id: def.id,
		title: t(def.title),
		unit: def.unit,
		stacked: def.stacked,
		wide: Boolean(def.wide),
		empty,
		series,
		legend,
		caption: chartCaption(def, response.scale, notes, t),
		noteCodes: notes.filter(n => own(NOTE_CHART, n) === def.id).map(n => clean(n, 60)),
	}
}

export function buildCharts(response, { range = 'live', hidden = new Set(), kind = '', t = k => k } = {}) {
	if (!isPlain(response) || !Array.isArray(response.series)) {
		return []
	}
	const byKey = new Map()
	for (const s of response.series.slice(0, MAX_SERIES)) {
		if (isPlain(s) && typeof s.chart === 'string' && typeof s.name === 'string') {
			byKey.set(`${s.chart}/${s.name}`, cleanSeries(s.points, { stepSeconds: response.step_seconds }))
		}
	}
	return CHARTS.map(def => buildOne(def, byKey, { range, hidden, kind, t }, response)).filter(Boolean)
}

// ---------------------------------------------------------------- scale, options, captions

function observedMax(chart) {
	let max = Number.NEGATIVE_INFINITY
	const stack = new Map()
	for (const s of chart.series) {
		if (s.key.endsWith('#max')) {
			continue
		}
		for (const p of s.points) {
			if (!isNumber(p.y)) {
				continue
			}
			if (chart.stacked && s.kind === 'area') {
				stack.set(p.x, (stack.get(p.x) ?? 0) + p.y)
			} else {
				max = Math.max(max, p.y)
			}
		}
	}
	for (const v of stack.values()) {
		max = Math.max(max, v)
	}
	return max
}

export function scaleMax(chart, scale) {
	const values = [observedMax(chart)]
	if (chart.id === 'fs') {
		return 100
	}
	if (chart.id === 'cpu' && isNumber(scale?.cpu_allocation)) {
		values.push(scale.cpu_allocation * 100)
	}
	if (chart.id === 'memory' && isNumber(scale?.memory_limit)) {
		values.push(scale.memory_limit)
	}
	const max = Math.max(...values.filter(Number.isFinite))
	return Number.isFinite(max) && max > 0 ? max * 1.1 : undefined
}

export function chartCaption(chart, scale, notes, t, locale = 'en') {
	const list = Array.isArray(notes) ? notes : []
	const parts = []
	if (chart.id === 'cpu') {
		parts.push(t('% of one core'))
		if (list.includes('no_cpu_limit')) {
			parts.push(t('no limit set'))
		} else if (isNumber(scale?.cpu_allocation) && scale.cpu_allocation > 0) {
			parts.push(t('{n} cores allocated', { n: scale.cpu_allocation }))
		}
	} else if (chart.id === 'memory') {
		if (list.includes('no_memory_limit')) {
			parts.push(t('no limit set'))
		} else if (isNumber(scale?.memory_limit) && scale.memory_limit > 0) {
			parts.push(t('on {size} allowed', { size: formatValue(scale.memory_limit, 'bytes', locale) }))
		}
	}
	return parts.join(' · ')
}

export function chartOptions(chart, { zoom, height, locale = 'en', range = 'live', scale } = {}) {
	const y = v => formatValue(v, chart.unit, locale)
	const time = v => formatTime(Number(v) / 1000, range, locale)
	return {
		chart: {
			id: `stats-${chart.id}`,
			type: 'line',
			height,
			stacked: chart.stacked,
			toolbar: { show: false },
			animations: { enabled: false },
		},
		legend: { show: false },
		stroke: { curve: 'straight', width: 2 },
		dataLabels: { enabled: false },
		xaxis: { type: 'datetime', min: zoom ? zoom.min : null, max: zoom ? zoom.max : null, labels: { formatter: time } },
		yaxis: { min: 0, max: scaleMax(chart, scale), labels: { formatter: y } },
		tooltip: { shared: true, x: { formatter: time }, y: { formatter: y } },
		annotations: {},
	}
}

// ---------------------------------------------------------------- figures and tables

function lastFresh(series, response) {
	const step = response.step_seconds
	const to = response.to
	if (!isNumber(to) || !isNumber(step)) {
		return null
	}
	const points = cleanSeries(series.points, { stepSeconds: step }).points
	const p = [...points].reverse().find(q => q.avg !== null)
	if (!p) {
		return null
	}
	return p.t < to - (3 * step) ? null : p.avg
}

export function figures(response, item, locale, t) {
	const list = isPlain(response) && Array.isArray(response.series) ? response.series.filter(isPlain) : []
	const vals = base => list.filter(s => matches(base, `${s.chart}/${s.name}`)).map(s => lastFresh(s, response)).filter(v => v !== null)
	const sum = (bases) => {
		const all = bases.flatMap(vals)
		return all.length > 0 ? all.reduce((a, b) => a + b, 0) : null
	}
	const vm = item?.kind === 'vm'
	const memory = vm ? (sum(['memory/used']) ?? sum(['memory/assigned'])) : sum(['memory/rss'])
	const cpu = sum(['cpu/total']) ?? sum(['cpu/user', 'cpu/system', 'cpu/iowait'])
	const last = vm ? { id: 'vcpus', label: t('Virtual CPUs'), value: sum(['cpu/vcpus']), unit: 'count' } : { id: 'processes', label: t('Processes'), value: sum(['pids/count']), unit: 'count' }
	return [
		{ id: 'cpu', label: t('Processor'), value: cpu, unit: 'percent' },
		{ id: 'memory', label: t('Memory'), value: memory, unit: 'bytes' },
		{ id: 'rx', label: t('Received'), value: sum(['network/rx']), unit: 'bytes_per_second' },
		{ id: 'tx', label: t('Sent'), value: sum(['network/tx']), unit: 'bytes_per_second' },
		{ id: 'disk', label: t('Disk'), value: sum(['disk/read', 'disk/write']), unit: 'bytes_per_second' },
		last,
	].map(f => ({ id: f.id, label: f.label, text: f.value === null ? '-' : formatValue(f.value, f.unit, locale) }))
}

export function tableRows(chart, locale) {
	return chart.series.filter(s => !s.key.endsWith('#max')).map((s) => {
		const pick = field => s.cleaned.map(p => p[field]).filter(v => v !== null)
		const avgs = pick('avg')
		const show = v => formatValue(v, chart.unit, locale)
		if (avgs.length === 0) {
			return { name: s.label, last: '-', min: '-', avg: '-', max: '-' }
		}
		const mins = pick('min')
		const maxs = pick('max')
		return {
			name: s.label,
			last: show(s.cleaned.at(-1)?.avg ?? null),
			min: show(Math.min(...(mins.length > 0 ? mins : avgs))),
			avg: show(avgs.reduce((a, b) => a + b, 0) / avgs.length),
			max: show(Math.max(...(maxs.length > 0 ? maxs : avgs))),
		}
	})
}
