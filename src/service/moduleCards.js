import { clean } from '@/components/settings/osPlan'

// The client of the cards that modules show on the home screens. A module is not trusted as the core is: its answer is read within 16 KiB (of
// bytes) and 5 s, and a 401, 403 or 404 of its own is its business, so none of the shared client's interceptors (token refresh, sign-out,
// toasts) is here, and it is fetch and not axios: a redirect is refused (the token and the body of a request never follow one to another route
// of the core), and the status of an answer is kept whatever its body is.
export const MAX_BYTES = 16384
export const TIMEOUT = 5000
// the list of the cards is the core's own call, as slow as the dashboard's other module calls can be
export const LIST_TIMEOUT = 35000
// the answers that mean "this module has no card for you": the card goes, with no word of it
export const GONE = [401, 403, 404]

export const ROUTE = /^\/v\d+\/[a-z0-9_]{1,40}$/
const PATH_MAX = 200
// shortcut: the percent-encoded dots, slashes and backslashes are refused outright (a module has no need to send them), so no server decoding can make a ".." of them.
const PATH_BAD = /\.\.|\/\/|[?#\\]|%2e|%2f|%5c/i

/** Whether `path` is one that a card may ask for: under the module's route, no dot segments, no query, no fragment. */
export const isCardPath = path => typeof path === 'string' && [...path].length <= PATH_MAX && path.startsWith('/') && !PATH_BAD.test(path) && clean(path, PATH_MAX) === path

/** The one place where a route and a path are joined: `route + path`, or an error. */
export function cardUrl(route, path) {
	if (typeof route !== 'string' || !ROUTE.test(route))
		throw new Error('not a module route')
	if (!isCardPath(path))
		throw new Error('not a card path')
	return route + path
}

const bytes = text => new TextEncoder().encode(text).length

/** The size of a text in bytes, as the bounds of the cards count it. */
export const byteLength = bytes

// an answer, read as text and stopped as soon as it is past MAX_BYTES
async function readText(response) {
	if (!response.body)
		return await response.text()
	const reader = response.body.getReader()
	const chunks = []
	let total = 0
	for (;;) {
		const { done, value } = await reader.read()
		if (done)
			break
		total += value.length
		if (total > MAX_BYTES) {
			reader.cancel().catch(() => {})
			throw new Error('answer too long')
		}
		chunks.push(value)
	}
	const decoder = new TextDecoder()
	return chunks.map(chunk => decoder.decode(chunk, { stream: true })).join('') + decoder.decode()
}

const failure = (message, status, data = null) => Object.assign(new Error(message), { status, data })

// One request. Resolves { data } (the JSON of a 2xx, or null when its body is empty); rejects with an Error that has `status` (the HTTP status,
// absent when there was none: no answer, a redirect, a time out, a text that is too long) and `data` (the JSON of the body of an error, or null).
async function call(method, url, body, timeout = TIMEOUT) {
	const headers = { 'Content-Type': 'application/json' }
	// the same header as the shared client's, read when the call is made
	const token = localStorage.getItem('access_token')
	if (token)
		headers.Authorization = token
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeout)
	try {
		const response = await fetch(url, { method, headers, body, redirect: 'error', credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
		const text = await readText(response)
		let data = null
		if (text.trim() !== '') {
			try {
				data = JSON.parse(text)
			} catch {
				if (response.ok)
					throw failure('not JSON', undefined)
			}
		}
		if (!response.ok)
			throw failure(`status ${response.status}`, response.status, data)
		return { data }
	} finally {
		clearTimeout(timer)
	}
}

export const getCards = () => call('GET', '/v1/sys/modules/cards', undefined, LIST_TIMEOUT)
export const getCard = route => call('GET', cardUrl(route, '/card'))

/** POSTs an action of a card: `route + path`, the JSON of `body` (up to 16 KiB) or `{}`. */
export function act(route, path, body = {}) {
	return post(cardUrl(route, path), body)
}

/** The same, for the full address that a description gave (`route + path`): it is checked again against the route that it must be under. */
export function actUrl(route, url, body = {}) {
	if (typeof url !== 'string' || typeof route !== 'string' || !url.startsWith(`${route}/`))
		throw new Error('not under the module route')
	return act(route, url.slice(route.length), body)
}

function post(url, body) {
	const data = JSON.stringify(body ?? {})
	if (bytes(data) > MAX_BYTES)
		throw new Error('body too long')
	return call('POST', url, data)
}
