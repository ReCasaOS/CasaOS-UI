import escape from 'lodash/escape'
import unescape from 'lodash/unescape'
import { describe, expect, it } from 'vitest'
import { CONTAINER_SERIES, HOSTILE, HOST_SERIES, VM_SERIES, aSeries, anItem } from './__fixtures__/contract'
import { GROUPS, STATS_KEYS, buildCharts, chartCaption, chartOptions, cleanSeries, figures, groupItems, listNotes, normalizeItems, noteText, scaleMax, tableRows } from './statsData'
import { clean } from '@/components/settings/osPlan'

const t = (key, p = {}) => key.replaceAll(/\{(\w+)\}/g, (_, k) => p[k])
// a Series response with the given lines: [chart, name, unit, points]
const resp = (lines, over = {}) => aSeries({ series: lines.map(([chart, name, unit, points]) => ({ chart, name, unit, points })), ...over })
const pts = (values, step = 5, from = 1000) => values.map((v, i) => [from + (i * step), v, v, v])
const find = (charts, id) => charts.find(c => c.id === id)

describe('normalizeItems', () => {
	it('keeps the contract kinds and ignores the service\'s group text', () => {
		const items = normalizeItems({ items: [anItem({ kind: 'vm', group: 'ANYTHING' })] }, 'virt_management')
		const groups = groupItems(items)
		expect(groups.map(g => g.id)).toEqual(['vms'])
		expect(items[0].source).toBe('virt_management')
	})

	it('turns hostile text into plain text', () => {
		const [a] = normalizeItems({ items: [anItem({ name: `${HOSTILE}‮`, detail: HOSTILE })] }, 'core')
		expect(a.name).toBe(clean(HOSTILE, 80))
		expect(a.detail).toBe(clean(HOSTILE, 200))
		expect([...a.name].every(c => c.codePointAt(0) > 31 && c.codePointAt(0) !== 0x202E)).toBe(true)
		expect(normalizeItems({ items: [anItem({ name: 'x'.repeat(600), detail: 'd'.repeat(600) })] }, 'core')[0]).toMatchObject({ name: 'x'.repeat(80), detail: 'd'.repeat(200) })
	})

	it('drops bad ids and bad kinds, bounds the count, cleans the numbers', () => {
		const bad = ['', 42, 'i'.repeat(301)].map(id => anItem({ id }))
		expect(normalizeItems({ items: [...bad, anItem({ kind: 'nope' })] }, 'core')).toEqual([])
		const many = Array.from({ length: 501 }, (_, i) => anItem({ id: `c${i}` }))
		expect(normalizeItems({ items: many }, 'core')).toHaveLength(500)
		const [x] = normalizeItems({ items: [anItem({ state: '<x>', cpu_percent: Number.NaN, alerts: -3, memory_used: -1, started_at: 'garbage' })] }, 'core')
		expect(x).toMatchObject({ state: 'unknown', cpu_percent: null, alerts: 0, memory_used: null, started_at: null })
		expect(normalizeItems({ items: [anItem({ started_at: '2026-10-19T08:00:00Z' })] }, 'core')[0].started_at).toBe('2026-10-19T08:00:00Z')
	})

	it.each([null, undefined, 'x', [], {}, { items: 'x' }])('gives [] for %j', (raw) => {
		expect(normalizeItems(raw, 'core')).toEqual([])
	})

	it('listNotes keeps at most 5 cleaned codes', () => {
		expect(listNotes({ notes: Array.from({ length: 9 }, (_, i) => `n${i}`) })).toHaveLength(5)
		expect(listNotes({ notes: [HOSTILE, 3] })).toEqual([clean(HOSTILE, 60)])
		expect(listNotes(null)).toEqual([])
	})

	it('groups in order, sorts by name, omits the empty ones', () => {
		const items = normalizeItems({ items: [anItem({ id: 'b', name: 'b' }), anItem({ id: 'a', name: 'a' }), anItem({ id: 'h', kind: 'host', name: 'h' })] }, 'x')
		const groups = groupItems(items)
		expect(groups.map(g => g.id)).toEqual(['containers', 'host'])
		expect(groups[0].items.map(i => i.name)).toEqual(['a', 'b'])
		expect(GROUPS.map(g => g.id)).toEqual(['containers', 'other', 'vms', 'host'])
	})
})

describe('cleanSeries is gap-safe', () => {
	it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1e300, '5', undefined])('turns %j into a gap', (v) => {
		const { points } = cleanSeries([[10, v, v, v]], { stepSeconds: 5 })
		expect(points).toEqual([{ t: 10, avg: null, min: null, max: null }])
	})

	it('drops a bad timestamp, sorts, keeps the last of equal timestamps', () => {
		const { points } = cleanSeries([[20, 2, 2, 2], [Number.NaN, 9, 9, 9], [10, 1, 1, 1], [20, 3, 3, 3]], { stepSeconds: 10 })
		expect(points.map(p => [p.t, p.avg])).toEqual([[10, 1], [20, 3]])
	})

	it('falls back to avg for min and max only when avg is a number', () => {
		const { points } = cleanSeries([[10, 4, 'x', null], [15, null, 3, 3]], { stepSeconds: 5 })
		expect(points[0]).toMatchObject({ avg: 4, min: 4, max: 4 })
		expect(points[1].avg).toBeNull()
	})

	it('inserts a null between points more than 1.5 steps apart, bounded', () => {
		const { points } = cleanSeries([[0, 1, 1, 1], [50, 2, 2, 2]], { stepSeconds: 5 })
		expect(points.map(p => p.avg)).toEqual([1, null, 2])
		const hostile = Array.from({ length: 5000 }, (_, i) => [i * 1e9, 1, 1, 1])
		const out = cleanSeries(hostile, { stepSeconds: 5 }).points
		expect(out.length - 5000).toBeLessThanOrEqual(2000)
	})
})

describe('buildCharts', () => {
	it('draws a gap, never a zero', () => {
		const charts = buildCharts(resp([['network', 'rx:eth0', 'bytes_per_second', pts([1, null, 3])]]), { t })
		expect(find(charts, 'network').series[0].points.map(p => p.y)).toEqual([1, null, 3])
	})

	it('stack rule: a gap in one component is a gap in all of them', () => {
		const charts = buildCharts(resp([
			['cpu', 'user', 'percent', pts([1, 2, null, 4])],
			['cpu', 'system', 'percent', pts([5, 5, 5, 5])],
		]), { t })
		const cpu = find(charts, 'cpu')
		for (const s of cpu.series.filter(x => x.kind !== 'ref')) {
			expect(s.points.map(p => p.y)[2]).toBeNull()
		}
		expect(cpu.series.find(s => s.key === 'cpu/system').points.map(p => p.y)).toEqual([5, 5, null, 5])
	})

	it('omits charts without data and marks all-null as empty', () => {
		const ids = buildCharts(aSeries({ series: HOST_SERIES }), { kind: 'host', t }).map(c => c.id)
		expect(ids).not.toContain('pids')
		expect(ids).toContain('fs')
		const charts = buildCharts(resp([['disk', 'read', 'bytes_per_second', pts([null, null])]]), { t })
		expect(find(charts, 'disk').empty).toBe(true)
		expect(find(buildCharts(aSeries(), { t }), 'cpu').empty).toBe(false)
	})

	it('escapes names', () => {
		const charts = buildCharts(resp([['network', 'rx:eth0<img src=x onerror=1>', 'bytes_per_second', pts([1, 2])]]), { t })
		const s = find(charts, 'network').series[0]
		expect(s.name).not.toContain('<')
		expect(s.label).toContain('<img')
		expect(s.name).toBe(escape(s.label))
		expect(s.name).toContain('&lt;img')
		expect(s.name).not.toContain('<')
		expect(unescape(s.name)).toBe(s.label)
		expect(s.name.startsWith('Received · ')).toBe(true)
	})

	it('escapes hostile text in names even for the first character', () => {
		const charts = buildCharts(resp([['disk', 'read:<b>x</b>', 'bytes_per_second', pts([1])]]), { t })
		expect(JSON.stringify(find(charts, 'disk').series.map(s => s.name))).not.toMatch(/<b>/)
	})

	it('hides legend-toggled series but keeps the colour of the others', () => {
		const full = find(buildCharts(aSeries(), { t }), 'cpu').series
		const some = find(buildCharts(aSeries(), { t, hidden: new Set(['cpu/system']) }), 'cpu').series
		expect(some.find(s => s.key === 'cpu/system')).toBeUndefined()
		expect(some.find(s => s.key === 'cpu/iowait').color).toBe(full.find(s => s.key === 'cpu/iowait').color)
	})

	it('adds the max companions on 24h and 7d only', () => {
		const hasMax = range => find(buildCharts(aSeries(), { t, range }), 'network').series.some(s => s.key.endsWith('#max'))
		expect(hasMax('live')).toBe(false)
		expect(hasMax('1h')).toBe(false)
		expect(hasMax('24h')).toBe(true)
		expect(hasMax('7d')).toBe(true)
		const m = find(buildCharts(aSeries(), { t, range: '7d' }), 'network').series.find(s => s.key === 'network/rx:eth0#max')
		expect(m.kind).toBe('line')
		expect(m.label).toBe('Received · eth0 (max)')
	})

	it('draws the processor reference line', () => {
		const user = ['cpu', 'user', 'percent', pts([1, 2])]
		const ref = (response, kind) => find(buildCharts(response, { t, kind }), 'cpu').series.find(s => s.kind === 'ref')
		const c = ref(resp([user], { scale: { cpu_allocation: 1.5, memory_limit: null }, notes: [] }), 'app-container')
		expect(c.name).toBe('Processor limit')
		expect(c.points.map(p => p.y)).toEqual([150, 150])
		expect(ref(resp([user], { scale: { cpu_allocation: 1.5 }, notes: ['no_cpu_limit'] }), 'app-container')).toBeUndefined()
		expect(ref(resp([user], { scale: { cpu_allocation: Number.NaN }, notes: [] }), 'app-container')).toBeUndefined()
		const vm = ref(resp([['cpu', 'total', 'percent', pts([1])], ['cpu', 'vcpus', 'count', pts([4])]]), 'vm')
		expect(vm.name).toBe('Capacity of the virtual processors')
		expect(vm.points[0].y).toBe(400)
		const host = ref(resp([['cpu', 'total', 'percent', pts([1])], ['cpu', 'vcpus', 'count', pts([8])]]), 'host')
		expect(host.name).toBe('Processor limit')
		expect(host.points[0].y).toBe(800)
	})

	it('works on the three contract fixtures', () => {
		for (const [series, kind] of [[CONTAINER_SERIES, 'app-container'], [VM_SERIES, 'vm'], [HOST_SERIES, 'host']]) {
			const charts = buildCharts(aSeries({ series }), { kind, t })
			expect(charts.length).toBeGreaterThan(3)
			expect(JSON.stringify(charts)).not.toMatch(/NaN|Infinity/)
		}
	})

	it.each([null, 'x', {}, { series: 'x' }])('gives [] for %j', (response) => {
		expect(buildCharts(response, { t })).toEqual([])
	})
})

describe('chartOptions', () => {
	const charts = buildCharts(aSeries(), { t })
	const scale = { cpu_allocation: 2, memory_limit: 1073741824 }

	it('has no group, an id per chart, and formats with the formatters', () => {
		const net = find(charts, 'network')
		const cpu = find(charts, 'cpu')
		const a = chartOptions(net, { locale: 'en', range: 'live', height: 200, scale })
		const b = chartOptions(cpu, { locale: 'en', range: 'live', height: 200, scale })
		expect(a.chart.group).toBeUndefined()
		expect(a.chart.id).toBe('stats-network')
		expect(a.chart.stacked).toBe(false)
		expect(b.chart.stacked).toBe(true)
		expect(a.chart.toolbar.show).toBe(false)
		expect(a.legend.show).toBe(false)
		expect(a.stroke.curve).toBe('straight')
		expect(a.xaxis.type).toBe('datetime')
		expect(a.yaxis.min).toBe(0)
		expect(b.yaxis.max).toBe(scaleMax(cpu, scale))
		const mem = chartOptions(find(charts, 'memory'), { locale: 'en', scale })
		expect(mem.yaxis.labels.formatter(1536)).toBe('1.5 KB')
		expect(typeof a.tooltip.x.formatter).toBe('function')
		expect(a.tooltip.shared).toBe(true)
	})

	it('takes the zoom, and holds no string with markup', () => {
		const o = chartOptions(find(charts, 'cpu'), { zoom: { min: 1, max: 2 }, scale })
		expect([o.xaxis.min, o.xaxis.max]).toEqual([1, 2])
		expect(chartOptions(find(charts, 'cpu'), { group: 'g' }).xaxis.min).toBeNull()
		expect(JSON.stringify(o)).not.toContain('<')
	})
})

describe('scaleMax', () => {
	const chart = (id, ys, stacked = false) => ({ id, stacked, series: [{ key: `${id}/a`, kind: 'area', points: ys.map((y, x) => ({ x, y })) }] })
	it.each([
		['cpu', [480], { cpu_allocation: 4 }, 528],
		['cpu', [120], { cpu_allocation: 4 }, 440],
		['cpu', [50], { cpu_allocation: Number.NaN }, 55],
		['memory', [100], { memory_limit: 1000 }, 1100],
		['memory', [2000], { memory_limit: null }, 2200],
		['cpu', [Number.NaN, null], {}, undefined],
		['cpu', [], undefined, undefined],
	])('%s %j with %j gives %j', (id, ys, scale, expected) => {
		const got = scaleMax(chart(id, ys), scale)
		if (expected === undefined) {
			expect(got).toBeUndefined()
		} else {
			expect(got).toBeCloseTo(expected)
		}
	})

	it('sums a stacked chart', () => {
		expect(scaleMax({ id: 'cpu', stacked: true, series: [{ key: 'a', kind: 'area', points: [{ x: 1, y: 10 }] }, { key: 'b', kind: 'area', points: [{ x: 1, y: 20 }] }] }, {})).toBeCloseTo(33)
	})
})

describe('noteText', () => {
	it('has its own sentence for the five known codes', () => {
		const texts = ['vm_memory_used_unavailable', 'no_cpu_limit', 'no_memory_limit', 'container_gone', 'stats_capacity'].map(c => noteText(c, t))
		expect(new Set(texts).size).toBe(5)
		for (const text of texts) {
			expect(text).not.toContain('Note from the service')
		}
	})

	it('says an unknown code as text', () => {
		expect(noteText('<b>x</b>', t)).toBe('Note from the service: <b>x</b>')
		expect(noteText('__proto__', t)).toBe('Note from the service: __proto__')
		expect(noteText(5, t)).toBe('Note from the service: ')
	})
})

describe('chartCaption', () => {
	it('says the scale', () => {
		expect(chartCaption({ id: 'cpu' }, { cpu_allocation: 4 }, [], t)).toBe('% of one core · 4 cores allocated')
		expect(chartCaption({ id: 'cpu' }, { cpu_allocation: 4 }, ['no_cpu_limit'], t)).toBe('% of one core · no limit set')
		expect(chartCaption({ id: 'memory' }, { memory_limit: 4 * 1024 ** 3 }, [], t, 'en')).toBe('on 4 GB allowed')
		expect(chartCaption({ id: 'disk' }, {}, [], t)).toBe('')
	})
})

describe('figures', () => {
	const item = { kind: 'app-container' }
	const text = (list, id) => list.find(f => f.id === id).text

	it('has six figures, and shows a stale last point as a hyphen', () => {
		const fresh = figures(aSeries(), item, 'en', t)
		expect(fresh.map(f => f.id)).toEqual(['cpu', 'memory', 'rx', 'tx', 'disk', 'processes'])
		expect(text(fresh, 'rx')).not.toBe('-')
		const old = pts([5, 5], 5, 1000)
		const stale = figures(resp([['network', 'rx:eth0', 'bytes_per_second', old]], { to: 1000 + 5 + 16, step_seconds: 5 }), item, 'en', t)
		expect(text(stale, 'rx')).toBe('-')
		const ok = figures(resp([['network', 'rx:eth0', 'bytes_per_second', old]], { to: 1000 + 5 + 15, step_seconds: 5 }), item, 'en', t)
		expect(text(ok, 'rx')).toBe('5 B/s')
	})

	it('sums the instances', () => {
		const list = figures(resp([['network', 'rx:a', 'bytes_per_second', pts([1, 2])], ['network', 'rx:b', 'bytes_per_second', pts([3, 4])]], { to: 1005 }), item, 'en', t)
		expect(text(list, 'rx')).toBe('6 B/s')
	})

	it('a VM shows memory/assigned when memory/used is missing, and vcpus last', () => {
		const response = resp([['memory', 'assigned', 'bytes', pts([2048, 2048])], ['cpu', 'vcpus', 'count', pts([2, 2])]], { to: 1005 })
		const list = figures(response, { kind: 'vm' }, 'en', t)
		expect(text(list, 'memory')).toBe('2 KB')
		expect(list.at(-1).id).toBe('vcpus')
		expect(text(list, 'vcpus')).toBe('2')
	})

	it('shows a hyphen when the response has no to or step_seconds', () => {
		const r = resp([['network', 'rx:eth0', 'bytes_per_second', pts([5, 5])]], { to: undefined })
		expect(text(figures(r, item, 'en', t), 'rx')).toBe('-')
		expect(text(figures({ ...r, to: 1005, step_seconds: undefined }, item, 'en', t), 'rx')).toBe('-')
	})

	it('the processor of a container adds user, system and iowait', () => {
		const r = resp([['cpu', 'user', 'percent', pts([1, 1])], ['cpu', 'system', 'percent', pts([2, 2])], ['cpu', 'iowait', 'percent', pts([4, 4])]], { to: 1005 })
		expect(text(figures(r, item, 'en', t), 'cpu')).toBe('7%')
	})

	it('gives hyphens for nothing', () => {
		expect(figures(null, item, 'en', t).every(f => f.text === '-')).toBe(true)
	})
})

describe('tableRows', () => {
	it('gives last, min, average and max, and hyphens for all-null', () => {
		const response = resp([['disk', 'read', 'bytes_per_second', [[1000, 2, 1, 4], [1005, 4, 3, 8]]], ['disk', 'write', 'bytes_per_second', pts([null, null])]])
		const rows = tableRows(find(buildCharts(response, { t }), 'disk'), 'en')
		expect(rows[0]).toEqual({ name: 'Read', last: '4 B/s', min: '1 B/s', avg: '3 B/s', max: '8 B/s' })
		expect(rows[1]).toEqual({ name: 'Write', last: '-', min: '-', avg: '-', max: '-' })
	})

	it('shows a hyphen as last after a trailing gap', () => {
		const response = resp([['disk', 'read', 'bytes_per_second', pts([4, 6, null])]])
		const [row] = tableRows(find(buildCharts(response, { t }), 'disk'), 'en')
		expect(row.last).toBe('-')
		expect(row.max).toBe('6 B/s')
	})
})

describe('stats keys', () => {
	it('is a list of unique strings', () => {
		expect(STATS_KEYS.every(k => typeof k === 'string')).toBe(true)
		expect(new Set(STATS_KEYS).size).toBe(STATS_KEYS.length)
	})
})

describe('the fixes of the final review', () => {
	it('draws no allocation term in the scale when the processor has no limit', () => {
		const cpu = { id: 'cpu', stacked: false, noteCodes: ['no_cpu_limit'], series: [{ key: 'cpu/total', kind: 'area', points: [{ x: 1, y: 10 }] }] }
		expect(scaleMax(cpu, { cpu_allocation: 8 })).toBeCloseTo(11)
		expect(scaleMax({ ...cpu, noteCodes: [] }, { cpu_allocation: 8 })).toBeCloseTo(880)
	})

	it('gives every interface its own colour, received and sent apart', () => {
		const lines = ['eth0', 'eth1', 'eth2'].flatMap(n => [['network', `rx:${n}`, 'bytes_per_second', pts([1, 2])], ['network', `tx:${n}`, 'bytes_per_second', pts([1, 2])]])
		const colors = find(buildCharts(resp(lines), { t }), 'network').series.map(s => s.color)
		expect(colors).toHaveLength(6)
		expect(new Set(colors).size).toBe(6)
	})

	it('writes the allocated cores with the locale', () => {
		const fr = (key, p = {}) => key.replaceAll(/\{(\w+)\}/g, (_, k) => p[k])
		expect(chartCaption({ id: 'cpu' }, { cpu_allocation: 0.5 }, [], fr, 'fr')).toBe('% of one core · 0,5 cores allocated')
		expect(chartCaption({ id: 'cpu' }, { cpu_allocation: 0.5 }, [], fr, 'en')).toBe('% of one core · 0.5 cores allocated')
	})

	it('puts the time on local ticks', () => {
		expect(chartOptions({ id: 'cpu', unit: 'percent', stacked: false, series: [] }, {}).xaxis.labels.datetimeUTC).toBe(false)
	})
})
