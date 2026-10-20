// Pure formatting of what the services measure. A value that cannot be shown honestly is '-', never NaN, Infinity or 0.
const MAX = 1e18
const BYTES_EN = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
const BYTES_FR = ['o', 'Ko', 'Mo', 'Go', 'To', 'Po']
const NNBSP = ' '

// Language-file keys used by formatDuration (Task 12 checks them).
export const FORMAT_KEYS = ['{days} d', '{hours} h {minutes} min', '{minutes} min', '{seconds} s']

const isShowable = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX
const isFrench = locale => typeof locale === 'string' && /^fr/i.test(locale)

function numberFormat(locale, options) {
	try {
		return new Intl.NumberFormat(locale, options)
	} catch {
		return new Intl.NumberFormat('en', options)
	}
}

// One decimal below 10, none above.
function plain(value, locale) {
	return numberFormat(locale, { maximumFractionDigits: value < 9.95 ? 1 : 0 }).format(value)
}

function scaled(value, locale) {
	const names = isFrench(locale) ? BYTES_FR : BYTES_EN
	let n = value
	let i = 0
	while (i < names.length - 1 && Math.round(n) >= 1024) {
		n /= 1024
		i++
	}
	return `${plain(n, locale)} ${names[i]}`
}

export function formatValue(value, unit, locale) {
	if (!isShowable(value)) {
		return '-'
	}
	switch (unit) {
		case 'bytes':
			return scaled(value, locale)
		case 'bytes_per_second':
			return `${scaled(value, locale)}/s`
		case 'percent':
			return `${plain(value, locale)}${isFrench(locale) ? NNBSP : ''}%`
		case 'packets_per_second':
			return `${plain(value, locale)} pkt/s`
		case 'ops_per_second':
			return `${plain(value, locale)} ops/s`
		default: // count, flag (a fixed alias of the boolean unit) and any unit we do not know
			return plain(value, locale)
	}
}

export function formatDuration(seconds, t) {
	if (!isShowable(seconds)) {
		return '-'
	}
	const s = Math.floor(seconds)
	if (s >= 86400) {
		return t('{days} d', { days: Math.floor(s / 86400) })
	}
	if (s >= 3600) {
		return t('{hours} h {minutes} min', { hours: Math.floor(s / 3600), minutes: String(Math.floor((s % 3600) / 60)).padStart(2, '0') })
	}
	if (s >= 60) {
		return t('{minutes} min', { minutes: Math.floor(s / 60) })
	}
	return t('{seconds} s', { seconds: s })
}

export function localeTag(i18nLocale) {
	if (typeof i18nLocale !== 'string') {
		return 'en'
	}
	const [lang, region] = i18nLocale.split(/[_-]/)
	if (!/^[a-z]{2,3}$/i.test(lang || '')) {
		return 'en'
	}
	const tag = region && /^[a-z]{2}$/i.test(region) ? `${lang.toLowerCase()}-${region.toUpperCase()}` : lang.toLowerCase()
	return Intl.NumberFormat.supportedLocalesOf(tag).length > 0 ? tag : 'en'
}

function dateFormat(locale, options) {
	try {
		return new Intl.DateTimeFormat(locale, options)
	} catch {
		return new Intl.DateTimeFormat('en', options)
	}
}

export function formatTime(epochSeconds, rangeId, locale) {
	const date = typeof epochSeconds === 'number' ? new Date(epochSeconds * 1000) : new Date(Number.NaN)
	if (Number.isNaN(date.getTime())) {
		return '-'
	}
	const long = rangeId === '24h' || rangeId === '7d'
	return dateFormat(locale, long ? { weekday: 'short', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' }).format(date)
}

export function formatDateTime(value, locale) {
	let ms = Number.NaN
	if (typeof value === 'string' && value !== '') {
		ms = Date.parse(value)
	} else if (typeof value === 'number') {
		ms = value * 1000
	}
	const date = new Date(ms)
	if (Number.isNaN(date.getTime())) {
		return '-'
	}
	return dateFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
