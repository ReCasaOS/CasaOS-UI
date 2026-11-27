import { describe, expect, it } from 'vitest'
import { showValue, widgetKey, widgetView } from './format'
import { CARD_ICON_FALLBACK } from '@/components/moduleCards/moduleCards'

const t = key => ({ Open: 'Ouvrir' })[key] ?? key
const NOW = Date.UTC(2026, 10, 27, 12)
const ago = seconds => NOW / 1000 - seconds
const show = (shown, locale = 'en_us') => showValue(shown, locale, t, NOW)

describe('showValue', () => {
	it('writes a number with the separators of the language', () => {
		expect(show({ kind: 'number', number: 12840 }, 'fr_fr')).toMatch(/^12\s840$/)
		expect(show({ kind: 'number', number: 12840 })).toBe('12,840')
		expect(show({ kind: 'number', number: 1.5 }, 'fr_fr')).toBe('1,5')
	})

	it('writes bytes as the rest of the dashboard does', () => {
		expect(show({ kind: 'bytes', number: 84825604096 })).toBe('79 GB')
		expect(show({ kind: 'bytes', number: 0 })).toBe('0 Bytes')
		expect(show({ kind: 'bytes', number: 0.4 })).toBe('0 Bytes')
		expect(show({ kind: 'bytes', number: 1536.2 })).toBe('1.5 KB')
		expect(show({ kind: 'bytes', number: -2048 })).toBe('-2 KB')
		expect(show({ kind: 'bytes', number: 2 ** 70 })).toBe('1024 EB')
	})

	it('writes a percentage in the language, rounded', () => {
		expect(show({ kind: 'percent', number: 42 }, 'fr_fr')).toMatch(/^42\s%$/)
		expect(show({ kind: 'percent', number: 42 })).toBe('42%')
		expect(show({ kind: 'percent', number: 56.99999999999999 })).toBe('57%')
		expect(show({ kind: 'percent', number: 12.34 })).toBe('12.3%')
	})

	it('writes a duration with its two largest units', () => {
		expect(show({ kind: 'duration', number: 90061 })).toBe('1 day 1 hr')
		expect(show({ kind: 'duration', number: 90061 }, 'fr_fr')).toMatch(/^1\sj 1\sh$/)
		expect(show({ kind: 'duration', number: 86400 * 3 })).toBe('3 days')
		expect(show({ kind: 'duration', number: 125 })).toBe('2 min 5 sec')
		expect(show({ kind: 'duration', number: 0.2 })).toBe('0 sec')
		expect(show({ kind: 'duration', number: -125 })).toBe('-2 min 5 sec')
	})

	it('writes a date as how long ago, or in how long', () => {
		expect(show({ kind: 'date', number: ago(2 * 86400) })).toBe('2 days ago')
		expect(show({ kind: 'date', number: ago(2 * 86400) }, 'fr_fr')).toBe('avant-hier')
		expect(show({ kind: 'date', number: ago(3 * 86400) }, 'fr_fr')).toBe('il y a 3 jours')
		expect(show({ kind: 'date', number: ago(-3 * 3600) })).toBe('in 3 hours')
		expect(show({ kind: 'date', number: ago(90 * 86400) })).toBe('3 months ago')
		expect(show({ kind: 'date', number: ago(800 * 86400) })).toBe('2 years ago')
		expect(show({ kind: 'date', number: ago(5) })).toBe('5 seconds ago')
	})

	it('adds the unit to a number and to a text, and to nothing else', () => {
		expect(show({ kind: 'number', number: 12, unit: 'req/s' })).toBe('12 req/s')
		expect(show({ kind: 'text', text: '4.2', unit: '°C' })).toBe('4.2 °C')
		expect(show({ kind: 'text', text: '', unit: '°C' })).toBe('—')
		expect(show({ kind: 'percent', number: 42, unit: 'x' })).toBe('42%')
		expect(show({ kind: 'bytes', number: 1024, unit: 'x' })).toBe('1 KB')
		expect(show({ kind: 'missing', unit: 'x' })).toBe('—')
	})

	it('writes a text as it is, and a dash for what is missing or not understood', () => {
		expect(show({ kind: 'text', text: '<b>UP</b>' })).toBe('<b>UP</b>')
		expect(show({ kind: 'text' })).toBe('—')
		for (const shown of [{ kind: 'missing' }, { kind: 'number' }, { kind: 'number', number: '12' }, { kind: 'number', number: Number.NaN }, { kind: 'html', text: 'x' }, null, undefined, 'x'])
			expect(show(shown)).toBe('—')
	})

	it('falls back to English for a language Intl does not know', () => {
		expect(show({ kind: 'number', number: 12840 }, 'not a locale')).toBe('12,840')
		expect(show({ kind: 'date', number: ago(3600) }, '')).toBe('1 hour ago')
	})
})

describe('widgetView', () => {
	const card = {
		title: 'Immich',
		icon: 'media-outline',
		layout: 'figures',
		status: { value: { kind: 'text', text: 'UP' }, level: 'ok' },
		rows: [
			{ label: 'Photos', value: { kind: 'number', number: 12840 } },
			{ label: 'Disk', value: { kind: 'percent', number: 56.99999999999999 }, level: 'warning', bar: 56.99999999999999 },
			{ label: 'Gone', value: { kind: 'missing' }, level: 'is-danger" onclick="x' },
		],
		more: 2,
		link: 'http://192.168.1.10:2283',
		refresh: 3600,
	}

	it('makes the view the card component draws', () => {
		expect(widgetView(card, 'en_us', t)).toEqual({
			title: 'Immich',
			icon: 'media-outline',
			status: { level: 'ok', text: 'UP' },
			rows: [
				{ label: 'Photos', value: '12,840', level: '', bar: null, action: null },
				{ label: 'Disk', value: '57%', level: 'warning', bar: 57, action: null },
				{ label: 'Gone', value: '—', level: '', bar: null, action: null },
			],
			actions: [],
			link: { label: 'Ouvrir', url: 'http://192.168.1.10:2283/' },
			layout: 'figures',
			more: 2,
			refresh: 3600,
		})
	})

	it('gives no view for a card that failed, or for what is not a card', () => {
		expect(widgetView({ ...card, error: 'the address did not answer' }, 'en_us', t)).toBeNull()
		for (const raw of [null, undefined, 'x', [], 3])
			expect(widgetView(raw, 'en_us', t)).toBeNull()
	})

	it('links only to an http or https address', () => {
		for (const link of ['https://example.org/a?b=1', 'HTTP://example.org'])
			expect(widgetView({ ...card, link }, 'en_us', t).link.url).toBe(new URL(link).href)
		for (const link of ['javascript:alert(1)', 'data:text/html,x', 'ftp://example.org', '/relative', 'example.org', '', undefined, 3, { href: 'http://x' }])
			expect(widgetView({ ...card, link }, 'en_us', t).link).toBeNull()
	})

	it('takes an icon only from the list of the cards', () => {
		for (const icon of ['nope', '<i class="x">', '', undefined, 3, null])
			expect(widgetView({ ...card, icon }, 'en_us', t).icon).toBe(CARD_ICON_FALLBACK)
	})

	it('clamps a bar between 0 and 100', () => {
		const bars = [-3, 250, 49.5, '50', null, undefined, Number.NaN]
		const rows = bars.map(bar => ({ label: 'x', value: { kind: 'missing' }, bar }))
		expect(widgetView({ ...card, rows }, 'en_us', t).rows.map(row => row.bar)).toEqual([0, 100, 50, null, null, null, null])
	})

	it('reads a draft with nothing in it', () => {
		expect(widgetView({ title: 'Draft', layout: '', rows: [], more: 0, refresh: 0 }, 'en_us', t)).toEqual({
			title: 'Draft',
			icon: CARD_ICON_FALLBACK,
			status: null,
			rows: [],
			actions: [],
			link: null,
			layout: 'rows',
			more: 0,
			refresh: 300,
		})
		expect(widgetView({ rows: null, more: -1, refresh: 5, layout: 'grid', title: 3 }, 'en_us', t)).toMatchObject({ title: '', rows: [], more: 0, refresh: 300, layout: 'rows' })
	})

	it('gives a status without a level the neutral one', () => {
		expect(widgetView({ ...card, status: { value: { kind: 'missing' } } }, 'en_us', t).status).toEqual({ level: 'info', text: '—' })
		expect(widgetView({ ...card, status: { value: { kind: 'number', number: 3 }, level: 'nope' } }, 'en_us', t).status).toEqual({ level: 'info', text: '3' })
	})
})

describe('widgetKey', () => {
	it('is the key of a widget in the dashboard settings', () => {
		expect(widgetKey('ab12cd34')).toBe('custom:ab12cd34')
	})
})
