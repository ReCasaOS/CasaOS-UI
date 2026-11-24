import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetAIAccess, hasAIAccess } from '@/components/AIAccess/entry'
import { instance } from '@/service/service.js'

vi.mock('@/service/service.js', () => ({ instance: { get: vi.fn() } }))
vi.mock('@/components/VirtualMachines/modalStack', () => ({ openWithEscape: vi.fn() }))

const refused = status => Promise.reject(Object.assign(new Error('refused'), { response: { status } }))

beforeEach(() => {
	forgetAIAccess()
	vi.clearAllMocks()
})

// a module that does not answer is not a module that is not there
describe('the probe of the MCP module', () => {
	it('is true where the module answers, within a bounded wait, asked once', async () => {
		instance.get.mockResolvedValue({ data: {} })
		expect(await hasAIAccess()).toBe(true)
		expect(await hasAIAccess()).toBe(true)
		expect(instance.get).toHaveBeenCalledTimes(1)
		expect(instance.get).toHaveBeenCalledWith('/v2/mcp/status', { timeout: 15000 })
	})

	it('is false where the module is not there, and not asked again', async () => {
		instance.get.mockImplementation(() => refused(404))
		expect(await hasAIAccess()).toBe(false)
		await hasAIAccess()
		expect(instance.get).toHaveBeenCalledTimes(1)
	})

	it('is null where the module did not answer, and asked again next time', async () => {
		instance.get.mockImplementation(() => Promise.reject(Object.assign(new Error('timeout of 15000ms exceeded'), { code: 'ECONNABORTED' })))
		expect(await hasAIAccess()).toBe(null)
		instance.get.mockImplementation(() => refused(503))
		expect(await hasAIAccess()).toBe(null)
		instance.get.mockImplementation(() => refused(403))
		expect(await hasAIAccess()).toBe(null)
		instance.get.mockResolvedValue({ data: {} })
		expect(await hasAIAccess()).toBe(true)
		expect(instance.get).toHaveBeenCalledTimes(4)
	})

	it('asks again once the modules changed', async () => {
		instance.get.mockImplementation(() => refused(404))
		expect(await hasAIAccess()).toBe(false)
		forgetAIAccess()
		instance.get.mockResolvedValue({ data: {} })
		expect(await hasAIAccess()).toBe(true)
	})
})
