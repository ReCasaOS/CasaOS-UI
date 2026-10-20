import { describe, expect, it } from 'vitest'
import { formatDateTime, formatDuration, formatTime, formatValue, localeTag } from './statsFormat'

const NNBSP = ' '

describe('formatValue', () => {
	it.each([
		[0, 'bytes', 'en', '0 B'],
		[1536, 'bytes', 'en', '1.5 KB'],
		[1288490188, 'bytes', 'fr-FR', '1,2 Go'],
		[4300000, 'bytes_per_second', 'fr-FR', '4,1 Mo/s'],
		[4300000, 'bytes_per_second', 'en', '4.1 MB/s'],
		[200 * 1024, 'bytes', 'en', '200 KB'],
		[38.4, 'percent', 'fr-FR', `38${NNBSP}%`],
		[38.4, 'percent', 'en', '38%'],
		[1500, 'percent', 'en', '1,500%'],
		[1, 'flag', 'en', '1'],
		[0, 'flag', 'en', '0'],
		[2.5, 'count', 'en', '2.5'],
		[2.5, 'zzz', 'en', '2.5'],
		[3, 'packets_per_second', 'en', '3 pkt/s'],
		[3, 'ops_per_second', 'en', '3 ops/s'],
	])('formats %j as %s (%s)', (value, unit, locale, text) => {
		expect(formatValue(value, unit, locale)).toBe(text)
	})

	it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, -0.0001, 1e300, 2e18, '12', null, undefined, {}])('gives a hyphen for %j', (value) => {
		for (const unit of ['bytes', 'bytes_per_second', 'percent', 'count', 'flag', 'zzz']) {
			expect(formatValue(value, unit, 'en')).toBe('-')
		}
	})

	it('never writes an exponent and survives a bad locale', () => {
		expect(formatValue(1e18, 'count', 'en')).not.toMatch(/e/i)
		expect(formatValue(1e18, 'bytes', 'en')).not.toMatch(/e\+/i)
		expect(formatValue(1, 'bytes', 'not a locale!!')).toBe('1 B')
	})
})

describe('formatDuration', () => {
	const t = (key, p = {}) => key.replaceAll(/\{(\w+)\}/g, (_, k) => p[k])
	it.each([
		[(12 * 86400) + 5, '12 d'],
		[(3 * 3600) + (5 * 60), '3 h 05 min'],
		[90, '1 min'],
		[7, '7 s'],
		[Number.NaN, '-'],
		[-5, '-'],
		['x', '-'],
	])('%j gives %s', (seconds, text) => {
		expect(formatDuration(seconds, t)).toBe(text)
	})
})

describe('formatTime', () => {
	it('gives hour and minute for short ranges and a weekday for long ones', () => {
		const t0 = 1760000000
		expect(formatTime(t0, 'live', 'en')).toMatch(/\d{1,2}:\d{2}/)
		expect(formatTime(t0, '7d', 'en')).toMatch(/[a-z]{3}/i)
		expect(formatTime(Number.NaN, 'live', 'en')).toBe('-')
	})
})

describe('localeTag', () => {
	it.each([
		['fr_fr', 'fr-FR'],
		['en_us', 'en-US'],
		['zz_zz', 'en'],
		['', 'en'],
		[undefined, 'en'],
		['<b>', 'en'],
	])('%j becomes %s', (input, tag) => {
		expect(localeTag(input)).toBe(tag)
	})
})

describe('formatDateTime', () => {
	it('formats RFC 3339 and epoch seconds', () => {
		expect(formatDateTime('2026-10-20T10:00:00Z', 'en')).toContain('2026')
		expect(formatDateTime(1760000000, 'en')).toContain('2025')
	})
	it.each(['garbage', null, undefined, '', Number.NaN, 1e300, {}])('gives a hyphen for %j', (value) => {
		expect(formatDateTime(value, 'en')).toBe('-')
	})
})
