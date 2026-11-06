import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetLogs, hasLogs } from './entry'
import { logsApi } from '@/service/logs'

vi.mock('@/service/logs', () => ({ logsApi: { settings: vi.fn() } }))
vi.mock('@/components/VirtualMachines/modalStack', () => ({ openWithEscape: vi.fn() }))
vi.mock('@/mixins/app/appLaunchPreference', () => ({ LOGS_LAUNCH_ID: 'casaos:logs', builtinOpensInNewTab: () => false }))

describe('hasLogs', () => {
	beforeEach(() => {
		forgetLogs()
		logsApi.settings.mockReset()
	})

	it('is true where AppManagement answers the settings, and asks once', async () => {
		logsApi.settings.mockResolvedValue({ ok: true, status: 200, data: {} })
		expect(await hasLogs()).toBe(true)
		expect(await hasLogs()).toBe(true)
		expect(logsApi.settings).toHaveBeenCalledTimes(1)
	})

	// an AppManagement older than the feature: nothing new is shown, and it is not asked again
	it('is false on a 404, without asking again', async () => {
		logsApi.settings.mockResolvedValue({ ok: false, status: 404 })
		expect(await hasLogs()).toBe(false)
		expect(await hasLogs()).toBe(false)
		expect(logsApi.settings).toHaveBeenCalledTimes(1)
	})

	it('is false on a network error, and asks again next time', async () => {
		logsApi.settings.mockResolvedValueOnce({ ok: false, status: 0 }).mockResolvedValueOnce({ ok: true, status: 200 })
		expect(await hasLogs()).toBe(false)
		expect(await hasLogs()).toBe(true)
		expect(logsApi.settings).toHaveBeenCalledTimes(2)
	})
})
