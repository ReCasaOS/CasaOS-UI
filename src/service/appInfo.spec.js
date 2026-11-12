import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/service/service.js', () => ({ api: { get } }))

let appInfo

beforeEach(async () => {
	vi.resetModules()
	get.mockReset()
	appInfo = (await import('./appInfo.js')).default
})

describe('appInfo supports', () => {
	it('is true for a feature the box lists', async () => {
		get.mockResolvedValue({ data: { architecture: 'amd64', features: ['labels'] } })
		expect(await appInfo.supports('labels')).toBe(true)
		expect(get).toHaveBeenCalledWith('/v2/app_management/info')
	})

	it('is false for a box that lists none, and asks once', async () => {
		get.mockResolvedValue({ data: { architecture: 'amd64' } })
		expect(await appInfo.supports('labels')).toBe(false)
		expect(await appInfo.supports('labels')).toBe(false)
		expect(get).toHaveBeenCalledTimes(1)
	})

	it('is false when the box does not answer, and asks again next time', async () => {
		get.mockRejectedValueOnce(new Error('offline'))
		expect(await appInfo.supports('labels')).toBe(false)
		get.mockResolvedValue({ data: { features: ['labels'] } })
		expect(await appInfo.supports('labels')).toBe(true)
		expect(get).toHaveBeenCalledTimes(2)
	})
})
