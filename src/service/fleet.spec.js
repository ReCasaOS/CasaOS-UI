// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SLOW_MS, fleetApi, isSlow } from './fleet'
import { instance } from '@/service/service.js'

vi.mock('@/service/service.js', () => {
	const answer = () => Promise.resolve({ data: {} })
	return { instance: { request: vi.fn(answer), get: vi.fn(answer), put: vi.fn(answer), post: vi.fn(answer), patch: vi.fn(answer), delete: vi.fn(answer) } }
})

describe('the fleet service', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('relays with the path, query and box id in the URL', async () => {
		await fleetApi.relay('b 1', 'get', '/v1/sys/os', { params: { y: 1 } })
		expect(instance.request).toHaveBeenCalledWith({ method: 'get', url: '/v1/fleet/boxes/b%201/relay/v1/sys/os', params: { y: 1 }, data: undefined, timeout: undefined })
	})

	it('sends the body as given, and a timeout of its own when asked', async () => {
		await fleetApi.relay('b', 'put', '/v2/app_management/compose/x/status', { data: '"start"', timeout: 1000 })
		expect(instance.request).toHaveBeenCalledWith({ method: 'put', url: '/v1/fleet/boxes/b/relay/v2/app_management/compose/x/status', params: undefined, data: '"start"', timeout: 1000 })
	})

	it('gives the slow routes five minutes', async () => {
		expect(SLOW_MS).toBe(300000)
		await fleetApi.relay('b', 'get', '/v1/sys/packages')
		expect(instance.request.mock.calls[0][0].timeout).toBe(300000)
		await fleetApi.relay('b', 'get', '/v2/app_management/compose/updates', { params: { check: true } })
		expect(instance.request.mock.calls[1][0].timeout).toBe(300000)
		await fleetApi.relay('b', 'get', '/v2/app_management/compose/updates')
		expect(instance.request.mock.calls[2][0].timeout).toBeUndefined()
		expect(isSlow('post', '/v2/app_management/image-updates')).toBe(true)
		expect(isSlow('GET', '/v1/sys/packages')).toBe(true)
		expect(isSlow('get', '/v1/sys/packages/update/status')).toBe(false)
		expect(isSlow('get', '/v2/app_management/compose/updates', { check: 'true' })).toBe(true)
	})

	it('builds the role routes', async () => {
		await fleetApi.status()
		expect(instance.get).toHaveBeenCalledWith('/v1/fleet')
		await fleetApi.setMaster({ enabled: true, address: 'https://m' })
		expect(instance.put).toHaveBeenCalledWith('/v1/fleet/master', { enabled: true, address: 'https://m' })
		await fleetApi.addBox({ name: 'Home', url: 'https://h', self: false })
		expect(instance.post).toHaveBeenCalledWith('/v1/fleet/boxes', { name: 'Home', url: 'https://h', self: false })
		await fleetApi.renameBox('a/b', { name: 'Shop' })
		expect(instance.patch).toHaveBeenCalledWith('/v1/fleet/boxes/a%2Fb', { name: 'Shop' })
		await fleetApi.removeBox('x')
		expect(instance.delete).toHaveBeenCalledWith('/v1/fleet/boxes/x')
		await fleetApi.rotateCode('x')
		expect(instance.post).toHaveBeenCalledWith('/v1/fleet/boxes/x/code')
		await fleetApi.join('abc')
		expect(instance.put).toHaveBeenCalledWith('/v1/fleet/member', { code: 'abc' })
		await fleetApi.leave()
		expect(instance.delete).toHaveBeenCalledWith('/v1/fleet/member')
	})
})
