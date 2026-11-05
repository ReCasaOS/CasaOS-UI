import { beforeEach, describe, expect, it, vi } from 'vitest'
import { logsApi, toQuery } from './logs'
import { instance } from '@/service/service.js'
import { fleetApi } from '@/service/fleet'

vi.mock('@/service/service.js', () => ({ instance: { request: vi.fn() } }))
vi.mock('@/service/fleet', () => ({ fleetApi: { relay: vi.fn() } }))

const answer = data => Promise.resolve({ status: 200, data: { data } })

beforeEach(() => {
	vi.resetAllMocks()
})

describe('logsApi', () => {
	it('apps(null) asks this box', async () => {
		instance.request.mockReturnValue(answer([{ name: 'a' }]))
		const r = await logsApi.apps(null)
		expect(instance.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'get', url: '/v2/app_management/logs/apps' }))
		expect(r).toEqual({ ok: true, status: 200, data: [{ name: 'a' }] })
	})

	it('apps(box) goes through the relay', async () => {
		fleetApi.relay.mockReturnValue(answer([]))
		const r = await logsApi.apps('b1')
		expect(fleetApi.relay).toHaveBeenCalledWith('b1', 'get', '/v2/app_management/logs/apps', expect.anything())
		await logsApi.query('b1', { app: ['a', 'b'] })
		expect(fleetApi.relay).toHaveBeenLastCalledWith('b1', 'get', '/v2/app_management/logs?app=a&app=b', expect.anything())
		expect(instance.request).not.toHaveBeenCalled()
		expect(r.ok).toBe(true)
	})

	it('query repeats array params', async () => {
		instance.request.mockReturnValue(answer({ lines: [] }))
		await logsApi.query(null, { app: ['a', 'b'], limit: 10 })
		const cfg = instance.request.mock.calls[0][0]
		expect(cfg.url).toBe('/v2/app_management/logs?app=a&app=b&limit=10')
	})

	it('a 404 gives ok false', async () => {
		instance.request.mockRejectedValue(Object.assign(new Error('Not Found'), { response: { status: 404 } }))
		expect(await logsApi.events(null, {})).toEqual({ ok: false, status: 404, error: 'Not Found' })
	})

	it('an error without a response gives status 0', async () => {
		fleetApi.relay.mockRejectedValue(new Error('boom'))
		expect(await logsApi.query('b1', {})).toEqual({ ok: false, status: 0, error: 'boom' })
	})

	it('setSettings puts the fields', async () => {
		instance.request.mockReturnValue(answer({ retention_days: 3 }))
		await logsApi.setSettings({ retention_days: 3 })
		expect(instance.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'put', url: '/v2/app_management/logs/settings', data: { retention_days: 3 } }))
	})

	it('exportUrl and streamUrl', () => {
		expect(logsApi.exportUrl({ app: ['a', 'b'], q: 'x y' })).toBe('/v2/app_management/logs/export?app=a&app=b&q=x+y')
		const u = logsApi.streamUrl({ app: ['a'] }, 't/k', { wsProtocol: 'wss:', baseURL: 'h:80' })
		expect(u).toBe('wss://h:80/v2/app_management/logs/stream?app=a&token=t%2Fk')
	})
})

describe('toQuery', () => {
	it('repeats arrays, drops empty arrays and undefined', () => {
		expect(toQuery({ app: ['a', 'b'], service: [], q: undefined, n: null, regex: false })).toBe('app=a&app=b&regex=false')
	})
})
