import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyGuard, refreshGuard, resetShareGuard, shareGuard, shareGuardApi, touchGuard } from './shareGuard.js'
import { instance } from '@/service/service.js'

vi.mock('@/service/service.js', () => {
	const answer = () => Promise.resolve({ data: { data: {} } })
	return { instance: { get: vi.fn(answer), put: vi.fn(answer), post: vi.fn(answer), delete: vi.fn(answer) } }
})

const NOW = Date.parse('2026-11-12T12:00:00Z')
const body = data => Promise.resolve({ data: { success: 200, message: 'ok', data } })

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(NOW)
	vi.clearAllMocks()
	instance.get.mockImplementation(() => body({}))
	resetShareGuard()
})
afterEach(() => {
	vi.useRealTimers()
})

describe('the protection of the shared apps', () => {
	it('reads once a minute at most, whoever asks', async () => {
		instance.get.mockImplementation(() => body({ supported: true, reset: false }))
		await Promise.all([refreshGuard(), refreshGuard()])
		expect(instance.get).toHaveBeenCalledTimes(1)
		expect(instance.get).toHaveBeenCalledWith('/v1/share/guard')
		expect(shareGuard).toMatchObject({ ok: true, view: { supported: true } })
		await refreshGuard()
		expect(instance.get).toHaveBeenCalledTimes(1)
		await refreshGuard({ force: true })
		expect(instance.get).toHaveBeenCalledTimes(2)
	})

	it('tries again sooner after a failed read, and a minute later on an old core', async () => {
		instance.get.mockImplementationOnce(() => Promise.reject(new Error('offline')))
		await refreshGuard()
		expect(shareGuard.ok).toBe(false)
		vi.setSystemTime(NOW + 16000)
		instance.get.mockImplementation(() => Promise.reject(Object.assign(new Error('404'), { response: { status: 404 } })))
		await refreshGuard()
		expect(instance.get).toHaveBeenCalledTimes(2)
		vi.setSystemTime(NOW + 30000)
		await refreshGuard()
		expect(instance.get).toHaveBeenCalledTimes(2)
		vi.setSystemTime(NOW + 77000)
		await refreshGuard()
		expect(instance.get).toHaveBeenCalledTimes(3)
	})

	it('a write puts its answer in the store', async () => {
		const data = { protection: true, apps: {} }
		expect(await applyGuard(body(data))).toEqual(data)
		expect(shareGuard).toMatchObject({ ok: true, view: data })
	})

	it('a read that started before a write does not bring an older view back', async () => {
		let settle
		instance.get.mockImplementationOnce(() => new Promise((resolve) => {
			settle = resolve
		}))
		const reading = refreshGuard({ force: true })
		await vi.waitFor(() => expect(instance.get).toHaveBeenCalled())
		const data = { protection: true }
		await applyGuard(body(data))
		settle({ data: { data: { protection: false } } })
		await reading
		expect(shareGuard.view).toEqual(data)
	})

	it('a write that does not answer with the view drops the read in flight, and a forced read reads again', async () => {
		let settle
		instance.get.mockImplementationOnce(() => new Promise((resolve) => {
			settle = resolve
		}))
		const reading = refreshGuard({ force: true })
		await vi.waitFor(() => expect(instance.get).toHaveBeenCalledTimes(1))
		touchGuard()
		instance.get.mockImplementation(() => body({ people: [1] }))
		const again = refreshGuard({ force: true })
		settle({ data: { data: { people: [] } } })
		await Promise.all([reading, again])
		expect(instance.get).toHaveBeenCalledTimes(2)
		expect(shareGuard.view).toEqual({ people: [1] })
	})

	it('a failed write keeps the view', async () => {
		const data = { protection: false }
		await applyGuard(body(data))
		const err = Object.assign(new Error('400'), { response: { status: 400 } })
		await expect(applyGuard(Promise.reject(err))).rejects.toBe(err)
		expect(shareGuard.view).toEqual(data)
	})

	it('calls the routes of the contract, encoding names, ids and keys', async () => {
		await shareGuardApi.setProtection(true)
		expect(instance.put).toHaveBeenCalledWith('/v1/share/guard/protection', { on: true })
		await shareGuardApi.setBox({ waf: 'off' })
		expect(instance.put).toHaveBeenCalledWith('/v1/share/guard/box', { waf: 'off' })
		await shareGuardApi.setApp('a b', 'code')
		expect(instance.put).toHaveBeenCalledWith('/v1/share/guard/apps/a%20b', { access: 'code', override: null })
		await shareGuardApi.addPerson('Maman', ['jellyfin'])
		expect(instance.post).toHaveBeenCalledWith('/v1/share/guard/people', { name: 'Maman', apps: ['jellyfin'] })
		await shareGuardApi.updatePerson('p/1', 'Maman', [])
		expect(instance.put).toHaveBeenCalledWith('/v1/share/guard/people/p%2F1', { name: 'Maman', apps: [] })
		await shareGuardApi.newCode('p_1')
		expect(instance.post).toHaveBeenCalledWith('/v1/share/guard/people/p_1/code')
		await shareGuardApi.deletePerson('p_1')
		expect(instance.delete).toHaveBeenCalledWith('/v1/share/guard/people/p_1')
		await shareGuardApi.events({ app: 'jellyfin', reason: 'waf', limit: 50 })
		expect(instance.get).toHaveBeenCalledWith('/v1/share/guard/events', { params: { app: 'jellyfin', reason: 'waf', limit: 50 } })
		await shareGuardApi.bans()
		expect(instance.get).toHaveBeenCalledWith('/v1/share/guard/bans')
		await shareGuardApi.unban('2001:db8::/64')
		expect(instance.delete).toHaveBeenCalledWith('/v1/share/guard/bans/2001%3Adb8%3A%3A%2F64')
	})
})
