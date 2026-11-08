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

	it('can be reset', async () => {
		await refresh()
		resetBackupStatus()
		expect(backupStatus).toMatchObject({ states: [], ok: false })
		await refresh()
		expect(runs).toHaveBeenCalledTimes(2)
	})
})
