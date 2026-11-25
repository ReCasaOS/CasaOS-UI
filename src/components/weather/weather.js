// The dashboard's weather (CasaOS#188): what Open-Meteo's WMO weather codes look like and are called.
const KINDS = [
	{ codes: [0], icon: 'weather-sunny', night: 'weather-night', label: 'Clear sky' },
	{ codes: [1, 2], icon: 'weather-partly-cloudy', night: 'weather-night-partly-cloudy', label: 'Partly cloudy' },
	{ codes: [3], icon: 'weather-cloudy', label: 'Overcast' },
	{ codes: [45, 48], icon: 'weather-fog', label: 'Fog' },
	{ codes: [51, 53, 55, 56, 57], icon: 'weather-rainy', label: 'Drizzle' },
	{ codes: [61, 63, 66, 80, 81], icon: 'weather-rainy', label: 'Rain' },
	{ codes: [65, 67, 82], icon: 'weather-pouring', label: 'Heavy rain' },
	{ codes: [71, 73, 77, 85], icon: 'weather-snowy', label: 'Snow' },
	{ codes: [75, 86], icon: 'weather-snowy-heavy', label: 'Heavy snow' },
	{ codes: [95], icon: 'weather-lightning-rainy', label: 'Thunderstorm' },
	{ codes: [96, 99], icon: 'weather-hail', label: 'Thunderstorm with hail' },
]
const UNKNOWN = { icon: 'weather-cloudy', label: 'Weather' }

// kind is the icon and the (untranslated) label of a code, the night's icon after sunset
export function kind(code, day = true) {
	const found = KINDS.find(k => k.codes.includes(code)) || UNKNOWN
	return { icon: (!day && found.night) || found.icon, label: found.label }
}

// a locale of the UI (fr_fr) as the browser's (fr-FR)
export function bcp47(locale) {
	const [lang, region] = String(locale || 'en_us').split('_')
	return region ? `${lang}-${region.toUpperCase()}` : lang
}

// the units a box that never chose starts with: the United States' own, metric elsewhere
export function defaultUnits(locale) {
	return String(locale).toLowerCase() === 'en_us' ? 'imperial' : 'metric'
}

// the short day name of an Open-Meteo date (YYYY-MM-DD), read as the place's own day
export function weekday(date, locale) {
	const [y, m, d] = date.split('-').map(Number)
	return new Intl.DateTimeFormat(bcp47(locale), { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}

export function placeLabel(place) {
	return [place.name, place.region, place.country].filter(Boolean).join(', ')
}
