// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import sys from './sys.js'
import { instance } from './service.js'

// service.js wires its 401 interceptor to the router and the store; neither
// is exercised here.
vi.mock('@/router', () => ({ default: { replace() {} } }))
vi.mock('@/store', () => ({ default: { commit() {} } }))

// A fake adapter sees the request as XHR would, after transformRequest.
const adapter = vi.fn(config => Promise.resolve({ data: { success: 200, data: {} }, status: 200, statusText: 'OK', headers: {}, config }))
instance.defaults.adapter = adapter

const sent = () => adapter.mock.calls[0][0]

describe('anonymous statistics client', () => {
	beforeEach(() => adapter.mockClear())

	it('reads the state from the core\'s v1 sys group', async () => {
		await sys.getTelemetry()
		expect(sent().method).toBe('get')
		expect(sent().url).toBe('/v1/sys/telemetry')
	})

	it('sends only the fields it is given', async () => {
		await sys.setTelemetry({ notice_seen: true })
		expect(sent().method).toBe('put')
		expect(sent().url).toBe('/v1/sys/telemetry')
		expect(JSON.parse(sent().data)).toEqual({ notice_seen: true })
	})
})

describe('automatic update client', () => {
	beforeEach(() => adapter.mockClear())

	it('reads the view from the core\'s v1 sys group', async () => {
		await sys.getAutoUpdate()
		expect(sent().method).toBe('get')
		expect(sent().url).toBe('/v1/sys/autoupdate')
	})

	it('sends only the fields it is given', async () => {
		await sys.setAutoUpdate({ resume: true })
		expect(sent().method).toBe('put')
		expect(sent().url).toBe('/v1/sys/autoupdate')
		expect(JSON.parse(sent().data)).toEqual({ resume: true })
	})
})

describe('push alerts client', () => {
	beforeEach(() => adapter.mockClear())

	it('reads the masked view from the core\'s v1 sys group', async () => {
		await sys.getAlerts()
		expect(sent().method).toBe('get')
		expect(sent().url).toBe('/v1/sys/alerts')
	})

	it('sends only the fields it is given', async () => {
		await sys.setAlerts({ disk_threshold: 85 })
		expect(sent().method).toBe('put')
		expect(sent().url).toBe('/v1/sys/alerts')
		expect(JSON.parse(sent().data)).toEqual({ disk_threshold: 85 })
	})

	it('tests one channel', async () => {
		await sys.testAlerts({ channel_id: 'a1' })
		expect(sent().method).toBe('post')
		expect(sent().url).toBe('/v1/sys/alerts/test')
		expect(JSON.parse(sent().data)).toEqual({ channel_id: 'a1' })
	})
})
