import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetAIAccess, hasAIAccess } from '@/components/AIAccess/entry'
import { mcpApi } from '@/service/mcp'

vi.mock('@/service/mcp', () => ({ mcpApi: { status: vi.fn() } }))

const refusal = code => Promise.reject(Object.assign(new Error(String(code)), { response: { status: code } }))

beforeEach(() => {
	vi.clearAllMocks()
	forgetAIAccess()
})

describe('the AI access card of the app grid', () => {
	it('is there where the module answers, asked once', async () => {
		mcpApi.status.mockResolvedValue({ data: {} })
		expect(await hasAIAccess()).toBe(true)
		expect(await hasAIAccess()).toBe(true)
		expect(mcpApi.status).toHaveBeenCalledTimes(1)
	})

	it('is not there when the module answers 404, and the box is not asked again', async () => {
		mcpApi.status.mockImplementation(() => refusal(404))
		expect(await hasAIAccess()).toBe(false)
		expect(await hasAIAccess()).toBe(false)
		expect(mcpApi.status).toHaveBeenCalledTimes(1)
	})

	it('is not there on another refusal, and asks again next time', async () => {
		mcpApi.status.mockImplementation(() => refusal(503))
		expect(await hasAIAccess()).toBe(false)
		await hasAIAccess()
		expect(mcpApi.status).toHaveBeenCalledTimes(2)
	})

	it('asks again once the modules changed', async () => {
		mcpApi.status.mockImplementation(() => refusal(404))
		expect(await hasAIAccess()).toBe(false)
		forgetAIAccess()
		mcpApi.status.mockResolvedValue({ data: {} })
		expect(await hasAIAccess()).toBe(true)
	})
})
