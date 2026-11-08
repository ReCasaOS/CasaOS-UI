import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import backup from './backup.js'
import { backupStatus, refresh, resetBackupStatus } from './backupStatus.js'

// backup.js pulls in service.js, which wires the router and the store
vi.mock('@/router', () => ({ default: { replace() {} } }))
vi.mock('@/store', () => ({ default: { commit() {} } }))

const NOW = Date.parse('2026-11-08T12:00:00Z')
const answer = data => Promise.resolve({ data })
const schedule = { app: 'a', destination: 'd', enabled: true, last_run: '0001-01-01T00:00:00Z', last_slot: '2026-11-08T07:00:00Z' }

let runs, schedules, operations
beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(NOW)
	resetBackupStatus()
	runs = vi.spyOn(backup, 'getRuns').mockImplementation(() => answer({ data: [] }))
	schedules = vi.spyOn(backup, 'getSchedules').mockImplementation(() => answer({ data: [schedule] }))
	operations = vi.spyOn(backup, 'getOperations').mockImplementation(() => answer({ operations: [], os_upgrade_open: false }))
})
afterEach(() => {
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe('the backup status of this box', () => {
	it('starts with no state and not ok', () => {
		expect(backupStatus).toMatchObject({ states: [], ok: false })
	})

	it('reads the three routes and computes the couples', async () => {
		await refresh()
		expect(backupStatus.ok).toBe(true)
		expect(backupStatus.states).toMatchObject([{ app: 'a', destination: 'd', state: 'never' }])
	})

	it('reads the operations without an envelope', async () => {
		operations.mockImplementation(() => answer({ operations: [{ app: 'a', kind: 'backup' }], os_upgrade_open: true }))
		runs.mockImplementation(() => answer({ data: [{ app: 'a', destination: 'd', started_at: '2026-11-07T07:00:00Z', finished_at: '2026-11-07T07:01:00Z', error: '' }] }))
		schedules.mockImplementation(() => answer({ data: [{ ...schedule, last_run: '2026-11-07T07:00:00Z' }] }))
		await refresh()
		expect(backupStatus.states[0]).toMatchObject({ state: 'ok', running: true })
	})

	it('shares one read between concurrent callers and reads at most once a minute', async () => {
		await Promise.all([refresh(), refresh(), refresh()])
		await refresh()
		vi.setSystemTime(NOW + 59000)
		await refresh()
		expect(runs).toHaveBeenCalledTimes(1)
		expect(schedules).toHaveBeenCalledTimes(1)
		expect(operations).toHaveBeenCalledTimes(1)
		vi.setSystemTime(NOW + 61000)
		await refresh()
		expect(runs).toHaveBeenCalledTimes(2)
	})

	it.each([['runs'], ['schedules'], ['operations']])('shows nothing, never a default green, when %s cannot be read', async (which) => {
		await refresh()
		expect(backupStatus.ok).toBe(true)
		vi.setSystemTime(NOW + 61000)
		;({ runs, schedules, operations })[which].mockImplementation(() => Promise.reject(new Error('down')))
		await refresh()
		expect(backupStatus).toMatchObject({ states: [], ok: false })
	})

	it('retries a failed read after 15 seconds, not a minute', async () => {
		runs.mockImplementation(() => Promise.reject(new Error('down')))
		await refresh()
		expect(backupStatus.ok).toBe(false)
		vi.setSystemTime(NOW + 14000)
		await refresh()
		expect(runs).toHaveBeenCalledTimes(1)
		runs.mockImplementation(() => answer({ data: [] }))
		vi.setSystemTime(NOW + 16000)
		await refresh()
		expect(runs).toHaveBeenCalledTimes(2)
		expect(backupStatus.ok).toBe(true)
	})

	it('backs off 15 s, 30 s, then a minute after repeated failures, and starts over after a success', async () => {
		runs.mockImplementation(() => Promise.reject(new Error('down')))
		const at = async (ms) => {
			vi.setSystemTime(NOW + ms)
			await refresh()
		}
		await at(0)
		expect(runs).toHaveBeenCalledTimes(1)
		await at(14999)
		expect(runs).toHaveBeenCalledTimes(1)
		await at(15000)
		expect(runs).toHaveBeenCalledTimes(2)
		// second failure: 30 s
		await at(15000 + 29999)
		expect(runs).toHaveBeenCalledTimes(2)
		await at(15000 + 30000)
		expect(runs).toHaveBeenCalledTimes(3)
		// third failure: a minute, and no longer
		await at(45000 + 59999)
		expect(runs).toHaveBeenCalledTimes(3)
		await at(45000 + 60000)
		expect(runs).toHaveBeenCalledTimes(4)
		await at(105000 + 60000)
		expect(runs).toHaveBeenCalledTimes(5)
		// a success starts over: the next failure is retried after 15 s again
		runs.mockImplementation(() => answer({ data: [] }))
		await at(165000 + 60000)
		expect(backupStatus.ok).toBe(true)
		runs.mockImplementation(() => Promise.reject(new Error('down')))
		await at(225000 + 60000)
		expect(runs).toHaveBeenCalledTimes(7)
		await at(225000 + 60000 + 15000)
		expect(runs).toHaveBeenCalledTimes(8)
	})

	it('still waits a minute after a read that worked', async () => {
		await refresh()
		vi.setSystemTime(NOW + 16000)
		await refresh()
		expect(runs).toHaveBeenCalledTimes(1)
	})

	it.each([['no operations array', {}], ['null operations', { operations: null }]])('reads a malformed /operations body (%s) as no running backup, never as a green', async (_, body) => {
		// without the running/suspended information a late couple reads late: not green, which is the safe side
		runs.mockImplementation(() => answer({ data: [{ app: 'a', destination: 'd', started_at: '2026-11-07T07:00:00Z', finished_at: '2026-11-07T07:01:00Z', error: '' }] }))
		schedules.mockImplementation(() => answer({ data: [{ ...schedule, last_run: '2026-11-07T07:00:00Z' }] }))
		operations.mockImplementation(() => answer(body))
		await refresh()
		expect(backupStatus.ok).toBe(true)
		expect(backupStatus.states[0]).toMatchObject({ state: 'late', running: false })
	})

	it('can be reset', async () => {
		await refresh()
		resetBackupStatus()
		expect(backupStatus).toMatchObject({ states: [], ok: false })
		await refresh()
		expect(runs).toHaveBeenCalledTimes(2)
	})
})
