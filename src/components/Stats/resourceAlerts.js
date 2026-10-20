// What a bus event `resource:alert-firing` / `resource:alert-resolved` becomes on the dashboard: a bounded, deduplicated,
// text-only notification. Pure: the caller draws it. Bus properties are strings, and every one of them is untrusted.
import { formatDateTime } from './statsFormat'
import { clean } from '@/components/settings/osPlan'

const KINDS = ['app-container', 'container', 'vm', 'host']
const MAX_VALUE = 10000
const MAX_FIRING_KEPT = 200

// situation -> [firing key by what is known (value+date, value, date, neither), resolved key]
export const SENTENCES = {
	cpu_high: {
		both: 'Processor of {name} at {value} % since {since}',
		value: 'Processor of {name} at {value} %',
		since: 'Processor of {name} high since {since}',
		none: 'Processor of {name} is high',
		resolved: 'Processor of {name} is back to normal',
	},
	mem_high: {
		both: 'Memory of {name} at {value} % since {since}',
		value: 'Memory of {name} at {value} %',
		since: 'Memory of {name} high since {since}',
		none: 'Memory of {name} is high',
		resolved: 'Memory of {name} is back to normal',
	},
	vm_crashed: {
		both: 'The virtual machine {name} crashed',
		value: 'The virtual machine {name} crashed',
		since: 'The virtual machine {name} crashed',
		none: 'The virtual machine {name} crashed',
		resolved: 'The virtual machine {name} is running again',
	},
}

const has = (table, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key)

// A string or number that is a finite percent, rounded; anything else (including '' and ' ', which Number() turns into 0) is absent.
function percent(raw) {
	if ((typeof raw !== 'string' || raw.trim() === '') && typeof raw !== 'number') {
		return null
	}
	const n = Number(raw)
	return Number.isFinite(n) && n >= 0 && n <= MAX_VALUE ? Math.round(n) : null
}

function date(raw) {
	return typeof raw === 'string' && raw !== '' && !Number.isNaN(Date.parse(raw)) ? raw : null
}

export function createAlertFeed({ now = Date.now, max = 5, windowMs = 60000 } = {}) {
	// `item|situation|state` -> when it was last accepted
	let recent = new Map()
	// `item|situation` -> true, for the firings accepted and not yet resolved
	const firings = new Set()
	let counter = 0

	return {
		accept(state, properties) {
			if ((state !== 'firing' && state !== 'resolved') || properties === null || typeof properties !== 'object') {
				return null
			}
			const { item, situation, kind } = properties
			if (!has(SENTENCES, situation) || typeof item !== 'string' || item === '' || item.length > 300 || !KINDS.includes(kind)) {
				return null
			}
			const key = `${item}|${situation}`
			if (state === 'resolved' && !firings.has(key)) {
				return null
			}

			const t = now()
			recent = new Map([...recent].filter(([, at]) => t - at < windowMs))
			const dedupe = `${key}|${state}`
			if (recent.has(dedupe) || recent.size >= max) {
				return null
			}
			recent.set(dedupe, t)

			if (state === 'resolved') {
				firings.delete(key)
			} else {
				firings.add(key)
				if (firings.size > MAX_FIRING_KEPT) {
					firings.delete(firings.values().next().value)
				}
			}

			const sentences = SENTENCES[situation]
			const params = { name: clean(properties.name, 80) || clean(item, 80) }
			let textKey = sentences.resolved
			if (state === 'firing') {
				const value = percent(properties.value)
				const since = date(properties.since)
				if (value !== null) {
					params.value = value
				}
				if (since !== null) {
					params.since = since
				}
				textKey = sentences[value !== null ? (since !== null ? 'both' : 'value') : (since !== null ? 'since' : 'none')]
			}
			counter++
			return { id: `${dedupe}#${counter}`, key, kind: state, item, text: { key: textKey, params }, open: { item } }
		},
	}
}

// The sentence of an accepted event, in the person's language; `since` is shown as a date.
export function alertMessage(text, t, locale) {
	const params = { ...text.params }
	if (params.since !== undefined) {
		params.since = formatDateTime(params.since, locale)
	}
	return t(text.key, params)
}
