// The fleet routes of the core (/v1/fleet), and the relay to one box: the same routes a box's own dashboard
// calls, prefixed by the box. Everything goes through the axios instance with the explicit /v1 path: the
// `api` wrapper would prefix /v1 a second time. A /v1/fleet answer is read as res.data.data; a relayed answer
// is res.data as the box sent it.
import { instance } from '@/service/service.js'

// The routes the box takes minutes over (apt-get update, image checks): five minutes instead of the instance's one.
export const SLOW_MS = 300000

const box = id => `/v1/fleet/boxes/${encodeURIComponent(id)}`

export function isSlow(method, path, params) {
	const m = String(method).toLowerCase()
	return (m === 'get' && path === '/v1/sys/packages')
		|| (m === 'post' && path === '/v2/app_management/image-updates')
		|| (m === 'get' && path === '/v2/app_management/compose/updates' && String(params?.check) === 'true')
}

export const fleetApi = {
	status: () => instance.get('/v1/fleet'),
	setMaster: fields => instance.put('/v1/fleet/master', fields),
	addBox: fields => instance.post('/v1/fleet/boxes', fields),
	renameBox: (id, fields) => instance.patch(box(id), fields),
	removeBox: id => instance.delete(box(id)),
	rotateCode: id => instance.post(`${box(id)}/code`),
	join: code => instance.put('/v1/fleet/member', { code }),
	leave: () => instance.delete('/v1/fleet/member'),
	relay: (boxId, method, path, { params, data, timeout } = {}) => instance.request({
		method,
		url: `${box(boxId)}/relay${path}`,
		params,
		data,
		timeout: timeout ?? (isSlow(method, path, params) ? SLOW_MS : undefined),
	}),
}
