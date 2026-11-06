// The rows of the Fleet page, as pure functions of what one box answered. Each answer is
// `{ ok: true, data }` (the payload the route wraps under `data`) or `{ ok: false, status, error }`,
// status 0 for a network error. Nothing here does I/O, and nothing a box sends is trusted to be a string.

const DOWN = new Set(['exited', 'dead', 'restarting', 'unknown'])

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

export function overviewRow(box, answers) {
	const os = payload(answers.os)
	const util = payload(answers.utilization)
	const grid = payload(answers.grid)
	const vms = payload(answers.vms)
	const disk = util?.sys_disk
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
