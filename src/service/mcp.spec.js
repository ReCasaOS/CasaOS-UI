import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mcpApi } from './mcp.js'
import { instance } from '@/service/service.js'

vi.mock('@/service/service.js', () => {
	const answer = () => Promise.resolve({ data: {} })
	return { instance: { get: vi.fn(answer), post: vi.fn(answer), delete: vi.fn(answer) } }
})

beforeEach(() => vi.clearAllMocks())

describe('the tokens of the MCP module', () => {
	it('reads the status and the tokens from the module\'s routes', async () => {
		await mcpApi.status()
		await mcpApi.tokens()
		expect(instance.get.mock.calls).toEqual([['/v2/mcp/status'], ['/v2/mcp/tokens']])
		await mcpApi.status({ timeout: 15000 })
		expect(instance.get).toHaveBeenLastCalledWith('/v2/mcp/status', { timeout: 15000 })
	})

	it('creates a token with the name and the level it is given', async () => {
		await mcpApi.create('Laptop', 'full')
		expect(instance.post).toHaveBeenCalledWith('/v2/mcp/tokens', { name: 'Laptop', level: 'full' })
	})

	it('revokes a token by its id, escaped in the path', async () => {
		await mcpApi.revoke('a1b2 c3/d4')
		expect(instance.delete).toHaveBeenCalledWith('/v2/mcp/tokens/a1b2%20c3%2Fd4')
	})

	it('hands back the error of a refusal so that the caller reads its status', async () => {
		instance.delete.mockRejectedValueOnce(Object.assign(new Error('boom'), { response: { status: 500, data: { message: 'the revocation could not be saved: the token still works' } } }))
		await expect(mcpApi.revoke('a1')).rejects.toMatchObject({ response: { status: 500 } })
	})
})
