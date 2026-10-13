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
