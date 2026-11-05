// The logs routes of AppManagement, on this box or on a fleet box through the relay.
import { instance } from '@/service/service.js'
import { fleetApi } from '@/service/fleet'

const BASE = '/v2/app_management/logs'

// Arrays are repeated (app=a&app=b); undefined, null and empty arrays are left out.
export function toQuery(params = {}) {
	const q = new URLSearchParams()
	for (const [k, v] of Object.entries(params)) {
		for (const x of [].concat(v ?? [])) {
			q.append(k, x)
		}
	}
	return q.toString()
}

function withQuery(path, params) {
	const q = toQuery(params)
	return q ? `${path}?${q}` : path
}

// box null: this box; otherwise relayed. The query is built into the path: the relay passes no paramsSerializer,
// and the default one would write app[]=a.
function request(box, method, path, { params, data } = {}) {
	const url = withQuery(path, params)
	const call = box ? fleetApi.relay(box, method, url, { data }) : instance.request({ method, url, data })
	return call
		.then(res => ({ ok: true, status: res.status, data: res?.data?.data }))
		.catch(e => ({ ok: false, status: e?.response?.status ?? 0, error: e?.message || 'failed' }))
}

export const logsApi = {
	apps: box => request(box, 'get', `${BASE}/apps`),
	query: (box, params) => request(box, 'get', BASE, { params }),
	events: (box, params) => request(box, 'get', `${BASE}/events`, { params }),
	settings: () => request(null, 'get', `${BASE}/settings`),
	setSettings: fields => request(null, 'put', `${BASE}/settings`, { data: fields }),
	exportUrl: params => withQuery(`${BASE}/export`, params),
	streamUrl: (params, token, { wsProtocol, baseURL }) =>
		`${wsProtocol}//${baseURL}${withQuery(`${BASE}/stream`, { ...params, token })}`,
}
