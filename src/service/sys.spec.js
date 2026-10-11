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

describe('docker update client', () => {
	beforeEach(() => adapter.mockClear())

	it('lists the running containers from the core\'s v1 sys group', async () => {
		await sys.getDockerContainers()
		expect(sent().method).toBe('get')
		expect(sent().url).toBe('/v1/sys/docker/containers')
	})

	it('starts the update with the plan it was shown, and nothing else', async () => {
		await sys.startDockerUpdate({ plan_id: 'ab'.repeat(32) })
		expect(sent().method).toBe('post')
		expect(sent().url).toBe('/v1/sys/docker/update')
		expect(JSON.parse(sent().data)).toEqual({ plan_id: 'ab'.repeat(32) })
	})

	it('carries the confirmation of a hold when it is given, as it is given', async () => {
		await sys.startDockerUpdate({ plan_id: 'ab'.repeat(32), allow_held: true })
		expect(sent().url).toBe('/v1/sys/docker/update')
		expect(JSON.parse(sent().data)).toEqual({ plan_id: 'ab'.repeat(32), allow_held: true })
	})

	it('reads the status from its own route, not the generic package one', async () => {
		await sys.getDockerUpdateStatus()
		expect(sent().method).toBe('get')
		expect(sent().url).toBe('/v1/sys/docker/update/status')
	})
})

describe('operating system client', () => {
	beforeEach(() => adapter.mockClear())

	it('reads the support state from the core\'s v1 sys group, and sends nothing', async () => {
		await sys.getOs()
		expect(sent().method).toBe('get')
		expect(sent().url).toBe('/v1/sys/os')
		expect(sent().data).toBeUndefined()
	})

	// The core answers within 20 seconds (its checks run in parallel, with a budget), so the
	// call waits 30 and not the 60 of the shared client.
	it('asks whether the machine can be upgraded from its own route, sends nothing, and waits 30 seconds', async () => {
		await sys.getOsReadiness()
		expect(sent().method).toBe('get')
		expect(sent().url).toBe('/v1/sys/os/readiness')
		expect(sent().data).toBeUndefined()
		expect(sent().timeout).toBe(30000)
	})
})
