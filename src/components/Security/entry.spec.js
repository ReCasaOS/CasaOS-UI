import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetSecurity, hasSecurity } from './entry'
import { instance } from '@/service/service.js'

vi.mock('@/service/service.js', () => ({ instance: { get: vi.fn() } }))
vi.mock('@/components/VirtualMachines/modalStack', () => ({ openWithEscape: vi.fn() }))

const refused = status => Promise.reject(Object.assign(new Error('refused'), { response: { status } }))

beforeEach(() => {
	forgetSecurity()
	vi.clearAllMocks()
})

// A module held up by a scan used to read as no module: the Security card stayed away until a reload.
describe('the probe of the vulnerability scan module', () => {
	it('is true where the module answers, within a bounded wait', async () => {
		instance.get.mockResolvedValue({ data: { data: {} } })
		expect(await hasSecurity()).toBe(true)
		expect(instance.get).toHaveBeenCalledWith('/v2/vuln_scan/status', { timeout: 15000 })
	})

	it('is false where the module is not there, and not asked again', async () => {
		instance.get.mockImplementation(() => refused(404))
		expect(await hasSecurity()).toBe(false)
		await hasSecurity()
		expect(instance.get).toHaveBeenCalledTimes(1)
	})

	it('is null where the module did not answer, and asked again next time', async () => {
		instance.get.mockImplementation(() => Promise.reject(Object.assign(new Error('timeout of 15000ms exceeded'), { code: 'ECONNABORTED' })))
		expect(await hasSecurity()).toBe(null)
		instance.get.mockImplementation(() => refused(503))
		expect(await hasSecurity()).toBe(null)
		instance.get.mockResolvedValue({ data: { data: {} } })
		expect(await hasSecurity()).toBe(true)
		expect(instance.get).toHaveBeenCalledTimes(3)
	})
})
