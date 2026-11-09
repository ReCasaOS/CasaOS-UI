// The fleet routes of the core (/v1/fleet), and the relay to one box: the same routes a box's own dashboard
// calls, prefixed by the box. Everything goes through the axios instance with the explicit /v1 path: the
// `api` wrapper would prefix /v1 a second time. A /v1/fleet answer is read as res.data.data; a relayed answer
// is res.data as the box sent it.
import { instance } from '@/service/service.js'

// The routes the box takes minutes over (apt-get update, image checks): five minutes instead of the instance's one.
export const SLOW_MS = 300000

// The official ReCasaOS relay, the default of the relay setting. Provisional: the owner picks the final hostname.
export const OFFICIAL_RELAY = 'https://relay.recasaos.org'

// The routes that wait on the relay (joining its private network, an address there): the core gives them up
// to two minutes, so two and a half here instead of the instance's one.
export const RELAY_MS = 150000

const box = id => `/v1/fleet/boxes/${encodeURIComponent(id)}`

export function isSlow(method, path, params) {
	const m = String(method).toLowerCase()
	return (m === 'get' && path === '/v1/sys/packages')
		|| (m === 'post' && path === '/v2/app_management/image-updates')
		|| (m === 'get' && path === '/v2/app_management/compose/updates' && String(params?.check) === 'true')
}

export const fleetApi = {
	status: () => instance.get('/v1/fleet'),
	// every box's backups as the master last read them: { notify, interval_seconds, boxes } (409: not a master)
	backups: () => instance.get('/v1/fleet/backups'),
	// { enabled, relay } or { enabled, address } (advanced mode, no relay); { enabled } alone takes the official relay
	setMaster: fields => instance.put('/v1/fleet/master', fields, { timeout: RELAY_MS }),
	// another relay, or the same one again when it lost the fleet: every box then needs a new code
	setRelay: relay => instance.put('/v1/fleet/relay', { relay }, { timeout: RELAY_MS }),
	addBox: fields => instance.post('/v1/fleet/boxes', fields),
	renameBox: (id, fields) => instance.patch(box(id), fields),
	removeBox: id => instance.delete(box(id)),
	rotateCode: id => instance.post(`${box(id)}/code`),
	// the remote access: the box's own remote settings, and the devices allowed to reach it
	setRemote: fields => instance.put('/v1/fleet/remote', fields, { timeout: RELAY_MS }),
	remote: () => instance.get('/v1/fleet/remote', { timeout: RELAY_MS }),
	addDevice: () => instance.post('/v1/fleet/remote/devices'),
	removeDevice: id => instance.delete(`/v1/fleet/remote/devices/${encodeURIComponent(id)}`),
	// leaveRemote: also leave the remote access when the box joins a fleet
	join: (code, { leaveRemote = false } = {}) => instance.put('/v1/fleet/member', leaveRemote ? { code, leave_remote: true } : { code }, { timeout: RELAY_MS }),
	leave: () => instance.delete('/v1/fleet/member'),
	relay: (boxId, method, path, { params, data, timeout } = {}) => instance.request({
		method,
		url: `${box(boxId)}/relay${path}`,
		params,
		data,
		timeout: timeout ?? (isSlow(method, path, params) ? SLOW_MS : undefined),
	}),
}
