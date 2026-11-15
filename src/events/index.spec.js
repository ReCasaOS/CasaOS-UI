// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import messageBus from './index'

const { post, canWrite } = vi.hoisted(() => ({ post: vi.fn(() => Promise.resolve({})), canWrite: { value: false } }))
vi.mock('@/service/service.js', () => ({ api: { post } }))
vi.mock('@/store', () => ({
	default: {
		getters: {
			get canWrite() {
				return canWrite.value
			},
		},
	},
}))
vi.mock('@/events/message_bus.js', () => ({ default: { global_visit: vi.fn(() => Promise.resolve({ name: 'global:visit', properties: { a: '1' } })) } }))

beforeEach(() => post.mockClear())

describe('posting an event to the message bus', () => {
	it('does nothing for an account that cannot write', async () => {
		canWrite.value = false
		messageBus('global_visit')
		await new Promise(resolve => setTimeout(resolve, 0))

		expect(post).not.toHaveBeenCalled()
	})

	it('posts it for the owner', async () => {
		canWrite.value = true
		messageBus('global_visit')
		await new Promise(resolve => setTimeout(resolve, 0))

		expect(post).toHaveBeenCalledWith('/v2/message_bus/event/casaos-ui/global:visit', { a: '1' })
	})
})
