import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { followRescan, refresh, resetVulnScan, vulnScan, vulnScanApi } from './vulnScan.js'
import { instance } from '@/service/service.js'

vi.mock('@/service/service.js', () => {
	const answer = () => Promise.resolve({ data: { data: [] } })
	return { instance: { get: vi.fn(answer), post: vi.fn(answer) } }
})

const NOW = Date.parse('2026-11-24T06:00:00Z')
const body = data => Promise.resolve({ data: { data } })
const gone = () => Promise.reject(Object.assign(new Error('not found'), { response: { status: 404 } }))

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(NOW)
	vi.clearAllMocks()
	instance.get.mockImplementation(() => body([]))
	resetVulnScan()
})
afterEach(() => {
	vi.useRealTimers()
})

describe('the vulnerability scans of this box', () => {
	it('reads the apps once in five minutes at most, whoever asks, and keeps them by name', async () => {
		instance.get.mockImplementation(() => body([
			{ app: 'vaultwarden', loose: false, critical: 4, high: 117, actionable: true, os_only: false, skipped: '' },
			{ app: 'mailpit', loose: false, critical: 0, high: 0, actionable: false, os_only: false, skipped: '' },
		]))
		await Promise.all([refresh(), refresh()])
		expect(instance.get).toHaveBeenCalledTimes(1)
		expect(instance.get).toHaveBeenCalledWith('/v2/vuln_scan/apps')
		expect(vulnScan.ok).toBe(true)
		expect(vulnScan.apps.vaultwarden).toMatchObject({ critical: 4, high: 117, actionable: true })
		expect(vulnScan.apps.mailpit).toMatchObject({ critical: 0, actionable: false })

		vi.setSystemTime(NOW + 4 * 60000)
		await refresh()
		expect(instance.get).toHaveBeenCalledTimes(1)
		vi.setSystemTime(NOW + 5 * 60000)
		await refresh()
		expect(instance.get).toHaveBeenCalledTimes(2)
		await refresh({ force: true })
		expect(instance.get).toHaveBeenCalledTimes(3)
	})

	it('leaves out a container made by hand: it may carry the name of an app', async () => {
		instance.get.mockImplementation(() => body([
			{ app: 'redis', loose: true, critical: 9, high: 0, actionable: false },
			{ app: 'redis', loose: false, critical: 0, high: 1, actionable: false },
		]))
		await refresh()
		expect(vulnScan.apps.redis).toMatchObject({ critical: 0, high: 1 })
	})

	it('shows nothing on a box without the module', async () => {
		instance.get.mockImplementation(gone)
		await refresh()
		expect(vulnScan).toMatchObject({ ok: false, apps: {} })
	})

	it('shows nothing when the answer is not a list of apps', async () => {
		for (const data of [null, 'x', { app: 'vaultwarden' }, [null, 3, { critical: 1 }, { app: '__proto__', critical: 1 }]]) {
			resetVulnScan()
			instance.get.mockImplementation(() => body(data))
			await refresh()
			expect(Object.keys(vulnScan.apps)).toEqual([])
		}
	})

	it('drops what it showed when the module stops answering', async () => {
		instance.get.mockImplementation(() => body([{ app: 'vaultwarden', loose: false, critical: 4, high: 0, actionable: true }]))
		await refresh()
		instance.get.mockImplementation(gone)
		await refresh({ force: true })
		expect(vulnScan).toMatchObject({ ok: false, apps: {} })
	})

	// the module scans by itself when an app runs a new image, a little after the update is over
	describe('after an app was installed, updated or removed', () => {
		let lastRun, running, apps
		const calls = path => instance.get.mock.calls.filter(([url]) => url === path).length
		beforeEach(async () => {
			lastRun = '2026-11-24T05:31:00Z'
			running = false
			apps = [{ app: 'jellyfin', loose: false, critical: 2, high: 0, actionable: true }]
			instance.get.mockImplementation(url => body(url.endsWith('/status') ? { running, last_run: lastRun } : apps))
			await refresh()
			instance.get.mockClear()
		})

		it('reads the apps at once, then again when the scan that follows is over', async () => {
			const done = followRescan()
			await vi.advanceTimersByTimeAsync(0)
			expect(calls('/v2/vuln_scan/apps')).toBe(1)

			// the module has not started yet: the old scan is not the one waited for
			await vi.advanceTimersByTimeAsync(10000)
			expect(calls('/v2/vuln_scan/apps')).toBe(1)

			running = true
			await vi.advanceTimersByTimeAsync(10000)
			expect(calls('/v2/vuln_scan/apps')).toBe(1)

			apps = [{ app: 'jellyfin', loose: false, critical: 0, high: 0, actionable: false }]
			running = false
			lastRun = '2026-11-24T06:02:00Z'
			await vi.advanceTimersByTimeAsync(10000)
			await done
			expect(calls('/v2/vuln_scan/apps')).toBe(2)
			expect(vulnScan.apps.jellyfin).toMatchObject({ critical: 0, actionable: false })

			const asked = calls('/v2/vuln_scan/status')
			await vi.advanceTimersByTimeAsync(60000)
			expect(calls('/v2/vuln_scan/status')).toBe(asked)
		})

		it('gives up after three minutes when no scan follows', async () => {
			const done = followRescan()
			await vi.advanceTimersByTimeAsync(180000)
			await done
			const asked = calls('/v2/vuln_scan/status')
			expect(asked).toBeLessThanOrEqual(20)
			await vi.advanceTimersByTimeAsync(60000)
			expect(calls('/v2/vuln_scan/status')).toBe(asked)
			expect(calls('/v2/vuln_scan/apps')).toBe(1)
		})

		it('waits for a scan that runs, however long a large image takes', async () => {
			const done = followRescan()
			running = true
			await vi.advanceTimersByTimeAsync(10 * 60000)
			running = false
			lastRun = '2026-11-24T06:12:00Z'
			await vi.advanceTimersByTimeAsync(10000)
			await done
			expect(calls('/v2/vuln_scan/apps')).toBe(2)
		})

		it('asks nothing of a box without the module', async () => {
			resetVulnScan()
			await followRescan()
			await vi.advanceTimersByTimeAsync(60000)
			expect(instance.get).not.toHaveBeenCalled()
		})

		it('waits once when two apps change one after the other', async () => {
			followRescan()
			await vi.advanceTimersByTimeAsync(0)
			followRescan()
			await vi.advanceTimersByTimeAsync(0)
			const asked = calls('/v2/vuln_scan/status')
			await vi.advanceTimersByTimeAsync(10000)
			expect(calls('/v2/vuln_scan/status')).toBe(asked + 1)
		})
	})

	it('asks for one app by its name, whatever is in it', async () => {
		await vulnScanApi.app('my app/../x')
		expect(instance.get).toHaveBeenCalledWith('/v2/vuln_scan/apps/my%20app%2F..%2Fx')
		await vulnScanApi.status()
		expect(instance.get).toHaveBeenCalledWith('/v2/vuln_scan/status')
		await vulnScanApi.scan()
		expect(instance.post).toHaveBeenCalledWith('/v2/vuln_scan/scan')
	})
})
