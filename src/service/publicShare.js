// The public sharing of installed apps through the relay (/v1/share). Called through the axios instance with the
// explicit /v1 path, like fleet.js; an answer is read as res.data.data.
import { reactive } from 'vue'
import { RELAY_MS } from '@/service/fleet.js'
import { instance } from '@/service/service.js'

const app = name => `/v1/share/apps/${encodeURIComponent(name)}`

export const publicShareApi = {
	status: () => instance.get('/v1/share'),
	setName: name => instance.put('/v1/share/name', { name, accept_tos: true }, { timeout: RELAY_MS }),
	share: name => instance.put(app(name), undefined, { timeout: RELAY_MS }),
	unshare: name => instance.delete(app(name)),
	stopAll: () => instance.delete('/v1/share/apps'),
}

// `ok` is true once a GET answered; `status` is its Data. A core without the route leaves both empty: nothing shows.
export const publicShare = reactive({ status: null, ok: false })

const EVERY = 60000
// a failed read is tried again sooner, then less and less often (as backupStatus.js does)
const RETRY = 15000
let wait = EVERY
let readAt = Number.NEGATIVE_INFINITY
let inFlight = null

async function read() {
	try {
		publicShare.status = (await publicShareApi.status()).data.data
		publicShare.ok = true
		wait = EVERY
	} catch (e) {
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
