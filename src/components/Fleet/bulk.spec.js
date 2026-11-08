// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { actions, followAppUpdates, followPackages, runBulk } from './bulk'
import { fleetApi } from '@/service/fleet'

vi.mock('@/service/fleet', () => ({ fleetApi: { relay: vi.fn() } }))

const answer = data => Promise.resolve({ status: 200, data: { success: 200, data } })
const failure = (status, body) => Promise.reject(Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: body } }))
const rows = ['r1', 'r2', 'r3'].map(key => ({ key, boxId: 'a', id: key }))

describe('a grouped action', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('one result per row, kept apart', async () => {
		const calls = { r1: () => answer({}), r2: () => failure(409, { success: 409, message: 'app busy' }), r3: () => failure(503, { message: 'box offline' }) }
		const results = await runBulk(rows, row => calls[row.key]())
		expect(results.get('r1')).toEqual({ state: 'done', message: '' })
		expect(results.get('r2')).toEqual({ state: 'refused', message: 'app busy' })
		expect(results.get('r3')).toEqual({ state: 'offline', message: 'box offline' })
		expect(results.size).toBe(3)
	})

	it('a network error is offline; anything else is failed with the status or the error text', async () => {
		const calls = { r1: () => Promise.reject(new Error('Network Error')), r2: () => failure(500), r3: () => failure(404, { message: 'no such app' }) }
		const results = await runBulk(rows, row => calls[row.key]())
		expect(results.get('r1')).toEqual({ state: 'offline', message: 'Network Error' })
		expect(results.get('r2')).toEqual({ state: 'failed', message: '500' })
		expect(results.get('r3')).toEqual({ state: 'failed', message: 'no such app' })
	})

	it('runs every row at once and survives a call that throws', async () => {
		const seen = []
		await runBulk(rows, (row) => {
			seen.push(row.key)
			if (row.key === 'r2') {
				throw new Error('boom')
			}
			return new Promise(resolve => setTimeout(() => resolve({}), 0))
		})
		expect(seen).toEqual(['r1', 'r2', 'r3'])
	})

	it('the app actions call the routes of the spec', () => {
		fleetApi.relay.mockReturnValue(answer({}))
		const row = { key: 'a/my app', boxId: 'a', id: 'my/app' }
		actions.app.start(row)
		actions.app.stop(row)
		actions.app.restart(row)
		actions.app.update(row)
		expect(fleetApi.relay.mock.calls).toEqual([
			['a', 'put', '/v2/app_management/compose/my%2Fapp/status', { data: '"start"' }],
			['a', 'put', '/v2/app_management/compose/my%2Fapp/status', { data: '"stop"' }],
			['a', 'put', '/v2/app_management/compose/my%2Fapp/status', { data: '"restart"' }],
			['a', 'patch', '/v2/app_management/compose/my%2Fapp'],
		])
	})

	it('the VM actions call the routes of the spec', () => {
		fleetApi.relay.mockReturnValue(answer({}))
		const row = { key: 'b/vm-1', boxId: 'b', id: 'vm-1' }
		for (const action of ['start', 'shutdown', 'reboot', 'force-off']) {
			actions.vm[action](row)
		}
		expect(fleetApi.relay.mock.calls).toEqual(['start', 'shutdown', 'reboot', 'force-off'].map(a => ['b', 'post', `/v2/virt_management/vms/vm-1/${a}`]))
	})

	it('the box actions call the routes of the spec, with the apps to update', () => {
		fleetApi.relay.mockReturnValue(answer({}))
		const row = { key: 'b', id: 'b', name: 'Shop' }
		actions.box.update(row)
		actions.box.packages(row)
		actions.box.apps(row, ['jellyfin', 'plex'])
		expect(fleetApi.relay.mock.calls).toEqual([
			['b', 'post', '/v1/sys/update'],
			['b', 'post', '/v1/sys/packages/update'],
			['b', 'post', '/v2/app_management/compose/updates', { data: { ids: ['jellyfin', 'plex'] } }],
		])
	})
})

describe('following a box action', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.useFakeTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	it('followPackages asks every two seconds and stops on succeeded', async () => {
		fleetApi.relay.mockReturnValueOnce(answer({ state: 'running' })).mockReturnValueOnce(answer({ state: 'finalizing' })).mockReturnValue(answer({ state: 'succeeded' }))
		const onStatus = vi.fn()
		const done = followPackages('a', onStatus)
		await vi.advanceTimersByTimeAsync(0)
		expect(onStatus).toHaveBeenCalledTimes(1)
		expect(onStatus.mock.calls[0][0]).toEqual({ state: 'running' })
		await vi.advanceTimersByTimeAsync(1999)
		expect(fleetApi.relay).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(1)
		expect(fleetApi.relay).toHaveBeenCalledTimes(2)
		await vi.advanceTimersByTimeAsync(2000)
		expect(await done).toEqual({ state: 'succeeded' })
		expect(fleetApi.relay).toHaveBeenCalledTimes(3)
		expect(fleetApi.relay).toHaveBeenLastCalledWith('a', 'get', '/v1/sys/packages/update/status')
		await vi.advanceTimersByTimeAsync(10000)
		expect(fleetApi.relay).toHaveBeenCalledTimes(3)
	})

	it('followPackages stops on failed and on offline', async () => {
		fleetApi.relay.mockReturnValueOnce(answer({ state: 'failed', error: 'dpkg' }))
		const onStatus = vi.fn()
		expect(await followPackages('a', onStatus)).toEqual({ state: 'failed', error: 'dpkg' })
		fleetApi.relay.mockReturnValueOnce(failure(503, { message: 'box offline' }))
		expect(await followPackages('a', onStatus)).toEqual({ state: 'offline', error: 'box offline' })
		expect(onStatus).toHaveBeenCalledTimes(2)
	})

	it('followPackages stops when it is no longer wanted', async () => {
		fleetApi.relay.mockReturnValue(answer({ state: 'running' }))
		let wanted = true
		const done = followPackages('a', vi.fn(), () => wanted)
		await vi.advanceTimersByTimeAsync(0)
		wanted = false
		await vi.advanceTimersByTimeAsync(10000)
		expect(fleetApi.relay).toHaveBeenCalledTimes(1)
		expect(await done).toEqual({ state: 'running' })
	})

	it('followPackages gives up on a box that stays idle, once a slow start had time to begin', async () => {
		fleetApi.relay.mockReturnValue(answer({ state: 'idle' }))
		const done = followPackages('a', vi.fn())
		await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
		let settled = false
		done.then(() => {
			settled = true
		})
		await vi.advanceTimersByTimeAsync(0)
		expect(settled).toBe(false)
		await vi.advanceTimersByTimeAsync(2 * 60 * 1000)
		expect(await done).toEqual({ state: 'idle' })
	})

	it('followAppUpdates stops once the run has finished', async () => {
		const running = { started_at: 't0', finished_at: '', apps: [{ id: 'jellyfin', state: 'updating' }] }
		const finished = { ...running, finished_at: 't1', apps: [{ id: 'jellyfin', state: 'updated' }] }
		fleetApi.relay.mockReturnValueOnce(answer(running)).mockReturnValue(answer(finished))
		const onRun = vi.fn()
		const done = followAppUpdates('a', onRun)
		await vi.advanceTimersByTimeAsync(0)
		expect(onRun).toHaveBeenCalledWith(running)
		await vi.advanceTimersByTimeAsync(2000)
		expect(await done).toEqual(finished)
		expect(fleetApi.relay).toHaveBeenLastCalledWith('a', 'get', '/v2/app_management/compose/updates/run')
		expect(fleetApi.relay).toHaveBeenCalledTimes(2)
	})

	it('followAppUpdates gives up on a box that stops answering', async () => {
		fleetApi.relay.mockReturnValueOnce(Promise.reject(new Error('Network Error')))
		expect(await followAppUpdates('a', vi.fn())).toEqual({ state: 'offline', error: 'Network Error' })
	})
})

describe('the backup actions of a box', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})
	const boxRows = ['a', 'b', 'c'].map(id => ({ key: id, id }))
	const run = (started, refused = []) => Promise.resolve({ status: 202, data: { message: 'ok', data: { started, refused } } })

	it('back up now: one result per box, a refusal or an offline box stops no other', async () => {
		const calls = {
			a: () => run([{ app: 'immich', destination: 'nas' }]),
			b: () => failure(409, { success: 409, message: 'an operating system upgrade is open' }),
			c: () => failure(503, { message: 'box offline' }),
		}
		fleetApi.relay.mockImplementation(id => calls[id]())
		const results = await runBulk(boxRows, actions.box.backupNow)
		expect(results.get('a')).toEqual({ state: 'done', message: '' })
		expect(results.get('b')).toEqual({ state: 'refused', message: 'an operating system upgrade is open' })
		expect(results.get('c')).toEqual({ state: 'offline', message: 'box offline' })
		expect(fleetApi.relay.mock.calls.map(c => c.slice(0, 3))).toEqual(boxRows.map(r => [r.id, 'post', '/v2/app_management/backup/schedules/run']))
		expect(fleetApi.relay.mock.calls[0][3]).toEqual({ data: {} })
	})

	it('back up now: a 202 with refusals is done but says which app was refused and why', async () => {
		fleetApi.relay.mockReturnValue(run([{ app: 'plex', destination: 'nas' }], [{ app: 'immich', destination: 'nas', reason: 'busy' }, { app: 'sonarr', destination: 'cloud', reason: 'already running' }]))
		const result = (await runBulk([boxRows[0]], actions.box.backupNow)).get('a')
		expect(result.state).toBe('done')
		expect(result.message).toContain('immich')
		expect(result.message).toContain('busy')
		expect(result.message).toContain('sonarr')
		expect(result.message).toContain('already running')
	})

	it('back up one couple posts the app and the destination', () => {
		fleetApi.relay.mockReturnValue(answer({}))
		actions.box.backupOne({ id: 'a' }, { app: 'immich', destination: 'nas' })
		expect(fleetApi.relay).toHaveBeenCalledWith('a', 'post', '/v2/app_management/backup/schedules/run', { data: { app: 'immich', destination: 'nas' } })
	})

	it('verify posts exactly the destination, the app and the stamp', () => {
		fleetApi.relay.mockReturnValue(answer({}))
		actions.box.verifyCouple({ id: 'a' }, { app: 'immich', destination: 'nas', stamp: '2026-11-08T03:00', extra: 'x' })
		expect(fleetApi.relay).toHaveBeenCalledWith('a', 'post', '/v2/app_management/backup/verifications', { data: { destination: 'nas', app: 'immich', stamp: '2026-11-08T03:00' } })
	})

	it('check repository encodes the destination name', () => {
		fleetApi.relay.mockReturnValue(answer({}))
		actions.box.resticCheck({ id: 'a' }, { destination: 'my nas/1' })
		expect(fleetApi.relay).toHaveBeenCalledWith('a', 'post', '/v2/app_management/backup/destinations/my%20nas%2F1/restic/check')
	})

	it('the verification schedule puts exactly the three fields, never last_run', () => {
		fleetApi.relay.mockReturnValue(answer({}))
		actions.box.setVerificationSchedule({ id: 'a' }, { enabled: true, every_days: 7, at: '03:30', last_run: 'x' })
		expect(fleetApi.relay).toHaveBeenCalledWith('a', 'put', '/v2/app_management/backup/verification-schedule', { data: { enabled: true, every_days: 7, at: '03:30' } })
	})
})
