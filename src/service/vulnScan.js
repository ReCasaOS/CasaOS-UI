// The vulnerability scans of the apps' images (/v2/vuln_scan), served by the optional module
// ReCasaOS-VulnScan. Its routes are the administrator's only. Called through the axios instance
// with the explicit path, like publicShare.js; an answer is read as res.data.data.
import { reactive } from 'vue'

const PREFIX = '/v2/vuln_scan'

// loaded when a call runs: the service client brings the router and the store with it, and the app grid imports this file
const client = () => import('@/service/service.js').then(m => m.instance)

export const vulnScanApi = {
	apps: async () => (await client()).get(`${PREFIX}/apps`),
	app: async name => (await client()).get(`${PREFIX}/apps/${encodeURIComponent(name)}`),
	status: async opts => (await client()).get(`${PREFIX}/status`, ...(opts ? [opts] : [])),
	scan: async () => (await client()).post(`${PREFIX}/scan`),
}

// `ok` is true once the module answered; `apps` is what its last scan found, by app name. A box
// without the module leaves both empty: nothing shows.
export const vulnScan = reactive({ apps: {}, ok: false })

// the scans run once a night: what they found does not change by the minute
const EVERY = 5 * 60000
let readAt = Number.NEGATIVE_INFINITY
let inFlight = null

// The summaries by app name. A container made by hand is left out: it has no card of its own,
// and may carry the name of an app. A name that is not a plain string is no app.
function byName(list) {
	const apps = Object.create(null)
	for (const item of Array.isArray(list) ? list : []) {
		if (item && typeof item.app === 'string' && item.app !== '' && item.loose !== true) {
			apps[item.app] = item
		}
	}
	return apps
}

async function read() {
	try {
		const apps = byName((await vulnScanApi.apps()).data.data)
		// the prototype-less map kept the odd names out; the store holds a plain object
		vulnScan.apps = Object.fromEntries(Object.entries(apps).filter(([name]) => !(name in Object.prototype)))
		vulnScan.ok = true
	} catch {
		// no route (no module), not the administrator, or no answer: nothing to show
		vulnScan.apps = {}
		vulnScan.ok = false
	}
}

// At most one read in five minutes whoever asks; `force` skips the wait (after a scan, on opening the window).
export function refresh({ force = false } = {}) {
	if (!inFlight && (force || Date.now() - readAt >= EVERY)) {
		readAt = Date.now()
		inFlight = read().finally(() => {
			inFlight = null
		})
	}

	return inFlight || Promise.resolve()
}

const FOLLOW_EVERY = 10000
const FOLLOW_FOR = 3 * 60000
let following = 0

// After an app was installed, updated, changed or removed. The module scans by itself when an app
// runs a new image, once the operation is over: the apps are read at once (an update takes its
// offer away), then again when a scan newer than the one known has ended. Three minutes at most
// for it to start: nothing follows a change that kept the images. A newer call takes the wait over.
export async function followRescan() {
	if (!vulnScan.ok) {
		return
	}
	const mine = ++following
	try {
		const before = (await vulnScanApi.status()).data.data?.last_run
		await refresh({ force: true })
		for (let waited = 0; waited < FOLLOW_FOR;) {
			await new Promise(resolve => setTimeout(resolve, FOLLOW_EVERY))
			if (mine !== following) {
				return
			}
			const status = (await vulnScanApi.status()).data.data
			if (!status?.running && status?.last_run !== before) {
				await refresh({ force: true })
				return
			}
			// a scan that runs is waited for to its end: a large image takes its time
			waited += status?.running ? 0 : FOLLOW_EVERY
		}
	} catch {
		// the module stopped answering: the next read says so
	}
}

export function resetVulnScan() {
	following++
	readAt = Number.NEGATIVE_INFINITY
	inFlight = null
	vulnScan.apps = {}
	vulnScan.ok = false
}
