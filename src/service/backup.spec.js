// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import backup from './backup.js'
import { instance } from './service.js'

// service.js wires its 401 interceptor to the router and the store; neither
// is exercised here.
vi.mock('@/router', () => ({ default: { replace() {} } }))
vi.mock('@/store', () => ({ default: { commit() {} } }))

const adapter = vi.fn(config => Promise.resolve({ data: { data: {} }, status: 200, statusText: 'OK', headers: {}, config }))
instance.defaults.adapter = adapter

const body = () => JSON.parse(adapter.mock.calls[0][0].data)

describe('saving a destination', () => {
	beforeEach(() => adapter.mockClear())

	it('sends the root without the spaces around it', async () => {
		await backup.saveDestination('offsite', 's3', {}, false, '', ' my-bucket ')
		expect(body().root).toBe('my-bucket')
	})

	it('sends no root when none was given, so the box keeps its own default', async () => {
		await backup.saveDestination('offsite', 's3', {})
		await backup.saveDestination('nas', 'sftp', {}, false, '', '   ')
		expect(body()).not.toHaveProperty('root')
		expect(JSON.parse(adapter.mock.calls[1][0].data)).not.toHaveProperty('root')
	})
})
