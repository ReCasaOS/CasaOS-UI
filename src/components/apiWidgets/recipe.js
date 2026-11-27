/**
 * The recipe of an API widget, on the dashboard's side: the form that edits it, its export and its import. Pure functions.
 *
 * The core is the judge of a recipe (pkg/apiwidgets/recipe.go reads it strictly): nothing here checks one. What is here writes a recipe
 * from the form, never puts a secret in it, and says what a recipe sends.
 */

// the core's own limits and lists
export const MAX_RECIPE_BYTES = 16 * 1024
export const MAX_TEXT = 40
export const MAX_PAIRS = 8
export const MAX_ROWS = { rows: 8, figures: 4 }
export const MAX_RULES = 3
export const MAX_LIMIT = 8
export const FORMATS = ['text', 'number', 'bytes', 'percent', 'ratio', 'duration', 'date', 'count']
export const OPS = ['eq', 'ne', 'lt', 'gt']
export const LEVELS = ['ok', 'info', 'warning', 'danger']
// what the form calls them, to translate
export const FORMAT_LABELS = { text: 'Text', number: 'Number', bytes: 'Size in bytes', percent: 'Percent (0 to 100)', ratio: 'Share (0 to 1)', duration: 'Duration in seconds', date: 'Date', count: 'Number of items' }
export const OP_LABELS = { eq: 'is', ne: 'is not', lt: 'is below', gt: 'is above' }
export const LEVEL_LABELS = { ok: 'Fine (green)', info: 'Information (blue)', warning: 'Warning (orange)', danger: 'Danger (red)' }
// a header or a parameter whose name holds one of these is refused as a fixed text
const SECRET_NAMES = ['authorization', 'key', 'token', 'secret', 'password']
const DEFAULT_REFRESH = 300
const DEFAULT_LIMIT = 5

const str = value => (typeof value === 'string' ? value : '')
const list = value => (Array.isArray(value) ? value : [])
const record = value => (value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {})

/** The JSON Pointer (RFC 6901) of a path of keys and indexes; the root is "". */
export const pointerOf = segments => segments.map(segment => `/${String(segment).replace(/~/g, '~0').replace(/\//g, '~1')}`).join('')

export const isSecretName = name => SECRET_NAMES.some(word => str(name).toLowerCase().includes(word))

/** The id of the input made for a header or a parameter: of its name, as the core wants an id, and not one of `taken`. */
export function inputIdOf(name, taken) {
	let id = str(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
	if (!id)
		id = 'input'
	else if (!/^[a-z]/.test(id))
		id = `in_${id}`
	// room is left for the number that tells two apart
	id = id.slice(0, 28)
	let unique = id
	for (let n = 2; taken.includes(unique); n++)
		unique = `${id}_${n}`
	return unique
}

/** A path as the core takes it: percent-encoded. What is encoded already stays. */
export function encodePath(raw) {
	return str(raw).replace(/%(?![0-9a-f]{2})/gi, '%25').replace(/[^\w\-.~!$&'()*+,;=:@/%[\]]/gu, (character) => {
		try {
			return encodeURIComponent(character)
		} catch {
			// half of a pair: not a character
			return ''
		}
	})
}

const queryOf = search => [...new URLSearchParams(search)]

/** A path typed with its query: { path, query: [[name, value]] }. Null when it has none. */
export function splitPath(text) {
	const [whole] = str(text).split('#')
	const at = whole.indexOf('?')
	return at < 0 ? null : { path: whole.slice(0, at), query: queryOf(whole.slice(at + 1)) }
}

/** A whole address typed where the base goes: { base, path, query }. Null for what is only a base, and for what is not an address. */
export function splitBase(text) {
	let url
	try {
		url = new URL(str(text).trim())
	} catch {
		return null
	}
	if (!['http:', 'https:'].includes(url.protocol) || (url.pathname === '/' && !url.search))
		return null
	return { base: url.origin, path: url.pathname, query: queryOf(url.search) }
}

/** What is typed for the value a rule compares to: a number, true, false, null, or else the text itself. */
export function ruleTo(text) {
	const typed = str(text).trim()
	if (['true', 'false', 'null'].includes(typed))
		return JSON.parse(typed)
	return typed !== '' && Number.isFinite(Number(typed)) ? Number(typed) : str(text)
}

// --- the form ---

// A place of the form. The text a recipe wrote where a secret goes (under a name the core takes for one, or as the password of basic) is
// not taken: the place is a secret, empty, to be typed. A recipe never brings a secret, and what is typed there never becomes a fixed text.
function place(name, value, inputs, label = '') {
	const id = str(value?.input)
	const secret = id !== '' || isSecretName(name)
	return { name, value: secret ? '' : str(value), secret, input: id, label: id ? str(inputs.find(input => input?.id === id)?.label) : label }
}

function shownOf(spec) {
	return {
		value: str(spec.value),
		format: FORMATS.includes(spec.format) ? spec.format : 'text',
		unit: str(spec.unit),
		rules: list(spec.rules).filter(rule => rule !== null && typeof rule === 'object').map(rule => ({
			op: OPS.includes(rule.op) ? rule.op : 'eq',
			to: rule.to ?? null,
			level: LEVELS.includes(rule.level) ? rule.level : 'info',
			text: str(rule.text),
		})),
	}
}

function rowOf(spec) {
	return {
		...shownOf(spec),
		list: typeof spec.each === 'string',
		each: str(spec.each),
		label: str(spec.label),
		bar: spec.bar === true,
		limit: Number.isInteger(spec.limit) ? spec.limit : DEFAULT_LIMIT,
	}
}

export const blankRow = () => rowOf({})
export const blankStatus = () => shownOf({})
export const blankPair = () => place('', '', [])

/**
 * The form of a recipe; of nothing, an empty one. A header, a parameter or a half of basic is { name, value, secret, input, label }: `value`
 * is its fixed text or, when `secret`, what is typed for it now (never what is saved, which the box does not give back); `input` and
 * `label` are the input a recipe already had there.
 */
export function formOf(recipe) {
	const r = record(recipe)
	const inputs = list(r.inputs)
	const pairs = map => Object.entries(record(map)).map(([name, value]) => place(name, value, inputs))
	const basic = record(r.basic)
	return {
		name: str(r.name),
		icon: str(r.icon),
		path: str(r.path),
		query: pairs(r.query),
		headers: pairs(r.headers),
		basicOn: r.basic !== null && typeof r.basic === 'object',
		basicUser: place('user', basic.user, inputs, 'User'),
		// "password" is a secret name: always an input
		basicPassword: place('password', basic.password, inputs, 'Password'),
		baseHint: str(r.base_hint),
		layout: r.layout === 'figures' ? 'figures' : 'rows',
		rows: list(r.rows).filter(row => row !== null && typeof row === 'object').map(rowOf),
		status: r.status !== null && typeof r.status === 'object' ? shownOf(r.status) : null,
		refresh: Number.isInteger(r.refresh) ? r.refresh : DEFAULT_REFRESH,
	}
}

const isSecret = entry => entry.secret || isSecretName(entry.name)

// Every place of the form that sends something, in the order headers, query, basic, with the id of its input when it is a secret. An input
// the recipe had keeps its id; a new one gets an id of its name.
function places(form) {
	const sent = [
		...form.headers.filter(pair => pair.name).map(pair => ['headers', pair]),
		...form.query.filter(pair => pair.name).map(pair => ['query', pair]),
		...(form.basicOn ? [['basic', form.basicUser], ['basic', form.basicPassword]] : []),
	]
	const taken = sent.filter(([, entry]) => isSecret(entry) && entry.input).map(([, entry]) => entry.input)
	return sent.map(([where, entry]) => {
		let id = ''
		if (isSecret(entry)) {
			id = entry.input || inputIdOf(where === 'basic' ? `basic_${entry.name}` : entry.name, taken)
			taken.push(id)
		}
		return { where, entry, id }
	})
}

function shownSpec(shown) {
	const rules = shown.rules.map(rule => ({ op: rule.op, to: rule.to, level: rule.level, ...(rule.text && { text: rule.text }) }))
	return {
		value: shown.value,
		format: shown.format,
		// the dashboard writes a unit after a text and a number only
		...(shown.unit && ['text', 'number'].includes(shown.format) && { unit: shown.unit }),
		...(rules.length && { rules }),
	}
}

/** The recipe the form makes. A secret is never in it: only the input that will carry it. */
export function recipeOf(form) {
	const sent = places(form)
	const valueOf = ({ entry, id }) => (id ? { input: id } : entry.value)
	const pairs = where => Object.fromEntries(sent.filter(one => one.where === where).map(one => [one.entry.name, valueOf(one)]))
	const inputs = []
	for (const { entry, id } of sent) {
		if (id && !inputs.some(input => input.id === id))
			inputs.push({ id, label: (entry.label || entry.name).slice(0, MAX_TEXT) })
	}
	const [user, password] = sent.filter(one => one.where === 'basic')
	return {
		recasaos_widget: 1,
		name: form.name,
		...(form.icon && { icon: form.icon }),
		path: encodePath(form.path),
		...(sent.some(one => one.where === 'query') && { query: pairs('query') }),
		...(sent.some(one => one.where === 'headers') && { headers: pairs('headers') }),
		...(user && { basic: { user: valueOf(user), password: valueOf(password) } }),
		...(inputs.length && { inputs }),
		...(form.baseHint && { base_hint: form.baseHint }),
		layout: form.layout,
		rows: form.rows.map(row => ({
			// "" is the root: what makes a list is that `each` is there
			...(row.list && { each: row.each }),
			label: row.label,
			...shownSpec(row),
			...(row.list && { limit: Number(row.limit) }),
			...(row.bar && ['percent', 'ratio'].includes(row.format) && { bar: true }),
		})),
		...(form.status && { status: shownSpec(form.status) }),
		refresh: Number(form.refresh),
	}
}

/** What is typed for each input, by its id. An input left empty is not there. */
export function secretsOf(form) {
	const secrets = {}
	for (const { entry, id } of places(form)) {
		if (id && entry.value && !secrets[id])
			secrets[id] = entry.value
	}
	return secrets
}

/** The ids of the inputs of the form for which nothing is typed. */
export function emptyInputs(form) {
	const typed = secretsOf(form)
	return [...new Set(places(form).filter(one => one.id && !typed[one.id]).map(one => one.id))]
}

/**
 * All that makes the request, as one text: the address, the certificate setting, the path, the parameters, the headers and basic, with the
 * input at each place and without any secret. It is what the core compares before it lets a saved secret be sent again (hub.go sameRequest).
 */
export function requestOf(form, base, insecure) {
	const recipe = recipeOf(form)
	return JSON.stringify([base, insecure === true, recipe.path, recipe.query ?? {}, recipe.headers ?? {}, recipe.basic ?? null])
}

// --- the rows a click on the answer makes ---

const labelOf = path => (typeof path.at(-1) === 'string' && path.at(-1) ? path.at(-1) : 'Value').slice(0, MAX_TEXT)
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/

function guessFormat(value) {
	if (typeof value === 'number')
		return 'number'
	return typeof value === 'string' && ISO_DATE.test(value) ? 'date' : 'text'
}

export const leafRow = (path, value) => rowOf({ label: labelOf(path), value: pointerOf(path), format: guessFormat(value) })
export const countRow = path => rowOf({ label: labelOf(path), value: pointerOf(path), format: 'count' })
/** One row per item of the array at `path`; its label and its value are then chosen inside an item. */
export const listRow = path => rowOf({ each: pointerOf(path) })

// --- export and import ---

/** All that a recipe sends: [{ where, value }], `where` as the recipe names it (headers.Accept); the value of a secret is null. */
export function sentParts(recipe) {
	const r = record(recipe)
	const basic = record(r.basic)
	return [
		...['headers', 'query'].flatMap(field => Object.entries(record(r[field])).map(([name, value]) => [`${field}.${name}`, value])),
		...(r.basic ? [['basic.user', basic.user], ['basic.password', basic.password]] : []),
	].map(([where, value]) => ({ where, value: typeof value === 'string' ? value : null }))
}

/**
 * The fixed texts a recipe holds, and so shows to whoever gets it: the path (it can carry a token), headers, parameters, the user of basic,
 * the hint of the address.
 */
export function fixedTexts(recipe) {
	const { path, base_hint: hint } = record(recipe)
	return [
		...(str(path) ? [{ where: 'path', value: path }] : []),
		...sentParts(recipe).filter(part => part.value !== null),
		...(str(hint) ? [{ where: 'base_hint', value: hint }] : []),
	]
}

/** The text of the file of a widget (the view the core lists): its recipe alone, never its address nor a secret. */
export const exportRecipe = view => `${JSON.stringify(view.recipe, null, 2)}\n`

export function fileName(name) {
	const slug = str(name).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
	return `${slug || 'widget'}.recasaos-widget.json`
}

// The fields of a recipe and the JSON type of each, as the core reads them: pkg/apiwidgets/recipe.go (Recipe, RowSpec, StatusSpec, Rule,
// Basic, Input, Value) is the source, and recipeOf above writes the same fields. An array holds the shape of its items, { map } the
// shape of the values of an object with free keys; `value` is a header, query or basic value: a text or exactly { "input": id }; `single`
// is what a rule compares to: a text, a number, true, false or null; `format`, `op`, `level` and `layout` are one of the core's own words
// (for none, the core takes an empty format and an empty layout, and no empty op or level).
const RULE_FIELDS = { op: 'op', to: 'single', level: 'level', text: 'string' }
const SHOWN_FIELDS = { value: 'string', format: 'format', unit: 'string', rules: [RULE_FIELDS] }
const RECIPE_FIELDS = {
	recasaos_widget: 'integer',
	name: 'string',
	icon: 'string',
	path: 'string',
	query: { map: 'value' },
	headers: { map: 'value' },
	basic: { user: 'value', password: 'value' },
	inputs: [{ id: 'string', label: 'string' }],
	base_hint: 'string',
	layout: 'layout',
	rows: [{ ...SHOWN_FIELDS, label: 'string', each: 'string', limit: 'integer', bar: 'boolean' }],
	status: SHOWN_FIELDS,
	refresh: 'integer',
}

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const INPUT_ID = /^[a-z][a-z0-9_]{0,31}$/
const KINDS = {
	string: value => typeof value === 'string',
	boolean: value => typeof value === 'boolean',
	integer: value => Number.isInteger(value),
	single: value => value === null || ['string', 'number', 'boolean'].includes(typeof value),
	value: value => typeof value === 'string' || (isObject(value) && Object.keys(value).length === 1 && typeof value.input === 'string' && INPUT_ID.test(value.input)),
	format: value => value === '' || FORMATS.includes(value),
	op: value => OPS.includes(value),
	level: value => LEVELS.includes(value),
	layout: value => ['', 'rows', 'figures'].includes(value),
}

// Refuses, naming it, the first field of `value` that the core does not know by that exact name, or whose value is of another JSON type
// or is not one of the words the core has for it.
function readStrictly(value, shape, at) {
	const wrongKind = (field = at) => Object.assign(new Error('The recipe is refused: {field} has a value of the wrong kind.'), { field })
	if (typeof shape === 'string') {
		if (!KINDS[shape](value))
			throw wrongKind()
	} else if (Array.isArray(shape)) {
		if (!Array.isArray(value))
			throw wrongKind()
		value.forEach((item, index) => readStrictly(item, shape[0], `${at}[${index}]`))
	} else {
		if (!isObject(value))
			throw wrongKind()
		for (const [key, inside] of Object.entries(value)) {
			const field = at ? `${at}.${key}` : key
			if (!shape.map && !Object.hasOwn(shape, key))
				throw Object.assign(new Error('The recipe is refused: {field} is not a field of a recipe.'), { field })
			readStrictly(inside, shape.map ?? shape[key], field)
		}
		// a rule left without one would be given one by the form
		const missing = shape === RULE_FIELDS && ['op', 'level'].find(key => !Object.hasOwn(value, key))
		if (missing)
			throw wrongKind(`${at}.${missing}`)
	}
}

/**
 * The recipe a file holds. Throws, with a sentence to translate (and the `field` it names), for a text over 16 KiB, one that is not JSON,
 * one that is not a recipe of version 1, and one with a field the core does not know, a value of the wrong type, or a format, an op, a
 * level, a layout or the id of an input that the core does not take: the form writes its own recipe from what it reads, so what it would
 * drop or mend must be refused here. The other values (lengths, pointers, limits) are the core's to judge.
 * shortcut: a key written twice in an object is not seen (JSON.parse keeps the last); the core refuses it, only for a recipe sent whole.
 */
export function importRecipe(text) {
	if (new TextEncoder().encode(text).length > MAX_RECIPE_BYTES)
		throw new Error('This file is too large for a recipe: 16 KiB at most.')
	let recipe
	try {
		recipe = JSON.parse(text)
	} catch {
		throw new Error('This file is not JSON.')
	}
	if (record(recipe).recasaos_widget !== 1)
		throw new Error('This file is not the recipe of an API widget.')
	readStrictly(recipe, RECIPE_FIELDS, '')
	return recipe
}
