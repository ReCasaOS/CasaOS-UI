// The public sharing of installed apps through the relay (/v1/share). Called through the axios instance with the
// explicit /v1 path, like fleet.js; an answer is read as res.data.data.
import { reactive } from 'vue'
import { leaveWarning } from '@/components/PublicShare/shareWords'

const app = name => `/v1/share/apps/${encodeURIComponent(name)}`

// loaded when a call runs: the service client brings the router and the store with it, and fleet.js imports it too
const client = () => import('@/service/service.js').then(m => m.instance)
const relayMs = () => import('@/service/fleet.js').then(m => m.RELAY_MS)

export const publicShareApi = {
	status: async opts => (await client()).get('/v1/share', ...(opts ? [opts] : [])),
	setName: async name => (await client()).put('/v1/share/name', { name, accept_tos: true }, { timeout: await relayMs() }),
	share: async name => (await client()).put(app(name), undefined, { timeout: await relayMs() }),
	unshare: async name => (await client()).delete(app(name)),
	stopAll: async () => (await client()).delete('/v1/share/apps'),
}

// The sentence a dialog adds before an action that releases the public name, '' when there is nothing to release.
// A short timeout and never a rejection: this extra read must not hold the original action back (an old core has no route).
export async function readLeaveWarning(t) {
	try {
		return leaveWarning((await publicShareApi.status({ timeout: 5000 })).data.data, t)
	} catch {
		return ''
	}
}

// `ok` is true once a GET answered; `status` is its Data. A core without the route leaves both empty: nothing shows.
export const publicShare = reactive({ status: null, ok: false })

const EVERY = 60000
// a failed read is tried again sooner, then less and less often (as backupStatus.js does)
const RETRY = 15000
let wait = EVERY
let readAt = Number.NEGATIVE_INFINITY
let inFlight = null
// counts the writes: a read that started before one is older than the store, and is dropped
let writes = 0

async function read() {
	const seen = writes
	try {
		const data = (await publicShareApi.status()).data.data
		if (seen !== writes) {
			return
		}
		publicShare.status = data
		publicShare.ok = true
		wait = EVERY
	} catch (e) {
		if (seen !== writes) {
			return
		}
		publicShare.status = null
		publicShare.ok = false
		// no route: an old core, asked again in a minute only
		wait = e?.response?.status === 404 ? EVERY : wait === EVERY ? RETRY : Math.min(wait * 2, EVERY)
	}
}

// At most one read a minute whoever asks; `force` skips the wait (after a write elsewhere, on opening the window).
export function refresh({ force = false } = {}) {
	if (!inFlight && (force || Date.now() - readAt >= wait)) {
		readAt = Date.now()
		inFlight = read().finally(() => {
			inFlight = null
		})
	}

	return inFlight || Promise.resolve()
}

// A write answers with the new status: it goes straight to the store. A refusal rethrows and leaves the store as it was.
export async function apply(promise) {
	const data = (await promise).data.data
	writes++
	publicShare.status = data
	publicShare.ok = true
	return data
}

export function resetPublicShare() {
	readAt = Number.NEGATIVE_INFINITY
	wait = EVERY
	inFlight = null
	publicShare.status = null
	publicShare.ok = false
}
