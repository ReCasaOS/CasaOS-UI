// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/router', () => ({ default: { replace: vi.fn() } }))
vi.mock('@/store', () => ({ default: { commit: vi.fn() } }))

const { api, instance } = await import('@/service/service.js')

// An upload sends the file itself: the instance's JSON default and its minute
// of timeout must give way to what the call says.
describe('a PUT with a config of its own', () => {
	it('sends the file as it is, as octet-stream, with no timeout', async () => {
		const sent = []
		const adapter = (config) => {
			sent.push(config)
			return Promise.resolve({ status: 201, statusText: 'Created', headers: {}, config, data: { data: { name: 'a.iso' } } })
		}
		const file = new Blob(['0123'])
		const onUploadProgress = () => {}

		const res = await api.put('/v2/virt_management/images/upload?name=a.iso', file, {
			adapter,
			timeout: 0,
			headers: { 'Content-Type': 'application/octet-stream' },
			transformRequest: [data => data],
			onUploadProgress,
		})

		expect(res.data.data.name).toBe('a.iso')
		expect(sent).toHaveLength(1)
		expect(sent[0].method).toBe('put')
		expect(sent[0].timeout).toBe(0)
		expect(sent[0].headers['Content-Type']).toBe('application/octet-stream')
		expect(sent[0].data).toBe(file)
		expect(sent[0].onUploadProgress).toBe(onUploadProgress)
		// the others keep the defaults
		expect(instance.defaults.timeout).toBe(60000)
		expect(instance.defaults.headers['Content-Type']).toBe('application/json')
	})
})
