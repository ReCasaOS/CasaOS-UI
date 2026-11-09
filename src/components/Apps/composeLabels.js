// The Docker labels of a service, as the form edits them: the same rules as AppManagement
// (model/labels.go), so that a mistake is told here instead of by a refused save. AppManagement
// is the one that decides; this only says it earlier.
//
// A key is 1 to 128 characters of letters, digits and `. _ - /`, starting with a letter or a
// digit. A value is at most 2048 bytes with no control character. At most 50 labels are added
// or changed. The keys this box and Docker Compose set are not offered for editing: they stay
// in the file as they are, and are written back unchanged.

export const MAX_KEY_LENGTH = 128
export const MAX_VALUE_BYTES = 2048
export const MAX_LABELS = 50

const KEY = /^[a-z0-9][\w./-]*$/i
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/
const RESERVED = new Set(['casaos', 'origin', 'icon', 'name', 'desc', 'host', 'index', 'web', 'protocol', 'custom_id', 'show_env'])
const RESERVED_PREFIXES = ['io.casaos.', 'com.docker.compose.']

export function isReservedLabel(key) {
	const lower = String(key).toLowerCase()
	return RESERVED.has(lower) || RESERVED_PREFIXES.some(prefix => lower.startsWith(prefix))
}

// Why a label may not be set, as an i18n key with its parameters, or '' when it may.
export function labelProblem(key, value) {
	if (!key)
		return { text: 'A label needs a name.' }
	if (key.length > MAX_KEY_LENGTH)
		return { text: 'The name {key} is longer than {max} characters.', params: { key, max: MAX_KEY_LENGTH } }
	if (!KEY.test(key))
		return { text: 'The name {key} may only have letters, digits and . _ - /, and starts with a letter or a digit.', params: { key } }
	if (isReservedLabel(key))
		return { text: 'The name {key} is set by the system and cannot be used.', params: { key } }
	if (new TextEncoder().encode(value).length > MAX_VALUE_BYTES)
		return { text: 'The value of {key} is longer than {max} bytes.', params: { key, max: MAX_VALUE_BYTES } }
	if (CONTROL.test(value))
		return { text: 'The value of {key} has a control character.', params: { key } }
	return null
}

// The rows of the form that are wrong: what a row already had when the form was opened
// (`known`, key -> value) is left alone, as AppManagement leaves it alone.
export function labelProblems(rows, known = {}) {
	const problems = []
	const seen = new Set()
	let changed = 0
	for (const { container: key = '', host: value = '' } of rows) {
		if (!key && !value)
			continue
		if (known[key] === value && seen.has(key) === false) {
			seen.add(key)
			continue
		}
		changed++
		const problem = labelProblem(key, value)
		if (problem)
			problems.push(problem)
		else if (seen.has(key))
			problems.push({ text: 'The name {key} is used twice.', params: { key } })
		seen.add(key)
	}
	if (changed > MAX_LABELS)
		problems.push({ text: 'At most {max} labels can be added or changed.', params: { max: MAX_LABELS } })
	return problems
}

// compose gives labels as a list of 'key=value' or as a map; the form wants rows. The keys
// the system sets go aside, to be written back as they were.
export function splitLabels(input) {
	const rows = []
	const hidden = []
	if (!input)
		return { rows, hidden }
	const entries = Array.isArray(input) ? input : Object.entries(input)
	for (const entry of entries) {
		let key
		let value
		if (Array.isArray(entry)) {
			[key, value] = entry
		} else {
			const text = String(entry)
			const at = text.indexOf('=')
			key = at === -1 ? text : text.slice(0, at)
			value = at === -1 ? '' : text.slice(at + 1)
		}
		const row = { container: String(key), host: value === null || value === undefined ? '' : String(value) }
		;(isReservedLabel(row.container) ? hidden : rows).push(row)
	}
	return { rows, hidden }
}

// What the form writes: 'key=value' entries, the hidden ones first, rows left empty dropped.
export function joinLabels(rows, hidden = []) {
	return [...hidden, ...rows.filter(row => row.container || row.host)]
		.map(row => `${row.container}=${row.host}`)
}
