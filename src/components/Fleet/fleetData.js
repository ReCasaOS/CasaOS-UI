// The rows of the Fleet page, as pure functions of what one box answered. Each answer is
// `{ ok: true, data }` (the payload the route wraps under `data`) or `{ ok: false, status, error }`,
// status 0 for a network error. Nothing here does I/O, and nothing a box sends is trusted to be a string.

const DOWN = new Set(['exited', 'dead', 'restarting', 'unknown'])

const text = v => (typeof v === 'string' ? v : '')
const number = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
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
		version: versionOf(answers.version),
		os: os ? { label: text(os.pretty_name), support: text(os.support?.state) || 'unknown' } : null,
		apps: grid
			? {
					running: list(grid).filter(i => i?.status === 'running').length,
					total: list(grid).length,
					down: list(grid).filter(i => DOWN.has(i?.status)).length,
				}
			: null,
		vms: vms ? { running: list(vms).filter(v => v?.state === 'running').length, total: list(vms).length } : null,
		cpu: number(util?.cpu?.percent),
		mem: number(util?.mem?.usedPercent),
		disk: number(disk?.size) > 0 ? Math.min(100, Math.floor(number(disk.used) * 100 / disk.size)) : null,
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
