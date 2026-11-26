import axios from 'axios'
import { clean } from '@/components/settings/osPlan'

// The client of the cards that modules show on the home screens. A module is not trusted as the core is: its answer is read within 16 KiB and
// 5 s, and a 401, 403 or 404 of its own is its business, so none of the shared client's interceptors (token refresh, sign-out, toasts) is here.
export const MAX_BYTES = 16384
export const TIMEOUT = 5000

export const ROUTE = /^\/v\d+\/[a-z0-9_]{1,40}$/
const PATH_MAX = 200
// shortcut: the percent-encoded dots, slashes and backslashes are refused outright (a module has no need to send them), so no server decoding can make a ".." of them.
const PATH_BAD = /\.\.|\/\/|[?#\\]|%2e|%2f|%5c/i

/** Whether `path` is one that a card may ask for: under the module's route, no dot segments, no query, no fragment. */
export const isCardPath = path => typeof path === 'string' && path.length <= PATH_MAX && path.startsWith('/') && !PATH_BAD.test(path) && clean(path, PATH_MAX) === path

/** The one place where a route and a path are joined: `route + path`, or an error. */
export function cardUrl(route, path) {
	if (typeof route !== 'string' || !ROUTE.test(route))
		throw new Error('not a module route')
	if (!isCardPath(path))
		throw new Error('not a card path')
	return route + path
}

// A text longer than MAX_BYTES is refused as it arrives (axios' own limit only holds in node), and it has to be JSON.
function readJson(text) {
	if (typeof text !== 'string' || text.length > MAX_BYTES)
		throw new Error('answer too long')
	return JSON.parse(text)
}

export const card = axios.create({
	baseURL: '',
	timeout: TIMEOUT,
	headers: { 'Content-Type': 'application/json' },
	withCredentials: false,
	maxContentLength: MAX_BYTES,
	maxBodyLength: MAX_BYTES,
	responseType: 'text',
	transformResponse: [readJson],
})

// the same header as the shared client's, read when the call is made
card.interceptors.request.use((config) => {
	config.headers.Authorization = localStorage.getItem('access_token')
	return config
})

export const getCards = () => card.get('/v1/sys/modules/cards')
export const getCard = route => card.get(cardUrl(route, '/card'))

/** POSTs an action of a card: `route + path`, the JSON of `body` (up to 16 KiB) or `{}`. */
export function act(route, path, body = {}) {
	const url = cardUrl(route, path)
	const data = JSON.stringify(body ?? {})
	if (data.length > MAX_BYTES)
		throw new Error('body too long')
	return card.post(url, data)
}
