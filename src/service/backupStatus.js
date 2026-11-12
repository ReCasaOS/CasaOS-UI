import { reactive } from 'vue'
import { coupleStates } from '@/components/backup/backupStatus.js'

// What this box says of its own scheduled backups, shared by every tile that shows a badge.
// `ok` is false until the three routes have all answered: a tile then shows no badge at all.
export const backupStatus = reactive({ states: [], ok: false })

const EVERY = 60000
// a failed read is tried again sooner (a transient failure must not hide the badges for a minute), then
// less and less often: 15 s, 30 s, a minute -- a box without the backup routes is not asked twelve times a minute
const RETRY = 15000
let wait = EVERY
let readAt = Number.NEGATIVE_INFINITY
let inFlight = null

async function read() {
	try {
		// loaded when the read runs: the service client brings the router and the store with it, and every tile imports this file
		const { default: backup } = await import('./backup.js')
		const [runs, schedules, operations] = await Promise.all([backup.getRuns(), backup.getSchedules(), backup.getOperations()])
		// /operations has no envelope: its body is {operations, os_upgrade_open}
		backupStatus.states = coupleStates({
			runs: runs.data.data || [],
			schedules: schedules.data.data || [],
			operations: operations.data.operations || [],
			osUpgradeOpen: !!operations.data.os_upgrade_open,
		}, Date.now())
		backupStatus.ok = true
		wait = EVERY
	} catch {
		// never a default green: one unreadable answer and there is no badge
		backupStatus.states = []
		backupStatus.ok = false
		wait = wait === EVERY ? RETRY : Math.min(wait * 2, EVERY)
	}
}

// At most one read a minute (sooner after a failed one, see RETRY), whoever asks.
export function refresh() {
	if (!inFlight && Date.now() - readAt >= wait) {
		readAt = Date.now()
		inFlight = read().finally(() => {
			inFlight = null
		})
	}

	return inFlight || Promise.resolve()
}

export function resetBackupStatus() {
	readAt = Number.NEGATIVE_INFINITY
	wait = EVERY
	inFlight = null
	backupStatus.states = []
	backupStatus.ok = false
}
