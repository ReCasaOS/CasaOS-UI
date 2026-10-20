// The statistics clients: one per service prefix, same four calls.
import { isDots } from '@/components/VirtualMachines/vms'
import { api } from '@/service/service.js'

export const STATS_SOURCES = ['app_management', 'virt_management', 'core']

const RANGES = ['live', '15m', '1h', '24h', '7d']

// api.get/put add /v1 themselves, so the core path has no prefix here.
const PREFIX = {
	app_management: '/v2/app_management/stats',
	virt_management: '/v2/virt_management/stats',
	core: '/sys/stats',
}

function base(source) {
	if (!STATS_SOURCES.includes(source)) {
		throw new Error('unknown source')
	}
	return PREFIX[source]
}

// An id comes from a service or the bus: it must stay one segment of the route.
function seg(id) {
	if (typeof id !== 'string' || id === '' || isDots(id)) {
		throw new Error('not one segment of a route')
	}
	return encodeURIComponent(id)
}

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v)

// The core wraps in {success, message, data}; the two v2 services answer bare.
function unwrap(source, res) {
	const body = source === 'core' ? res?.data?.data : res?.data
	return isObject(body) ? body : null
}

export const statsApi = {
	list(source) {
		const url = base(source)
		return api.get(url).then(res => unwrap(source, res))
	},
	series(source, id, range) {
		const url = `${base(source)}/${seg(id)}`
		if (!RANGES.includes(range)) {
			throw new Error('unknown range')
		}
		return api.get(url, { range }).then(res => unwrap(source, res))
	},
	alerts(source, id) {
		const url = `${base(source)}/${seg(id)}/alerts`
		return api.get(url).then(res => unwrap(source, res))
	},
	setAlerts(source, id, rules) {
		const url = `${base(source)}/${seg(id)}/alerts`
		return api.put(url, { rules }).then(res => unwrap(source, res))
	},
}
