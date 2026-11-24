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
	status: async () => (await client()).get(`${PREFIX}/status`),
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

export function resetVulnScan() {
	readAt = Number.NEGATIVE_INFINITY
	inFlight = null
	vulnScan.apps = {}
	vulnScan.ok = false
}
