// Reading the fleet for a tab: /v1/fleet for the boxes, then every source of every box in parallel, each box's
// row handed over as soon as its own answers are in. A box that fails answers for its row only.
import { fleetApi } from '@/service/fleet'

// The relayed GETs a tab may need, by name.
export const SOURCES = {
	version: '/v1/sys/version/check',
	os: '/v1/sys/os',
	utilization: '/v1/sys/utilization',
	grid: '/v2/app_management/web/appgrid',
	vms: '/v2/virt_management/vms',
	autoupdate: '/v1/sys/autoupdate',
	packages: '/v1/sys/packages',
}

const OFFLINE = { ok: false, status: 503, error: 'box offline' }

// One route of one box: the payload it wraps under `data`, or the failure. Never rejects, and never calls a
// box the master says is offline. The box's own `message` (a 409's reason) is the error text when it has one.
export function ask(box, source) {
	if (box.online !== true) {
		return Promise.resolve(OFFLINE)
	}
	return fleetApi.relay(box.id, 'get', SOURCES[source])
		.then(res => ({ ok: true, data: res?.data?.data }))
		.catch(e => ({ ok: false, status: e?.response?.status ?? 0, error: (typeof e?.response?.data?.message === 'string' && e.response.data.message) || e?.message || 'failed' }))
}

// The master's boxes, as /v1/fleet lists them: none when this box is not a master.
export function listBoxes() {
	return fleetApi.status().then((res) => {
		const d = res?.data?.data
		return d?.role === 'master' && Array.isArray(d.master?.boxes) ? d.master.boxes : []
	})
}

// `onBoxes(boxes)`, when given, hears the list of boxes before any of them has answered.
export async function loadRows(sources, build, onRow, onBoxes) {
	const boxes = await listBoxes()
	onBoxes?.(boxes)
	const perBox = await Promise.all(boxes.map(async (box) => {
		const answers = Object.fromEntries(await Promise.all(sources.map(async source => [source, await ask(box, source)])))
		const rows = [].concat(build(box, answers))
		rows.forEach(row => onRow(row))
		return rows
	}))
	return perBox.flat()
}
