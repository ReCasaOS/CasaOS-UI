// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FLEET_APP_NAME, fleetApplication, forgetFleet, hasFleet, openFleet } from './entry'
import { fleetApi } from '@/service/fleet'

vi.mock('@/service/fleet', () => ({ fleetApi: { status: vi.fn() } }))
vi.mock('./FleetPage.vue', () => ({ default: { name: 'FleetPage', render: () => null } }))

const master = role => Promise.resolve({ data: { data: { role } } })
const failure = status => Promise.reject(Object.assign(new Error('failed'), status ? { response: { status } } : {}))

function fakeBuefy() {
	const open = vi.fn(options => ({ options, close: vi.fn() }))
	return { buefy: { modal: { open } }, open }
}
const inModal = { appLaunchInIframe: true, appLaunchExceptions: [] }

describe('the Fleet card', () => {
	beforeEach(() => {
		vi.restoreAllMocks()
		fleetApi.status.mockReset()
		forgetFleet()
		document.body.innerHTML = ''
	})

	it('is a system app named Fleet', () => {
		expect(FLEET_APP_NAME).toBe('Fleet')
		expect(fleetApplication()).toMatchObject({ id: 'fleet', name: 'Fleet', title: { en_us: 'Fleet' }, status: 'running', app_type: 'system' })
	})

	it('is there only on a master, asked once', async () => {
		fleetApi.status.mockReturnValue(master('master'))
		expect(await hasFleet()).toBe(true)
		expect(await hasFleet()).toBe(true)
		expect(fleetApi.status).toHaveBeenCalledTimes(1)
		forgetFleet()
		fleetApi.status.mockReturnValue(master('member'))
		expect(await hasFleet()).toBe(false)
		expect(fleetApi.status).toHaveBeenCalledTimes(2)
	})

	it('forgets a failure but keeps a 404', async () => {
		fleetApi.status.mockReturnValueOnce(failure(500)).mockReturnValueOnce(failure()).mockReturnValue(master('master'))
		expect(await hasFleet()).toBe(false)
		expect(await hasFleet()).toBe(false)
		expect(await hasFleet()).toBe(true)
		expect(fleetApi.status).toHaveBeenCalledTimes(3)
		forgetFleet()
		fleetApi.status.mockReset().mockReturnValueOnce(failure(404)).mockReturnValue(master('master'))
		expect(await hasFleet()).toBe(false)
		expect(await hasFleet()).toBe(false)
		expect(fleetApi.status).toHaveBeenCalledTimes(1)
	})

	it('opens a modal that Escape of its own closes', () => {
		const { buefy, open } = fakeBuefy()
		expect(openFleet(buefy, inModal)).not.toBeNull()
		const options = open.mock.calls[0][0]
		expect(options.canCancel).toEqual([])
		expect(options.customClass).toContain('fleet-modal')
		expect(options.hasModalCard).toBe(true)
	})

	it('opens a tab when apps open in new tabs, or when Fleet is among the exceptions', () => {
		const { buefy, open } = fakeBuefy()
		const win = vi.spyOn(window, 'open').mockReturnValue(null)
		expect(openFleet(buefy, { appLaunchInIframe: false, appLaunchExceptions: [] })).toBeNull()
		expect(openFleet(buefy, { appLaunchInIframe: true, appLaunchExceptions: ['casaos:fleet'] })).toBeNull()
		expect(win).toHaveBeenCalledTimes(2)
		expect(win.mock.calls[0][0].endsWith('#/fleet')).toBe(true)
		expect(win.mock.calls[0][1]).toBe('_blank')
		expect(open).not.toHaveBeenCalled()
	})

	it('reuses the window already open: no second modal, the heading is focused', () => {
		document.body.innerHTML = '<div class="modal is-active fleet-modal"><div class="fleet-page"><h3 tabindex="-1">Fleet</h3></div></div>'
		const { buefy, open } = fakeBuefy()
		expect(openFleet(buefy, inModal)).toBeNull()
		expect(open).not.toHaveBeenCalled()
		expect(document.activeElement).toBe(document.querySelector('.fleet-page h3'))
	})
})
