// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import gitApps from './gitApps.js'
import { instance } from './service.js'

// service.js wires its 401 interceptor to the router and the store; neither
// is exercised here.
vi.mock('@/router', () => ({ default: { replace() {} } }))
vi.mock('@/store', () => ({ default: { commit() {} } }))

// A fake adapter sees the request as XHR would, after transformRequest.
const adapter = vi.fn(config => Promise.resolve({ data: { data: {} }, status: 200, statusText: 'OK', headers: {}, config }))
instance.defaults.adapter = adapter

const sent = () => adapter.mock.calls[0][0]

const COMMIT = 'a'.repeat(40)

describe('gitApps client', () => {
	beforeEach(() => adapter.mockClear())

	it.each([
		[() => gitApps.create({ name: 'jarvis', url: 'https://example.com/jarvis.git', access: 'none' }), 'post', '/v2/app_management/git'],
		[() => gitApps.get('jarvis'), 'get', '/v2/app_management/git/jarvis'],
		[() => gitApps.update('jarvis', { auto_deploy: true }), 'put', '/v2/app_management/git/jarvis'],
		[() => gitApps.check('jarvis'), 'post', '/v2/app_management/git/jarvis/check'],
		[() => gitApps.deploy('jarvis'), 'post', '/v2/app_management/git/jarvis/deploy'],
		[() => gitApps.remove('jarvis'), 'delete', '/v2/app_management/git/jarvis'],
	])('%# sends the method and the URL of the contract', async (call, method, url) => {
		await call()
		expect(sent().method).toBe(method)
		expect(sent().url).toBe(url)
	})

	it('sends the registration as JSON, leaving out what was not given', async () => {
		await gitApps.create({ name: 'jarvis', url: 'https://example.com/jarvis.git', branch: undefined, access: 'key', token: undefined })
		expect(JSON.parse(sent().data)).toEqual({ name: 'jarvis', url: 'https://example.com/jarvis.git', access: 'key' })
	})

	it('sends a revert as the commit to deploy', async () => {
		await gitApps.deploy('jarvis', { commit: COMMIT })
		expect(JSON.parse(sent().data)).toEqual({ commit: COMMIT })
	})

	it('starts a check with no body, under the shared timeout: it answers as it starts', async () => {
		await gitApps.check('jarvis')
		expect(sent().data).toBeUndefined()
		expect(sent().timeout).toBe(60000)
	})

	it('escapes the app name in the path', async () => {
		await gitApps.get('a b')
		expect(sent().url).toBe('/v2/app_management/git/a%20b')
	})
})
