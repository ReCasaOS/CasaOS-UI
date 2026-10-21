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
