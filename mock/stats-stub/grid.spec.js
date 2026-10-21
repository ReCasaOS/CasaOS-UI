import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { handleGrid, newGridState } from './grid.js'

// What the dashboard asks of a box to draw its home page, its app grid and the
// virtual machine tiles, in the shapes the services answer with.
const ask = (method, path, body = null, state = newGridState()) => handleGrid({ method, path, body }, state)

describe('the stub of the virtual machine module', () => {
	it('answers the probe with a host that has libvirt', () => {
		const { status, body } = ask('GET', '/v2/virt_management/host')

		expect(status).toBe(200)
		expect(body.data).toMatchObject({ libvirt: 'available', kvm: true, network: 'casaos', storage_path: '/DATA/VM' })
	})

	it('lists three VMs, running, shut off and paused, one with a hostile title', () => {
		const { status, body } = ask('GET', '/v2/virt_management/vms')

		expect(status).toBe(200)
		expect(body.data.map(vm => vm.state)).toEqual(['running', 'shut-off', 'paused'])
		expect(body.data.map(vm => vm.title)).toContain('<img src=x onerror=1>')
		for (const vm of body.data) {
			expect(vm.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
			expect(vm).toMatchObject({ name: expect.stringMatching(/^[0-9a-f]{8}$/), managed: true, console: true })
		}
	})

	it('answers one VM by its id, and 404 for one it does not have', () => {
		const [first] = ask('GET', '/v2/virt_management/vms').body.data

		expect(ask('GET', `/v2/virt_management/vms/${first.id}`).body.data).toEqual(first)
		expect(ask('GET', '/v2/virt_management/vms/00000000-0000-0000-0000-000000000000')).toEqual({ status: 404, body: { message: 'vm not found' } })
	})
})

describe('the stub of the app grid', () => {
	it('lists four compose apps in the grid shape', () => {
		const { status, body } = ask('GET', '/v2/app_management/web/appgrid')

		expect(status).toBe(200)
		expect(body.data.map(app => app.title.en_us)).toEqual(['Jellyfin', 'Nextcloud', 'Immich', 'Plex'])
		for (const app of body.data) {
			expect(app).toMatchObject({ app_type: 'v2app', status: 'running', name: expect.any(String), hostname: '', port: expect.any(String) })
		}
	})
})

describe('the stub of the shell', () => {
	it('says the box is set up and who is signed in, in the core envelope', () => {
		expect(ask('GET', '/v1/users/status').body).toEqual({ success: 200, message: 'ok', data: { initialized: true, key: '' } })
		expect(ask('GET', '/v1/users/current').body.data).toMatchObject({ username: 'casaos' })
	})

	it('keeps what is put in custom storage, and answers an empty string for what was never put', () => {
		const state = newGridState()

		expect(ask('GET', '/v1/users/current/custom/app_order', null, state).body.data).toBe('')
		ask('POST', '/v1/users/current/custom/app_order', { data: ['Files', 'Plex'] }, state)

		expect(ask('GET', '/v1/users/current/custom/app_order', null, state).body.data).toEqual({ data: ['Files', 'Plex'] })
	})

	it('answers what the top bar and the widgets read', () => {
		expect(ask('GET', '/v1/sys/version').body.data).toMatchObject({ need_update: false })
		expect(ask('GET', '/v1/sys/hardware').body.data).toMatchObject({ arch: 'amd64' })
		expect(ask('GET', '/v1/sys/utilization').body.data).toMatchObject({ cpu: { num: 4 }, mem: { total: expect.any(Number) } })
		expect(ask('GET', '/v1/sys/telemetry').body.data).toEqual({ enabled: false })
		expect(ask('GET', '/v1/gateway/port').body.data).toBe('80')
		expect(ask('GET', '/v1/usb/usb-auto-mount').body.data).toBe('False')
	})

	it('leaves every other path to the caller', () => {
		expect(ask('GET', '/v1/sys/nothing-here')).toBeNull()
		expect(ask('DELETE', '/v2/virt_management/vms')).toBeNull()
		expect(ask('GET', '/v2/virt_management/stats')).toBeNull()
	})
})

// The upload of an image: the body is the file, the name says what to answer.
describe('the stub of the image upload', () => {
	const UPLOAD = '/v2/virt_management/images/upload'
	const put = (name, bytes, state, sha256) => handleGrid({ method: 'PUT', path: UPLOAD, query: sha256 ? { name, sha256 } : { name }, body: Buffer.from(bytes) }, state)
	// an ISO 9660 volume: CD001 at 32769
	const iso = () => {
		const bytes = Buffer.alloc(32774)
		bytes.write('CD001', 32769)
		return bytes
	}

	it('keeps the file, lists it and gives the host\'s free space', () => {
		const state = newGridState()
		const { status, body } = put('debian.iso', iso(), state)

		expect(status).toBe(201)
		expect(body.data).toEqual({ path: '/DATA/VM/iso/debian.iso', name: 'debian.iso', kind: 'iso', size_bytes: 32774, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) })
		expect(handleGrid({ method: 'GET', path: '/v2/virt_management/images' }, state).body.data.map(image => image.name)).toContain('debian.iso')
		expect(handleGrid({ method: 'GET', path: '/v2/virt_management/host' }, state).body.data.storage_free_bytes).toEqual(expect.any(Number))
	})

	it('warns of an ISO that is not one, and refuses a qcow2 without its magic', () => {
		expect(put('notes.iso', 'hello', newGridState()).body.data.warning).toBe('iso_signature_missing')
		expect(put('disk.qcow2', 'hello', newGridState())).toEqual({ status: 422, body: { message: 'bad_image' } })
		expect(put('disk.qcow2', [0x51, 0x46, 0x49, 0xFB, 0], newGridState()).status).toBe(201)
	})

	it('answers the codes of the contract', () => {
		const state = newGridState()
		put('Taken.iso', iso(), state)

		expect(put('taken.ISO', iso(), state)).toEqual({ status: 409, body: { message: 'exists' } })
		expect(put('notes.txt', 'x', state)).toEqual({ status: 400, body: { message: 'bad_name' } })
		expect(put('a.iso', 'x', state, 'xyz')).toEqual({ status: 400, body: { message: 'bad_sha256' } })
		expect(put('a.iso', 'x', state, '0'.repeat(64))).toEqual({ status: 422, body: { message: 'checksum_mismatch' } })
		// a name made of a code answers that code
		const codes = { exists: 409, too_large: 413, busy: 503, insufficient_storage: 507, stalled: 408, incomplete: 400, too_long: 400, length_required: 411 }
		for (const [code, status] of Object.entries(codes)) {
			expect(put(`${code}.iso`, 'x', state)).toEqual({ status, body: { message: code } })
		}
	})
})
