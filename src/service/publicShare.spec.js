import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apply, publicShare, publicShareApi, refresh, resetPublicShare } from './publicShare.js'
import { RELAY_MS } from '@/service/fleet.js'
import { instance } from '@/service/service.js'

vi.mock('@/service/service.js', () => {
	const answer = () => Promise.resolve({ data: { data: {} } })
	return { instance: { get: vi.fn(answer), put: vi.fn(answer), delete: vi.fn(answer) } }
})

const NOW = Date.parse('2026-11-10T12:00:00Z')
const body = data => Promise.resolve({ data: { success: 200, message: 'ok', data } })

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(NOW)
	vi.clearAllMocks()
	instance.get.mockImplementation(() => body({}))
	resetPublicShare()
})
afterEach(() => {
	vi.useRealTimers()
})

describe('the public sharing of this box', () => {
	it('reads the status once a minute at most, whoever asks', async () => {
		instance.get.mockImplementation(() => body({ supported: true, apps: [] }))
		await Promise.all([refresh(), refresh()])
		expect(instance.get).toHaveBeenCalledTimes(1)
		expect(instance.get).toHaveBeenCalledWith('/v1/share')
		expect(publicShare).toMatchObject({ ok: true, status: { supported: true } })
		await refresh()
		expect(instance.get).toHaveBeenCalledTimes(1)
		await refresh({ force: true })
		expect(instance.get).toHaveBeenCalledTimes(2)
	})

	it('tries again sooner after a failed read', async () => {
		instance.get.mockImplementationOnce(() => Promise.reject(new Error('offline')))
		await refresh()
		expect(publicShare.ok).toBe(false)
		vi.setSystemTime(NOW + 16000)
		instance.get.mockImplementation(() => body({ apps: [] }))
		await refresh()
		expect(publicShare.ok).toBe(true)
	})

	it('an old core', async () => {
		instance.get.mockImplementation(() => body({ apps: [] }))
		await refresh()
		instance.get.mockImplementation(() => Promise.reject(Object.assign(new Error('404'), { response: { status: 404 } })))
		await refresh({ force: true })
		expect(publicShare).toMatchObject({ ok: false, status: null })
		vi.setSystemTime(NOW + 30000)
		await refresh()
		expect(instance.get).toHaveBeenCalledTimes(2)
		vi.setSystemTime(NOW + 61000)
		await refresh()
		expect(instance.get).toHaveBeenCalledTimes(3)
	})

	it('a write puts its answer in the store', async () => {
		const data = { name: 'mybox', apps: [{ name: 'jellyfin', shared: true }] }
		expect(await apply(body(data))).toEqual(data)
		expect(publicShare).toMatchObject({ ok: true, status: data })
	})

	it('a failed write keeps the status', async () => {
		const data = { name: 'mybox', apps: [] }
		await apply(body(data))
		const err = Object.assign(new Error('409'), { response: { status: 409 } })
		await expect(apply(Promise.reject(err))).rejects.toBe(err)
		expect(publicShare.status).toEqual(data)
	})

	it('sends the name with the terms accepted', async () => {
		await publicShareApi.setName('mybox')
		expect(instance.put).toHaveBeenCalledWith('/v1/share/name', { name: 'mybox', accept_tos: true }, { timeout: RELAY_MS })
	})

	it('encodes the app name', async () => {
		await publicShareApi.share('a b')
		expect(instance.put).toHaveBeenCalledWith('/v1/share/apps/a%20b', undefined, { timeout: RELAY_MS })
		await publicShareApi.unshare('a b')
		expect(instance.delete).toHaveBeenCalledWith('/v1/share/apps/a%20b')
		await publicShareApi.stopAll()
		expect(instance.delete).toHaveBeenCalledWith('/v1/share/apps')
		await publicShareApi.status()
		expect(instance.get).toHaveBeenCalledWith('/v1/share')
	})
})
