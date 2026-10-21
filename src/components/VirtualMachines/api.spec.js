// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const http = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
vi.mock('@/service/service.js', () => ({ api: http }))

const { default: vmApi } = await import('./api')

// An id comes from the message bus as well as from the service, and the bus is
// any signed-in user's: it must stay one segment of the route, however it is made.
const ODD = 'a/../b?c#d'
const SAFE = 'a%2F..%2Fb%3Fc%23d'
const P = '/v2/virt_management'

describe('the routes of the virtual machine service', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	// [call, the method of the client it goes through, the route]
	const routes = [
		[() => vmApi.get(ODD), 'get', `${P}/vms/${SAFE}`],
		[() => vmApi.update(ODD, {}), 'patch', `${P}/vms/${SAFE}`],
		[() => vmApi.remove(ODD, true), 'delete', `${P}/vms/${SAFE}?delete_disks=true`],
		[() => vmApi.action(ODD, 'force-off'), 'post', `${P}/vms/${SAFE}/force-off`],
		[() => vmApi.action('vm-1', ODD), 'post', `${P}/vms/vm-1/${SAFE}`],
		[() => vmApi.setCDROM(ODD, ''), 'put', `${P}/vms/${SAFE}/cdrom`],
		[() => vmApi.addDisk(ODD, 8), 'post', `${P}/vms/${SAFE}/disks`],
		[() => vmApi.resizeDisk(ODD, ODD, 8), 'patch', `${P}/vms/${SAFE}/disks/${SAFE}`],
		[() => vmApi.removeDisk(ODD, ODD, false), 'delete', `${P}/vms/${SAFE}/disks/${SAFE}?delete_file=false`],
		[() => vmApi.setPorts(ODD, []), 'put', `${P}/vms/${SAFE}/ports`],
		[() => vmApi.setUSB(ODD, []), 'put', `${P}/vms/${SAFE}/usb`],
		[() => vmApi.createSnapshot(ODD, 'before'), 'post', `${P}/vms/${SAFE}/snapshots`],
		[() => vmApi.revertSnapshot(ODD, ODD), 'post', `${P}/vms/${SAFE}/snapshots/${SAFE}/revert`],
		[() => vmApi.deleteSnapshot(ODD, ODD), 'delete', `${P}/vms/${SAFE}/snapshots/${SAFE}`],
		[() => vmApi.deleteDownload(ODD), 'delete', `${P}/images/downloads/${SAFE}`],
	]

	it.each(routes)('keeps an odd id to its own segment (%#)', (call, method, route) => {
		call()
		expect(http[method]).toHaveBeenCalledTimes(1)
		expect(http[method].mock.calls[0][0]).toBe(route)
	})

	// A browser takes a dot segment out of a route before it is sent, and so the
	// id is another route: no encoding keeps "." or ".." to one segment.
	const DOTS = ['.', '..', '...']
	const calls = [
		id => vmApi.get(id),
		id => vmApi.remove(id, false),
		id => vmApi.action(id, 'start'),
		id => vmApi.action('vm-1', id),
		id => vmApi.resizeDisk('vm-1', id, 8),
		id => vmApi.deleteSnapshot('vm-1', id),
		id => vmApi.deleteDownload(id),
		id => vmApi.consoleURL('ws:', id),
	]

	it.each(DOTS)('does not make a route of the id %j', (id) => {
		for (const call of calls) {
			expect(() => call(id)).toThrow()
		}
		for (const method of Object.values(http)) {
			expect(method).not.toHaveBeenCalled()
		}
	})

	// encoded, the percent sign is not one: it stays text of the segment
	it.each([['%2e', '%252e'], ['%2e%2e', '%252e%252e'], ['.%2e', '.%252e'], ['a..', 'a..']])('keeps the id %j as one segment, %j', (id, segment) => {
		vmApi.get(id)
		expect(http.get).toHaveBeenCalledWith(`${P}/vms/${segment}`)
	})

	it('leaves the ids the service makes as they are', () => {
		vmApi.get('3f2b8c1e-5d4a-4e7b-9a10-6c2d8e4f1a7b')
		vmApi.resizeDisk('vm-1', 'vda', 8)
		expect(http.get).toHaveBeenCalledWith(`${P}/vms/3f2b8c1e-5d4a-4e7b-9a10-6c2d8e4f1a7b`)
		expect(http.patch).toHaveBeenCalledWith(`${P}/vms/vm-1/disks/vda`, { size_gib: 8 })
	})

	it('keeps the id of the console to its own segment too', () => {
		localStorage.setItem('access_token', 'a b')
		expect(vmApi.consoleURL('ws:', ODD)).toBe(`ws://${window.location.host}${P}/vms/${SAFE}/console?token=a%20b`)
	})
})

// The file itself is the body: no JSON, no form, no timeout, and a way to stop it.
describe('the upload of an image', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('puts the raw file with its name, octet-stream, no timeout, the signal and the progress', async () => {
		const file = new File(['abcd'], 'a b&c.iso')
		const signal = new AbortController().signal
		const onProgress = vi.fn()
		const image = { path: '/DATA/VM/iso/a b&c.iso', name: 'a b&c.iso', kind: 'iso', size_bytes: 4 }
		http.put.mockResolvedValue({ status: 201, data: { data: image } })

		await expect(vmApi.uploadImage(file, { sha256: 'ab'.repeat(32), onProgress, signal })).resolves.toEqual(image)

		const [url, body, config] = http.put.mock.calls[0]
		expect(url).toBe(`${P}/images/upload?name=a+b%26c.iso&sha256=${'ab'.repeat(32)}`)
		expect(body).toBe(file)
		expect(config).toMatchObject({ timeout: 0, headers: { 'Content-Type': 'application/octet-stream' }, signal })
		expect(config.transformRequest.reduce((data, f) => f(data), file)).toBe(file)

		// what the browser reports, as what the dialog needs
		config.onUploadProgress({ loaded: 2, total: 4 })
		config.onUploadProgress({ loaded: 3, total: 0 })
		expect(onProgress.mock.calls).toEqual([[{ loaded: 2, total: 4 }], [{ loaded: 3, total: 4 }]])
	})

	it('leaves the checksum out when there is none', async () => {
		http.put.mockResolvedValue({ status: 201, data: { data: {} } })
		await vmApi.uploadImage(new File([''], 'x.qcow2'))
		expect(http.put.mock.calls[0][0]).toBe(`${P}/images/upload?name=x.qcow2`)
	})
})

// The route asked with no body: what the module answers says whether it takes files.
describe('the probe of the upload route', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('puts nothing to the same route, with the same name and checksum, and the signal', async () => {
		const signal = new AbortController().signal
		http.put.mockRejectedValue(Object.assign(new Error('411'), { response: { status: 411, data: { message: 'length_required' } } }))

		await expect(vmApi.probeUpload('a b&c.iso', { sha256: 'ab'.repeat(32), signal })).rejects.toMatchObject({ response: { status: 411 } })

		const [url, body, config] = http.put.mock.calls[0]
		expect(url).toBe(`${P}/images/upload?name=a+b%26c.iso&sha256=${'ab'.repeat(32)}`)
		expect(body).toBeNull()
		expect(config).toMatchObject({ headers: { 'Content-Type': 'application/octet-stream' }, signal })
		expect(config.transformRequest.reduce((data, f) => f(data), null)).toBeNull()
	})
})
