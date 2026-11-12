// Grouped actions: one relay call per row, all at once, one result per row. Nothing here is a single
// message for everyone; a row whose box refuses, is offline or fails says so on its own line.
import { failureCode } from './fleetData'
import { fleetApi } from '@/service/fleet'

const enc = id => encodeURIComponent(id)
const relay = (...args) => fleetApi.relay(...args)
const bodyMessage = e => (typeof e?.response?.data?.message === 'string' ? e.response.data.message : '')

// A failed call as a row's result: the spec's four states, the box's reason when it gave one.
function failure(e) {
	const code = failureCode(e)
	const status = e?.response?.status
	return {
		state: code === 'notfound' ? 'failed' : code,
		message: bodyMessage(e) || (status ? String(status) : e?.message || ''),
	}
}

// Runs `call` on every row and resolves to a Map key → { state: 'done'|'refused'|'offline'|'failed', message }.
// A call that resolves to a string says it of a done row (what a 202 left out): that string is the message.
export async function runBulk(rows, call) {
	const results = new Map()
	await Promise.allSettled(rows.map(row => Promise.resolve()
		.then(() => call(row))
		.then(res => results.set(row.key, { state: 'done', message: typeof res === 'string' ? res : '' }), e => results.set(row.key, failure(e)))))
	return results
}

// The compose status route takes the JSON string "start": axios sends a JavaScript string as it is.
const appStatus = state => row => relay(row.boxId, 'put', `/v2/app_management/compose/${enc(row.id)}/status`, { data: JSON.stringify(state) })
// "immich — busy, plex — already running": the pairs a 202 left out, '' when it left none out
const refusals = res => (res?.data?.data?.refused ?? []).map(r => `${r.app} — ${r.reason}`).join(', ')
// a 404 on this route is "no schedule matches": the box declined, it did not fail
function noMatch(e) {
	throw e?.response?.status === 404 ? Object.assign(e, { response: { ...e.response, status: 409 } }) : e
}
const forceRun = (row, body) => relay(row.id, 'post', '/v2/app_management/backup/schedules/run', { data: body }).catch(noMatch)
const vmAction = action => row => relay(row.boxId, 'post', `/v2/virt_management/vms/${enc(row.id)}/${action}`)

export const actions = {
	app: {
		start: appStatus('start'),
		stop: appStatus('stop'),
		restart: appStatus('restart'),
		update: row => relay(row.boxId, 'patch', `/v2/app_management/compose/${enc(row.id)}`),
	},
	vm: {
		'start': vmAction('start'),
		'shutdown': vmAction('shutdown'),
		'reboot': vmAction('reboot'),
		'force-off': vmAction('force-off'),
	},
	// box rows: the row's id is the box's
	box: {
		update: row => relay(row.id, 'post', '/v1/sys/update'),
		packages: row => relay(row.id, 'post', '/v1/sys/packages/update'),
		apps: (row, ids) => relay(row.id, 'post', '/v2/app_management/compose/updates', { data: { ids } }),
		// every enabled schedule of the box now; the box answers 202 with what it started and what it refused
		backupNow: row => forceRun(row, {}).then(refusals),
		backupOne: (row, { app, destination }) => forceRun(row, { app, destination }).then(refusals),
		verifyCouple: (row, { app, destination, stamp }) => relay(row.id, 'post', '/v2/app_management/backup/verifications', { data: { destination, app, stamp } }),
		resticCheck: (row, { destination }) => relay(row.id, 'post', `/v2/app_management/backup/destinations/${enc(destination)}/restic/check`),
		setVerificationSchedule: (row, { enabled, every_days, at }) => relay(row.id, 'put', '/v2/app_management/backup/verification-schedule', { data: { enabled, every_days, at } }),
	},
}

const POLL_MS = 2000
// a start that did not answer in time may run its checks for five minutes before the status leaves idle
const IDLE_GRACE_MS = 6 * 60 * 1000
// shortcut: a box that says "running" for ever is asked for an hour, then given up on; upgrade to a stop signal if a tab leaks polls
const MAX_POLLS = 1800
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

// Asks `path` every two seconds and hands each answer's payload to `onEach`, until `done(payload)`, or until
// `alive()` says nobody is looking any more (the last payload). A box that fails to answer ends the follow with
// { state: 'offline' | 'failed', error }, handed to `onEach` too.
async function follow(boxId, path, onEach, done, alive) {
	let last = {}
	for (let i = 0; i < MAX_POLLS; i++) {
		if (i > 0 && !alive()) {
			return last
		}
		let payload
		try {
			payload = (await relay(boxId, 'get', path))?.data?.data ?? {}
		} catch (e) {
			const { state, message } = failure(e)
			const result = { state: state === 'refused' ? 'failed' : state, error: message }
			onEach(result)
			return result
		}
		last = payload
		onEach(payload)
		if (done(payload)) {
			return payload
		}
		await wait(POLL_MS)
	}
	return { state: 'failed', error: 'timeout' }
}

// GET /v1/sys/packages/update/status until it is over, or still idle once a slow start had time to begin:
// resolves to the last status.
export function followPackages(boxId, onStatus, alive = () => true) {
	const since = Date.now()
	const over = s => ['succeeded', 'failed'].includes(s.state) || (s.state === 'idle' && Date.now() - since >= IDLE_GRACE_MS)
	return follow(boxId, '/v1/sys/packages/update/status', onStatus, over, alive)
}

// GET /v2/app_management/compose/updates/run until the run has a finished_at: resolves to the finished run.
export function followAppUpdates(boxId, onRun, alive = () => true) {
	return follow(boxId, '/v2/app_management/compose/updates/run', onRun, run => Boolean(run.finished_at), alive)
}
