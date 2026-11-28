import { CARD_ICONS, CARD_ICON_FALLBACK } from '@/components/moduleCards/moduleCards'
import { renderSize } from '@/mixins/file_utils'

/**
 * The card of an API widget (/v1/sys/widgets/:id/card), made into what the card component draws. The core has cut and cleaned every text; the
 * numbers come bare and are written here, in the reader's language. Nothing of a card is ever markup: every value is a text, the icon is a
 * name of the dashboard's own list and the link an http(s) address.
 */

const MISSING = '—'
const LEVELS = ['ok', 'info', 'warning', 'danger']
const REFRESH_DEFAULT = 300

/** The key of a widget in the dashboard's settings (widgets_config). */
export const widgetKey = id => `custom:${id}`

// Intl's formatter for a vue-i18n locale such as fr_fr; English when Intl does not know the language
function intl(Format, locale, options) {
	try {
		return new Format(String(locale).replace('_', '-'), options)
	} catch {
		return new Format('en', options)
	}
}

const DURATION = [['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]]

// the largest unit that is not zero, and the next one when it is not zero either: "1 day 1 hr", "3 days"
function duration(seconds, locale) {
	let rest = Math.round(Math.abs(seconds))
	const parts = DURATION.map(([unit, size]) => {
		const count = Math.floor(rest / size)
		rest -= count * size
		return [unit, count]
	})
	// nothing at all is "0 sec"
	const first = (parts.findIndex(part => part[1] > 0) + parts.length) % parts.length
	const shown = parts.slice(first, first + 2).filter((part, index) => index === 0 || part[1] > 0)
	const text = shown.map(([unit, count]) => intl(Intl.NumberFormat, locale, { style: 'unit', unit, unitDisplay: 'short' }).format(count)).join(' ')
	return seconds < 0 && shown[0][1] > 0 ? `-${text}` : text
}

const AGO = [['year', 31536000], ['month', 2592000], ...DURATION]

// how long ago, or in how long: a date may be ahead (the end of a certificate)
function relative(unixSeconds, locale, now) {
	const seconds = Math.round(unixSeconds - now / 1000)
	const [unit, size] = AGO.find(entry => Math.abs(seconds) >= entry[1]) || AGO.at(-1)
	return intl(Intl.RelativeTimeFormat, locale, { numeric: 'auto' }).format(Math.trunc(seconds / size), unit)
}

// the dashboard's own sizes; it knows neither a part of a byte nor a size below zero
function bytes(number) {
	const whole = Math.round(Math.abs(number))
	return (number < 0 && whole > 0 ? '-' : '') + renderSize(whole)
}

/**
 * A value of the core ({ kind, text, number, unit }) as the text to show. `translate` is the page's $t.
 * The unit goes after a number and a text, which have none of their own.
 */
export function showValue(shown, locale, translate, now = Date.now()) {
	const kind = shown?.kind
	const unit = typeof shown?.unit === 'string' && shown.unit ? ` ${shown.unit}` : ''
	if (kind === 'text')
		return typeof shown.text === 'string' && shown.text ? shown.text + unit : MISSING
	const number = shown?.number
	if (typeof number !== 'number' || !Number.isFinite(number))
		return MISSING
	switch (kind) {
		case 'number':
			return intl(Intl.NumberFormat, locale).format(number) + unit
		case 'bytes':
			return bytes(number)
		case 'percent':
			return intl(Intl.NumberFormat, locale, { style: 'percent', maximumFractionDigits: 1 }).format(number / 100)
		case 'duration':
			return duration(number, locale)
		case 'date':
			return relative(number, locale, now)
	}
	return MISSING
}

const level = value => LEVELS.includes(value) ? value : ''

function linkOf(value, translate) {
	try {
		const url = new URL(typeof value === 'string' ? value : '')
		return ['http:', 'https:'].includes(url.protocol) ? { label: translate('Open'), url: url.href } : null
	} catch {
		return null
	}
}

/**
 * What the card component draws for a card of the core: the view of a module's card (cardView), with `layout` (rows | figures), `more` (the
 * rows left out) and a `bar` (0 to 100, or null) on each row. Null for a card whose read failed, which is shown as unavailable.
 */
export function widgetView(card, locale, translate) {
	if (card === null || typeof card !== 'object' || Array.isArray(card) || card.error)
		return null
	const text = shown => showValue(shown, locale, translate)
	return {
		title: typeof card.title === 'string' ? card.title : '',
		icon: CARD_ICONS.includes(card.icon) ? card.icon : CARD_ICON_FALLBACK,
		status: card.status ? { level: level(card.status.level) || 'info', text: text(card.status.value) } : null,
		rows: (Array.isArray(card.rows) ? card.rows : []).map(row => ({
			label: typeof row?.label === 'string' ? row.label : '',
			value: text(row?.value),
			level: level(row?.level),
			bar: typeof row?.bar === 'number' && Number.isFinite(row.bar) ? Math.min(100, Math.max(0, Math.round(row.bar))) : null,
			action: null,
		})),
		actions: [],
		link: linkOf(card.link, translate),
		layout: card.layout === 'figures' ? 'figures' : 'rows',
		more: Number.isInteger(card.more) && card.more > 0 ? card.more : 0,
		refresh: Number.isInteger(card.refresh) && card.refresh >= 60 && card.refresh <= 3600 ? card.refresh : REFRESH_DEFAULT,
	}
}
