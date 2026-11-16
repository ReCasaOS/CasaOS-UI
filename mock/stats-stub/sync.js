// The folder sync routes of the dev mock: /v2/app_management/sync/*, the destinations and the live run they share
// with the backups. A pure `handleSync(request, state)` over `newSyncState()`; null for a path that is not theirs.
const PREFIX = '/v2/app_management'
const NEVER = '0001-01-01T00:00:00Z'
const RUN_MS = 20000
const LOCAL_ROOTS = ['/DATA', '/media', '/mnt']
const TREE = { '': ['Photos', 'Documents', 'nas'], 'Photos': ['2024', '2025'] }
const TASK = /^\/sync\/tasks\/([^/]+)\/(run|first-pass|confirm-deletes)$/

const ok = (data, status = 200) => ({ status, body: { message: 'ok', data } })
const fail = (status, message) => ({ status, body: { message } })

const hex = () => Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
const ago = ms => new Date(Date.now() - ms).toISOString()
const HOUR = 3600000

function aTask(fields) {
	return {
		id: `s${hex()}`,
		name: '',
		destination: '',
		remote_path: '',
		local_path: '',
		direction: 'download',
		mirror: false,
		archive: true,
		archive_days: 30,
		every: 'daily',
		weekday: 0,
		at: '02:00',
		enabled: true,
		first_pass_done: false,
		needs_first_pass: false,
		needs_delete_confirm: false,
		last_run: NEVER,
		last_result: '',
		last_error: '',
		last_files: 0,
		last_bytes: 0,
		...fields,
	}
}

export function newSyncState() {
	const day = 24 * HOUR
	const yesterday = new Date(Date.now() - day)
	yesterday.setHours(2, 0, 0, 0)
	return {
		running: new Map(),
		tasks: [
			aTask({ name: 'Photos', destination: 'Dropbox', remote_path: 'Photos', local_path: '/DATA/Gallery/Photos', last_run: yesterday.toISOString(), last_result: 'ok', last_files: 212, last_bytes: 1503238553 }),
			aTask({ name: 'Documents', destination: 'S3', remote_path: 'bucket/docs', local_path: '/DATA/Documents', direction: 'both', mirror: true, every: 'hourly', at: '00:20', first_pass_done: true, last_result: 'recovered', last_run: ago(40 * 60000), last_files: 3, last_bytes: 48211 }),
			aTask({ name: 'NAS copy', destination: 'Dropbox', remote_path: 'nas', local_path: '/DATA/Media/Films', direction: 'upload', mirror: true, every: 'weekly', at: '03:30', last_result: 'failed', last_error: 'too many files would be deleted', needs_delete_confirm: true, last_run: ago(3 * day) }),
			aTask({ name: 'Notes', destination: 'S3', remote_path: 'bucket/notes', local_path: '/DATA/Notes', direction: 'both', mirror: true, at: '04:00', enabled: false, first_pass_done: true, needs_first_pass: true, last_result: 'failed', last_error: 'bisync aborted', last_run: ago(2 * day) }),
		],
	}
}

// the task is shown as running for RUN_MS, then ends well
function start(task, state) {
	const startedAt = Date.now()
	state.running.set(task.id, startedAt)
	setTimeout(() => {
		state.running.delete(task.id)
		Object.assign(task, { last_result: 'ok', last_error: '', last_run: new Date().toISOString() })
	}, RUN_MS).unref()
	return { status: 202, body: { message: 'ok' } }
}

function live(state) {
	return state.tasks.filter(task => state.running.has(task.id)).map((task) => {
		const startedAt = state.running.get(task.id)
		const done = Math.min(1, (Date.now() - startedAt) / RUN_MS)
		const totalBytes = 800 * 1048576
		return {
			id: task.id,
			kind: 'sync',
			app: task.name,
			destination: task.destination,
			stamp: new Date(startedAt).toISOString(),
			origin: 'on_demand',
			started_at: new Date(startedAt).toISOString(),
			operation: 0,
			operations: 0,
			source: task.local_path,
			stats: { bytes: Math.round(done * totalBytes), total_bytes: totalBytes, files: Math.round(done * 120), total_files: 120, speed: 40 * 1048576, eta: Math.ceil((1 - done) * RUN_MS / 1000), current: `${task.remote_path}/IMG_${String(Math.round(done * 120)).padStart(4, '0')}.jpg` },
		}
	})
}

function save(body, state) {
	if (!body || !Array.isArray(body.tasks)) {
		return fail(400, 'tasks is required')
	}
	if (body.tasks.some(task => !LOCAL_ROOTS.some(root => task.local_path === root || String(task.local_path).startsWith(`${root}/`)))) {
		return fail(400, 'the folder on this box must be under /DATA, /media or /mnt')
	}
	// what the engine keeps for a known id: the outcome of the runs and the first-pass flags
	const known = new Map(state.tasks.map(task => [task.id, task]))
	state.tasks = body.tasks.map((task) => {
		const old = known.get(task.id)
		const { last_run, last_result, last_error, last_files, last_bytes, first_pass_done, needs_first_pass, needs_delete_confirm } = old || {}
		return aTask({ ...task, id: old ? task.id : `s${hex()}`, ...(old && { last_run, last_result, last_error, last_files, last_bytes, first_pass_done, needs_first_pass, needs_delete_confirm }) })
	})
	return ok(state.tasks)
}

export function handleSync({ method = 'GET', path = '', query = {}, body = null } = {}, state) {
	if (!path.startsWith(PREFIX)) {
		return null
	}
	const rest = path.slice(PREFIX.length)
	const verb = method.toUpperCase()
	if (rest === '/sync/tasks') {
		return verb === 'GET' ? ok(state.tasks) : verb === 'PUT' ? save(body, state) : null
	}
	const action = rest.match(TASK)
	if (action && verb === 'POST') {
		const task = state.tasks.find(candidate => candidate.id === decodeURIComponent(action[1]))
		if (!task) {
			return fail(404, 'sync task not found')
		}
		if (action[2] === 'run') {
			return task.needs_first_pass || task.needs_delete_confirm ? fail(409, 'this sync task does not wait for that') : start(task, state)
		}
		task[action[2] === 'first-pass' ? 'needs_first_pass' : 'needs_delete_confirm'] = false
		return start(task, state)
	}
	const folders = rest.match(/^\/backup\/destinations\/[^/]+\/folders$/)
	if (folders && verb === 'GET') {
		return ok({ folders: TREE[query.path || ''] || [] })
	}
	if (verb === 'GET' && rest === '/backup/destinations') {
		return ok(['Dropbox', 'S3'])
	}
	if (verb === 'GET' && rest === '/backup/running') {
		// no envelope, as the box answers it
		return { status: 200, body: { backups: live(state), passes: [] } }
	}
	return null
}
