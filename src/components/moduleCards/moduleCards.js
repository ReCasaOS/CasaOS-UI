import { MODULE_NAME, originOf } from '@/components/settings/osModules'
import { clean } from '@/components/settings/osPlan'
import { ROUTE, cardUrl, isCardPath } from '@/service/moduleCards'

/**
 * The cards that modules show on the home screens. A module is not trusted as the core is: its description (version 1) is read strictly,
 * and a field it should not have, a value of the wrong type or a bound that is passed refuses the WHOLE card (cardView gives null). What
 * comes out has no path left to join (every `url` is the route and the path, joined once, by cardUrl) and every text is clean.
 */

// The icons a module may name: the dashboard's own (the casa pack). A name outside the list is not a refusal, the card gets the neutral icon.
export const CARD_ICONS = [
	'network-outline',
	'network2-outline',
	'ethernet-outline',
	'wifi-outline',
	'internet-outline',
	'storage-outline',
	'hdd-local-outline',
	'system-outline',
	'time-outline',
	'shutdown-outline',
	'restart-outline',
	'cloud-outline',
	'backup-outline',
	'protection-outline',
	'gpu-outline',
	'usb-outline',
	'computer-outline',
	'media-outline',
]
export const CARD_ICON_FALLBACK = 'control-outline'

export const CARD_TEXT = {
	unavailable: 'This card is unavailable for now',
	owner: 'by {owner}',
	confirm: 'Confirm',
	cancel: 'Cancel',
	failed: 'The module did not answer. Try again.',
}
export const MODULE_CARD_KEYS = [...new Set(Object.values(CARD_TEXT))]

const LEVELS = ['ok', 'info', 'warning', 'danger']
const MAX_CARDS = 32
const MAX_ROWS = 8
const MAX_ACTIONS = 2
const MAX_BODY = 1024
const REFRESH_DEFAULT = 60

const isPlain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const has = (table, key) => Object.prototype.hasOwnProperty.call(table, key)

/** The cards that the core lists: [{ name, title, route, foreign, owner }], one per module that is well written. */
export function cardList(raw) {
	const modules = isPlain(raw) && Array.isArray(raw.modules) ? raw.modules : []
	const seen = new Set()
	const cards = []
	for (const entry of modules) {
		if (cards.length >= MAX_CARDS)
			break
		if (!isPlain(entry) || typeof entry.name !== 'string' || !MODULE_NAME.test(entry.name) || seen.has(entry.name) || typeof entry.route !== 'string' || !ROUTE.test(entry.route))
			continue
		seen.add(entry.name)
		cards.push({
			name: entry.name,
			title: clean(entry.title, 80) || entry.name,
			route: entry.route,
			foreign: entry.foreign === true,
			owner: originOf({ repository: entry.repository, foreign: entry.foreign })?.owner ?? '',
		})
	}
	return cards
}

// ---- the description of a card -------------------------------------------------------------------------------------------

function refuse() {
	throw new Error('refused')
}

// the keys of an object are the ones that are known, and no other
function known(raw, keys) {
	if (!isPlain(raw) || Object.keys(raw).some(key => !keys.includes(key)))
		refuse()
	return raw
}

// a text of `min` to `max` characters (the bound is of what the module sent), and clean
function text(value, min, max) {
	if (typeof value !== 'string' || value.length > max)
		refuse()
	const shown = clean(value, max)
	if (shown.length < min)
		refuse()
	return shown
}

const optional = (raw, key, read, empty) => has(raw, key) ? read(raw[key]) : empty
const level = value => LEVELS.includes(value) ? value : refuse()

function path(value) {
	if (!isCardPath(value))
		refuse()
	return value
}

function actionOf(value, route) {
	const raw = known(value, ['label', 'method', 'path', 'body', 'confirm'])
	if (raw.method !== 'POST')
		refuse()
	const body = optional(raw, 'body', (item) => {
		if (!isPlain(item) || JSON.stringify(item).length > MAX_BODY)
			refuse()
		return JSON.parse(JSON.stringify(item))
	}, {})
	return { label: text(raw.label, 1, 24), url: cardUrl(route, path(raw.path)), body, confirm: optional(raw, 'confirm', item => text(item, 0, 120), '') }
}

function listOf(value, max, read) {
	if (!Array.isArray(value) || value.length > max)
		refuse()
	return value.map(read)
}

function rowOf(value, route) {
	const raw = known(value, ['label', 'value', 'level', 'action'])
	return {
		label: text(raw.label, 1, 40),
		value: optional(raw, 'value', item => text(item, 0, 40), ''),
		level: optional(raw, 'level', level, ''),
		action: optional(raw, 'action', item => actionOf(item, route), null),
	}
}

/** What a module says of its card (`route` is the module's own), read strictly: the description of the screen, or null when anything is amiss. */
export function cardView(raw, route) {
	try {
		if (typeof route !== 'string' || !ROUTE.test(route))
			return null
		known(raw, ['schema', 'title', 'icon', 'status', 'rows', 'actions', 'link', 'refresh'])
		if (raw.schema !== 1)
			refuse()
		const refresh = optional(raw, 'refresh', item => Number.isInteger(item) && item >= 30 && item <= 3600 ? item : refuse(), REFRESH_DEFAULT)
		return {
			title: text(raw.title, 1, 40),
			icon: typeof raw.icon === 'string' && CARD_ICONS.includes(raw.icon) ? raw.icon : CARD_ICON_FALLBACK,
			status: optional(raw, 'status', (item) => {
				const status = known(item, ['level', 'text'])
				return { level: level(status.level), text: text(status.text, 0, 40) }
			}, null),
			rows: optional(raw, 'rows', item => listOf(item, MAX_ROWS, row => rowOf(row, route)), []),
			actions: optional(raw, 'actions', item => listOf(item, MAX_ACTIONS, action => actionOf(action, route)), []),
			link: optional(raw, 'link', (item) => {
				const link = known(item, ['label', 'path'])
				return { label: text(link.label, 1, 24), url: cardUrl(route, path(link.path)) }
			}, null),
			refresh,
		}
	} catch {
		// every error of the reader is a refusal: a card is never worth a crash of the page
		return null
	}
}

/** What an action answers: its `message` as a short text, or nothing. */
export function actionNote(raw) {
	return isPlain(raw) ? clean(raw.message, 120) : ''
}
