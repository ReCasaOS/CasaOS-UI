// The rows of the Fleet page, as pure functions of what one box answered. Each answer is
// `{ ok: true, data }` (the payload the route wraps under `data`) or `{ ok: false, status, error }`,
// status 0 for a network error. Nothing here does I/O, and nothing a box sends is trusted to be a string.

import { netSpeed } from '@/components/dashboard/healthTiles'

const DOWN = new Set(['exited', 'dead', 'restarting', 'unknown'])

// A box stamps its network counters in whole seconds: two reads closer than this give a rate too coarse to show.
const MIN_NET_GAP = 10

const text = v => (typeof v === 'string' ? v : '')
const number = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const positive = v => (number(v) > 0 ? v : null)
const list = a => (Array.isArray(a) ? a : [])
const payload = answer => (answer?.ok ? answer.data : null)

// An app's title in the grid is a map by language, or missing: English, else its id.
function titleOf(item) {
	const title = item?.title
	if (typeof title === 'string') {
		return title
	}
	return text(title?.en_us) || text(Object.values(title || {}).find(v => typeof v === 'string')) || text(item?.name)
}

// The sources that failed, by name; a 404 on the VMs is "no module", not a failure.
function errorsOf(answers) {
	return Object.keys(answers).filter(name => answers[name] && !answers[name].ok && !(name === 'vms' && answers[name].status === 404))
}

function versionOf(answer) {
	const v = payload(answer)
	return v ? { current: text(v.current_version) || null, latest: text(v.version?.version) || null, available: v.need_update === true } : null
}

// The traffic of a box in bytes per second: its interfaces' counters (utilization `net`) only grow, so the rate is
// the change since `prev`, the row of the previous read, summed over the interfaces both reads have. `sample` is
// what the next read is measured against; it stays the older one when this read is too close to it.
function netOf(util, prev) {
	if (!Array.isArray(util?.net)) {
		return { sample: null, rate: null }
	}
	const sample = util.net.filter(i => text(i?.name))
	const before = new Map(list(prev?.netSample).map(i => [i.name, i]))
	const pairs = sample.map(i => [before.get(i.name), i]).filter(([p]) => p)
	if (pairs.some(([p, c]) => c.time - p.time >= 0 && c.time - p.time < MIN_NET_GAP)) {
		return { sample: prev.netSample, rate: prev.netRate }
	}
	const speeds = pairs.map(([p, c]) => netSpeed(p, c)).filter(s => s && Number.isFinite(s.up) && Number.isFinite(s.down))
	return { sample, rate: speeds.length ? { up: speeds.reduce((n, s) => n + s.up, 0), down: speeds.reduce((n, s) => n + s.down, 0) } : null }
}

// `prev` is this box's row from the previous read, if any: the network rate needs two reads.
export function overviewRow(box, answers, prev) {
	const os = payload(answers.os)
	const util = payload(answers.utilization)
	const grid = payload(answers.grid)
	const vms = payload(answers.vms)
	const disk = util?.sys_disk
	const net = netOf(util, prev)
	return {
		key: box.id,
		id: box.id,
		name: text(box.name),
		url: text(box.url),
		self: box.self === true,
		online: box.online === true,
		lastSeen: box.last_seen ?? null,
		// set by the core when the owner changed relay: the box's code no longer reaches the new one
		needsRecode: box.needs_recode === true,
		version: versionOf(answers.version),
		os: os ? { label: text(os.pretty_name), support: text(os.support?.state) || 'unknown' } : null,
		apps: grid
			? {
					running: list(grid).filter(i => i?.status === 'running').length,
					total: list(grid).length,
					down: list(grid).filter(i => DOWN.has(i?.status)).length,
					updates: list(grid).filter(i => i?.update_available === true).length,
				}
			: null,
		vms: vms ? { running: list(vms).filter(v => v?.state === 'running').length, total: list(vms).length } : null,
		cpu: number(util?.cpu?.percent),
		mem: number(util?.mem?.usedPercent),
		disk: number(disk?.size) > 0 ? Math.min(100, Math.floor(number(disk.used) * 100 / disk.size)) : null,
		// what sits under each meter; a figure the box does not send is null, never 0
		cpuInfo: util?.cpu ? { cores: positive(util.cpu.num), freq: positive(util.cpu.freq), temperature: positive(util.cpu.temperature) } : null,
		memInfo: positive(util?.mem?.total) ? { used: number(util.mem.used) ?? 0, total: util.mem.total } : null,
		diskInfo: number(disk?.size) > 0 ? { used: number(disk.used) ?? 0, total: disk.size } : null,
		netSample: net.sample,
		netRate: net.rate,
		errors: errorsOf(answers),
	}
}

export function containerRows(box, items) {
	return list(items).map(item => ({
		key: `${box.id}/${item.name}`,
		boxId: box.id,
		boxName: text(box.name),
		id: item.name,
		title: titleOf(item),
		status: text(item.status),
		updateAvailable: item.update_available === true,
		type: text(item.app_type),
		actionable: item.app_type === 'v2app',
	}))
}

export function vmRows(box, vms) {
	return list(vms).map(vm => ({
		key: `${box.id}/${vm.id}`,
		boxId: box.id,
		boxName: text(box.name),
		id: vm.id,
		title: text(vm.title) || text(vm.name) || text(vm.id),
		state: text(vm.state),
		vcpus: number(vm.vcpus),
		memoryMib: number(vm.memory_mib),
		os: text(vm.os),
		actionable: true,
	}))
}

export function updatesRow(box, answers) {
	const version = versionOf(answers.version)
	const grid = list(payload(answers.grid))
	return {
		key: box.id,
		id: box.id,
		name: text(box.name),
		self: box.self === true,
		online: box.online === true,
		current: version?.current ?? null,
		latest: version?.latest ?? null,
		available: version?.available === true,
		autoState: text(payload(answers.autoupdate)?.state),
		appUpdates: grid.filter(i => i?.update_available === true).length,
		appIds: grid.filter(i => i?.update_available === true && i.app_type === 'v2app').map(i => i.name),
		packages: packagesView(answers.packages),
		errors: errorsOf(answers),
	}
}

// GET /v1/sys/packages for the packages cell: the count, or why it cannot be had. A box that cannot check (not
// Debian, a core not running as root) answers supported: false with a count of 0, which is not "up to date".
export function packagesView(answer) {
	if (!answer) {
		return null
	}
	if (!answer.ok) {
		return { error: failureCode(answer) }
	}
	const p = answer.data || {}
	return p.supported === false ? { supported: false, reason: text(p.reason) } : { count: number(p.count) ?? 0 }
}

// What a failed call means for a row: an axios error, or an answer of ask(). The four words of the spec, plus
// 'notfound' for a route the box does not have (no VM module).
export function failureCode(e) {
	const status = e?.response?.status ?? (typeof e?.status === 'number' ? e.status : 0)
	if (status === 503 || status === 0) {
		return 'offline'
	}
	if (status === 409) {
		return 'refused'
	}
	if (status === 404) {
		return 'notfound'
	}
	return 'failed'
}

const compare = (a, b) => text(a).localeCompare(text(b), undefined, { sensitivity: 'base', numeric: true })

export function sortRows(rows) {
	return [...rows].sort((a, b) => compare(a.boxName, b.boxName) || compare(a.title, b.title))
}

// The four tiles on top of the overview, from the rows as they are now. A box that did not answer has no apps or VMs to count.
export function fleetSummary(rows) {
	const sum = (pick, field) => rows.reduce((n, row) => n + (pick(row)?.[field] ?? 0), 0)
	const apps = row => row.apps
	const vms = row => row.vms
	return {
		boxes: rows.length,
		online: rows.filter(row => row.online).length,
		offline: rows.filter(row => !row.online).length,
		appsRunning: sum(apps, 'running'),
		appsTotal: sum(apps, 'total'),
		appsDown: sum(apps, 'down'),
		appUpdates: sum(apps, 'updates'),
		vmsRunning: sum(vms, 'running'),
		vmsTotal: sum(vms, 'total'),
		toUpdate: rows.filter(row => row.version?.available === true).length,
	}
}

// The chips above the cards: all, the boxes that answer, the ones that do not, the ones with a newer ReCasaOS.
export const BOX_FILTERS = {
	all: () => true,
	online: row => row.online,
	offline: row => !row.online,
	update: row => row.version?.available === true,
}

export function filterBoxes(rows, filter) {
	return rows.filter(BOX_FILTERS[filter] || BOX_FILTERS.all)
}

// By name, or by what needs a person first: a box that is offline, then one that needs a new code, then one with an update, then the rest.
export function sortBoxes(rows, mode) {
	const rank = row => (!row.online ? 0 : row.needsRecode ? 1 : row.version?.available ? 2 : 3)
	return [...rows].sort((a, b) => (mode === 'state' ? rank(a) - rank(b) : 0) || compare(a.name, b.name))
}

// The chips of the Containers and Virtual Machines tabs. A row that stands for a box that could not be read has
// no status or state, so it belongs to "all" only.
export const CONTAINER_FILTERS = {
	all: () => true,
	running: row => row.status === 'running',
	stopped: row => ['exited', 'dead'].includes(row.status),
	update: row => row.updateAvailable === true,
}

export const VM_FILTERS = {
	all: () => true,
	running: row => row.state === 'running',
	stopped: row => row.state === 'shut-off',
	attention: row => ['paused', 'crashed'].includes(row.state),
}

// How many rows each filter keeps, the unreadable boxes' rows not counted.
export function countRows(rows, filters) {
	const own = rows.filter(row => !row.error)
	return Object.fromEntries(Object.keys(filters).map(key => [key, own.filter(filters[key]).length]))
}

// The sorted rows as one group per box, in the order the boxes first appear: `error` is why the box could not be
// read ('' when it could), `rows` what it lists.
export function groupByBox(rows) {
	const groups = new Map()
	for (const row of rows) {
		if (!groups.has(row.boxId)) {
			groups.set(row.boxId, { id: row.boxId, name: row.boxName, error: '', rows: [] })
		}
		const group = groups.get(row.boxId)
		if (row.error) {
			group.error = row.error
		} else {
			group.rows.push(row)
		}
	}
	return [...groups.values()]
}
