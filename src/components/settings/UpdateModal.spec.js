// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UpdateModal from '@/components/settings/UpdateModal.vue'

// The dialog is opened programmatically, outside the router view, so closing it
// unmounts the component. Its upgrade-log poll used to go on running: the update
// rotates the token keys, that poll 401s, the interceptor sends the browser to
// /login, the owner signs in -- and the orphaned poll then reads its success line
// with the NEW token and calls reloadWhenBackendIsBack, which deletes the session it
// never knew about. That was the second login.
describe('the update dialog leaves nothing running', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		localStorage.clear()
	})
	afterEach(() => vi.useRealTimers())

	function open() {
		const getContent = vi.fn(() => Promise.resolve({ data: { data: 'installing...' } }))
		const wrapper = mount(UpdateModal, {
			global: {
				mocks: {
					$t: k => k,
					$api: { file: { getContent }, sys: { updateCasaOS: vi.fn(() => Promise.resolve({})) } },
					$buefy: { toast: { open: vi.fn() } },
				},
				stubs: { 'b-button': true, 'b-loading': true },
			},
		})
		return { wrapper, getContent }
	}

	it('stops polling the upgrade log when it is closed', async () => {
		const { wrapper, getContent } = open()

		wrapper.vm.getUpdateLogs()
		vi.advanceTimersByTime(600)
		expect(getContent.mock.calls.length).toBeGreaterThan(0)

		const before = getContent.mock.calls.length
		wrapper.unmount()
		vi.advanceTimersByTime(5000)

		expect(getContent.mock.calls.length).toBe(before)
	})

	it('never deletes the session, whoever is signed in by then', () => {
		// The dashboard that drives an upgrade is the OLD one -- the version being
		// replaced -- so the unmount hook above only protects the upgrade AFTER this one.
		// Not clearing is what makes it safe regardless: the tokens the upgrade killed are
		// dead anyway and the first 401 lands on the login page, while a session someone
		// signed in with since must survive.
		const { wrapper } = open()
		localStorage.setItem('access_token', 'signed-in-again')
		localStorage.setItem('refresh_token', 'also-fresh')

		wrapper.vm.reloadWhenBackendIsBack()

		expect(localStorage.getItem('access_token')).toBe('signed-in-again')
		expect(localStorage.getItem('refresh_token')).toBe('also-fresh')
		wrapper.unmount()
	})

	it('keeps no session-clearing timer alive either', () => {
		const { wrapper } = open()

		const cleared = []
		const realClear = globalThis.clearInterval
		globalThis.clearInterval = (id) => {
			cleared.push(id)
			return realClear(id)
		}

		wrapper.vm.getUpdateLogs()
		wrapper.vm.checkUpdateState()
		const running = [wrapper.vm.updateTimer, wrapper.vm.timer]
		wrapper.unmount()
		globalThis.clearInterval = realClear

		for (const id of running)
			expect(cleared).toContain(id)
	})
})

// "See the log" on a paused automatic update opens this same view, on the log the
// night's attempts wrote. It only reads: no update starts from it, nothing polls.
describe('the update dialog opened on the log', () => {
	it('shows the upgrade log once, and offers no upgrade', async () => {
		vi.useFakeTimers()
		const getContent = vi.fn(() => Promise.resolve({ data: { data: 'CasaOS upgrade failed' } }))
		const updateCasaOS = vi.fn()
		const wrapper = mount(UpdateModal, {
			props: { logOnly: true },
			global: {
				mocks: { $t: k => k, $api: { file: { getContent }, sys: { updateCasaOS } }, $buefy: { toast: { open: vi.fn() } } },
				stubs: { 'b-button': true, 'b-icon': true },
			},
		})
		await vi.advanceTimersByTimeAsync(5000)
		vi.useRealTimers()

		expect(getContent).toHaveBeenCalledTimes(1)
		expect(getContent).toHaveBeenCalledWith('/var/log/casaos/upgrade.log')
		expect(wrapper.find('pre').text()).toBe('CasaOS upgrade failed')
		expect(wrapper.find('b-button-stub').exists()).toBe(false)
		expect(updateCasaOS).not.toHaveBeenCalled()
		wrapper.unmount()
	})
})
