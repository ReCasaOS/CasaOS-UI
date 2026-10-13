// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSocket } from './__fixtures__/page'
import { aVm } from './__fixtures__/vm'
import VmConsoleModal from './VmConsoleModal.vue'
import vmApi from './api'
import i18n from '@/plugins/i18n'
import socketPlugin from '@/plugins/socket'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('./api', () => ({ default: { action: vi.fn(), consoleURL: vi.fn(() => 'ws://box/console') } }))
// noVNC reaches for the browser the moment it is imported
vi.mock('@novnc/novnc', () => ({ default: vi.fn() }))

// Buefy renders the message of a toast as HTML.
const HOSTILE = '<img src=x onerror="window.pwned = 1">'

describe('the console of a virtual machine', () => {
	let wrapper

	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
	})
	afterEach(() => wrapper?.unmount())

	it('shows the error of a failed start as text', async () => {
		wrapper = mount(VmConsoleModal, {
			attachTo: document.body,
			props: { vm: aVm({ state: 'shut-off' }) },
			global: { plugins: [Buefy, i18n], mocks: { $wsProtocol: 'ws:' } },
		})
		vmApi.action.mockRejectedValue({ response: { data: { message: `cannot start ${HOSTILE}` } } })
		await wrapper.find('.power-btn').trigger('click')
		await flushPromises()

		const toasts = [...document.querySelectorAll('.toast')]
		expect(toasts).toHaveLength(1)
		expect(toasts[0].querySelector('img')).toBeNull()
		expect(toasts[0].textContent).toContain(`cannot start ${HOSTILE}`)
	})

	// the bus is any signed-in user's: a state it names has to be one of the service's
	it('ignores a state the service has no word for, and follows the ones it has', async () => {
		const socket = fakeSocket()
		wrapper = mount(VmConsoleModal, {
			attachTo: document.body,
			props: { vm: aVm({ state: 'shut-off' }) },
			global: { plugins: [Buefy, i18n, [socketPlugin, socket]], mocks: { $wsProtocol: 'ws:' } },
		})
		const status = () => wrapper.find('header .mr-auto').text()
		const say = state => socket.receive('vm:state-changed', { Properties: { 'vm:id': 'vm-1', 'vm:state': state } })
		expect(status()).toBe('Off')

		for (const state of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'what', 1, {}]) {
			say(state)
			await flushPromises()
			expect(status()).toBe('Off')
		}
		say('crashed')
		await flushPromises()
		expect(status()).toBe('Crashed')
	})

	// Escape belongs to the VM, so this is the keyboard's way out
	it('closes from a button the keyboard can reach, and a name for it', async () => {
		wrapper = mount(VmConsoleModal, {
			attachTo: document.body,
			props: { vm: aVm({ state: 'shut-off' }) },
			global: { plugins: [Buefy, i18n], mocks: { $wsProtocol: 'ws:' } },
		})
		const close = wrapper.find('header button[aria-label="Close"]')
		expect(close.exists()).toBe(true)
		expect(close.element.tabIndex).toBe(0)

		await close.trigger('click')
		expect(wrapper.emitted('close')).toHaveLength(1)
	})
})
