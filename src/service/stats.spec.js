import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STATS_SOURCES, statsApi } from './stats.js'

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }))
vi.mock('@/service/service.js', () => ({ api: { get, put } }))

beforeEach(() => {
	get.mockReset().mockResolvedValue({ data: {} })
	put.mockReset().mockResolvedValue({ data: {} })
})

describe('routes', () => {
	it('lists the three sources', () => {
		expect(STATS_SOURCES).toEqual(['app_management', 'virt_management', 'core'])
	})

	it('list calls the route of each source', async () => {
		await statsApi.list('core')
		expect(get).toHaveBeenLastCalledWith('/sys/stats')
		await statsApi.list('app_management')
		expect(get).toHaveBeenLastCalledWith('/v2/app_management/stats')
		await statsApi.list('virt_management')
		expect(get).toHaveBeenLastCalledWith('/v2/virt_management/stats')
	})

	it('series encodes the id and sends the range', async () => {
		await statsApi.series('app_management', 'app:jellyfin:web:1', '7d')
		expect(get).toHaveBeenCalledWith('/v2/app_management/stats/app%3Ajellyfin%3Aweb%3A1', { range: '7d' })
	})

	it('alerts and setAlerts', async () => {
		await statsApi.alerts('virt_management', 'vm1')
		expect(get).toHaveBeenCalledWith('/v2/virt_management/stats/vm1/alerts')
		const rules = [{ key: 'cpu_high' }]
		await statsApi.setAlerts('virt_management', 'vm1', rules)
		expect(put).toHaveBeenCalledWith('/v2/virt_management/stats/vm1/alerts', { rules })
	})
})

describe('unwrapping', () => {
	it('v2 sources give the bare body', async () => {
		get.mockResolvedValue({ data: { items: [1], notes: [] } })
		expect(await statsApi.list('app_management')).toEqual({ items: [1], notes: [] })
		expect(await statsApi.list('virt_management')).toEqual({ items: [1], notes: [] })
	})

	it('core gives data.data', async () => {
		get.mockResolvedValue({ data: { success: 200, message: 'ok', data: { items: [] } } })
		expect(await statsApi.list('core')).toEqual({ items: [] })
	})

	it('core with a bare body gives null', async () => {
		get.mockResolvedValue({ data: { items: [] } })
		expect(await statsApi.list('core')).toBeNull()
	})

	it('a body that is not an object gives null', async () => {
		for (const body of ['x', 3, null, undefined, [1]]) {
			get.mockResolvedValue({ data: body })
			expect(await statsApi.list('app_management')).toBeNull()
		}
		get.mockResolvedValue({ data: { data: 'x' } })
		expect(await statsApi.list('core')).toBeNull()
	})
})

describe('guards', () => {
	it.each(['', '.', '..', 42, null])('rejects id %j', (id) => {
		expect(() => statsApi.series('core', id, 'live')).toThrow('not one segment of a route')
		expect(() => statsApi.alerts('core', id)).toThrow('not one segment of a route')
		expect(() => statsApi.setAlerts('core', id, [])).toThrow('not one segment of a route')
	})

	it('encodes a slash as one segment', () => {
		statsApi.series('core', 'a/b', 'live')
		expect(get).toHaveBeenCalledWith('/sys/stats/a%2Fb', { range: 'live' })
	})

	it('rejects an unknown range and an unknown source', () => {
		expect(() => statsApi.series('core', 'x', '1y')).toThrow('unknown range')
		expect(() => statsApi.list('nope')).toThrow('unknown source')
		expect(() => statsApi.series('nope', 'x', 'live')).toThrow('unknown source')
	})
})
