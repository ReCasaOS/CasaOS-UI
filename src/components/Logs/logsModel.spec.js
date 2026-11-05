import { describe, expect, it } from 'vitest'
import { MAX_LINES, colorOf, insertRows, levelOf, parseQuery, rangeBounds, skippedMarker, toRow } from './logsModel'

const line = (at, text = 'hi', extra = {}) => ({ at, app: 'jf', service: 'web', container: 'jf-web', stream: 'o', text, ...extra })
const row = (at, text) => toRow(line(`2026-11-05T${at}:00Z`, text))

describe('logsModel', () => {
	it('turns a line into a row, with its level and parsed JSON', () => {
		const r = toRow(line('2026-11-05T10:00:00.123456789Z', ' {"a":1}', { stream: 'e' }))
		expect(r).toMatchObject({ kind: 'line', app: 'jf', service: 'web', container: 'jf-web', stream: 'e', level: 'warn', json: { a: 1 } })
		expect(r.at).toBeInstanceOf(Date)
		expect(r.key).toMatch(/^jf\/web\/jf-web\/2026-11-05T10:00:00.123456789Z\/[0-9a-z]+$/)
		expect(toRow(line('2026-11-05T10:00:00Z', '{oops')).json).toBeNull()
		expect(toRow(line('2026-11-05T10:00:00Z', 'plain')).json).toBeNull()
	})

	it('turns an event into a row with a sentence', () => {
		const r = toRow({ at: '2026-11-05T10:00:00Z', app: 'jellyfin', service: 'jellyfin', container: 'jellyfin', kind: 'died', exit_code: 137 })
		expect(r).toMatchObject({ kind: 'event', level: 'error', key: 'event/jellyfin/jellyfin/died/2026-11-05T10:00:00Z', text: 'jellyfin/jellyfin died, exit code 137' })
		expect(r.event.exit_code).toBe(137)
		expect(toRow({ at: '2026-11-05T10:00:00Z', app: 'a', service: 's', kind: 'stopped' }).level).toBe('warn')
		expect(toRow({ at: '2026-11-05T10:00:00Z', app: 'a', service: 's', kind: 'oom-killed' }).text).toBe('a/s oom killed')
		expect(toRow({ at: '2026-11-05T10:00:00Z', app: 'a', service: 's', kind: 'updated', from_image: 'x:1', to_image: 'x:2' })).toMatchObject({ level: 'info', text: 'a/s updated from x:1 to x:2' })
	})

	it('never throws on a malformed row', () => {
		expect(toRow({ at: 'garbage', text: 'x' }).at).toEqual(new Date(0))
		expect(toRow(null).kind).toBe('line')
		expect(toRow({ at: 'x', app: 'a', service: 's', kind: 'died' }).text).toBe('a/s died')
		expect(skippedMarker(2).key).toBe('marker/0/2')
		expect(colorOf(null)).toBe(0)
	})

	it('guesses levels like the server', () => {
		expect(levelOf('e', 'ok')).toBe('warn')
		expect(levelOf('o', 'ERROR x')).toBe('error')
		expect(levelOf('o', 'level=err_x')).toBe('error')
		expect(levelOf('o', 'Warning: y')).toBe('warn')
		expect(levelOf('o', 'terror')).toBe('info')
		expect(levelOf('e', 'panic: z')).toBe('error')
	})

	it('gives a stable hue in 0..11', () => {
		expect(colorOf('jf/web')).toBe(colorOf('jf/web'))
		expect(colorOf('jf/web')).toBeGreaterThanOrEqual(0)
		expect(colorOf('jf/web')).toBeLessThan(12)
	})

	it('keeps time order across two batches without mutating its inputs', () => {
		const first = insertRows([], [row('10:02'), row('10:00')])
		const before = [...first.buffer]
		const late = [row('10:01')]
		const second = insertRows(first.buffer, late, first.keys)
		expect(second.buffer.map(r => r.at.toISOString().slice(11, 16))).toEqual(['10:00', '10:01', '10:02'])
		expect(first.buffer).toEqual(before)
		expect(late).toHaveLength(1)
		expect(second.dropped).toBe(0)
	})

	it('updates the key set of the caller in place and returns it', () => {
		const keys = new Set()
		const { buffer, keys: same } = insertRows([], [row('10:00')], keys)
		expect(same).toBe(keys)
		expect([...keys]).toEqual([buffer[0].key])
		insertRows(buffer, [row('10:01')], keys)
		expect(keys.size).toBe(2)
	})

	it('appends a newer batch the same way the sort path would place it', () => {
		const base = insertRows([], [row('10:00'), row('10:01')]).buffer
		const batch = [row('10:01', 'tie'), row('10:02'), row('10:03')]
		const appended = insertRows(base, batch).buffer
		expect(appended.slice(0, 2)).toEqual(base)
		const sorted = insertRows(base, [...batch].reverse()).buffer
		expect(appended.map(r => r.key)).toEqual(sorted.map(r => r.key))
	})

	it('drops a row whose key is already there', () => {
		const { buffer, keys } = insertRows([], [row('10:00'), row('10:00')])
		expect(buffer).toHaveLength(1)
		expect(insertRows(buffer, [row('10:00'), row('10:01')], keys).buffer).toHaveLength(2)
		expect(insertRows(buffer, [row('10:00')]).buffer).toHaveLength(1)
	})

	it('trims to MAX_LINES from the front and says how many', () => {
		const rows = Array.from({ length: MAX_LINES + 3 }, (_, i) => toRow(line(new Date(Date.UTC(2026, 10, 5, 0, 0, 0, i)).toISOString(), `l${i}`)))
		const { buffer, keys, dropped } = insertRows([], rows)
		expect(dropped).toBe(3)
		expect(buffer).toHaveLength(MAX_LINES)
		expect(buffer[0].text).toBe('l3')
		expect(keys.has(rows[0].key)).toBe(false)
		expect(keys.size).toBe(MAX_LINES)
	})

	it('builds a skipped marker', () => {
		const at = new Date(1000)
		expect(skippedMarker(4, at)).toEqual({ kind: 'marker', key: 'marker/1000/4', at, n: 4, text: '4 lines skipped' })
		expect(skippedMarker(0, at).text).toBe('lines skipped')
	})

	it('reads the query, strings only', () => {
		expect(parseQuery({ query: { app: ['jf', 'x'], at: '2026', box: 3 } })).toEqual({ app: 'jf', at: '2026', box: '' })
		expect(parseQuery({})).toEqual({ app: '', at: '', box: '' })
	})

	it('turns a range into bounds', () => {
		const now = new Date('2026-11-05T12:00:00Z')
		expect(rangeBounds('live', now)).toEqual({ since: null, until: null })
		expect(rangeBounds('1h', now)).toEqual({ since: new Date(now.getTime() - 3600000), until: null })
		expect(rangeBounds('7d', now).since).toEqual(new Date(now.getTime() - 7 * 86400000))
		const since = new Date(0)
		expect(rangeBounds('custom', now, { since, until: null })).toEqual({ since, until: null })
	})
})
