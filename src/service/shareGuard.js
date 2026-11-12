// The protection of the publicly shared apps (/v1/share/guard), same shape as publicShare.js: an API object,
// a store read once a minute at most, and `apply` for the answers of the writes. A person's code is never stored here.
import { reactive } from 'vue'

const G = '/v1/share/guard'
const enc = encodeURIComponent

// loaded when a call runs, like publicShare.js
const client = () => import('@/service/service.js').then(m => m.instance)

export const shareGuardApi = {
	view: async opts => (await client()).get(G, ...(opts ? [opts] : [])),
	setProtection: async on => (await client()).put(`${G}/protection`, { on }),
	setBox: async policy => (await client()).put(`${G}/box`, policy),
	setApp: async (name, access, override) => (await client()).put(`${G}/apps/${enc(name)}`, { access, override: override ?? null }),
	addPerson: async (name, apps) => (await client()).post(`${G}/people`, { name, apps }),
	updatePerson: async (id, name, apps) => (await client()).put(`${G}/people/${enc(id)}`, { name, apps }),
	newCode: async id => (await client()).post(`${G}/people/${enc(id)}/code`),
	deletePerson: async id => (await client()).delete(`${G}/people/${enc(id)}`),
	events: async ({ app, reason, limit } = {}) => (await client()).get(`${G}/events`, { params: { app, reason, limit } }),
	bans: async () => (await client()).get(`${G}/bans`),
	unban: async key => (await client()).delete(`${G}/bans/${enc(key)}`),
}

// `ok` is true once a GET answered; `view` is its Data. A core without the route (404) empties both: nothing shows.
export const shareGuard = reactive({ view: null, ok: false })

const EVERY = 60000
const RETRY = 15000
let wait = EVERY
let readAt = Number.NEGATIVE_INFINITY
let inFlight = null
// counts the writes: a read that started before one is older than the store, and is dropped
let writes = 0

async function read() {
	const seen = writes
	try {
		const data = (await shareGuardApi.view()).data.data
		if (seen !== writes) {
			return
		}
		shareGuard.view = data
		shareGuard.ok = true
		wait = EVERY
	} catch (e) {
		if (seen !== writes) {
			return
		}
		// no route: an old core, asked again in a minute only; any other failure keeps the last view (an open form stays)
		if (e?.response?.status === 404) {
			shareGuard.view = null
			shareGuard.ok = false
			wait = EVERY
		} else {
			wait = wait === EVERY ? RETRY : Math.min(wait * 2, EVERY)
		}
	}
}

// At most one read a minute whoever asks; `force` skips the wait, and after a read already in flight it reads again.
export function refreshGuard({ force = false } = {}) {
	if (inFlight ? force : force || Date.now() - readAt >= wait) {
		readAt = Date.now()
		const p = (inFlight ? inFlight.then(read) : read()).finally(() => {
			if (inFlight === p) {
				inFlight = null
			}
		})
		inFlight = p
	}

	return inFlight || Promise.resolve()
}

// A write that does not answer with the view (people, codes, bans) calls this: a read in flight is older than it.
export function touchGuard() {
	writes++
}

// For the writes that answer with the new view (protection, box, app). A refusal rethrows and leaves the store as it was.
export async function applyGuard(promise) {
	const data = (await promise).data.data
	writes++
	shareGuard.view = data
	shareGuard.ok = true
	return data
}

export function resetShareGuard() {
	readAt = Number.NEGATIVE_INFINITY
	wait = EVERY
	inFlight = null
	shareGuard.view = null
	shareGuard.ok = false
}
