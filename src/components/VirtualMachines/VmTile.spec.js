// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aVm } from './__fixtures__/vm'
import VmTile from './VmTile.vue'
import vmApi from './api'
import { openVirtualMachines, openVmConsole } from './entry'
import i18n from '@/plugins/i18n'

// The English strings, so that what a spec reads is what a person reads.
vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('./api', () => ({ default: { action: vi.fn(), list: vi.fn() } }))
vi.mock('./entry', () => ({ openVirtualMachines: vi.fn(), openVmConsole: vi.fn() }))

const HOSTILE = '<img src=x onerror="window.pwned = 1">'
const buefy = { modal: { open: vi.fn() } }
const state = { appLaunchInIframe: true }

function tile(vm) {
	return mount(VmTile, {
		props: { vm: aVm(vm) },
		global: { plugins: [i18n], mocks: { $buefy: buefy, $store: { state } } },
		attachTo: document.body,
	})
}

describe('the tile of a virtual machine', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
		delete window.pwned
	})

	// (1) named like the VM, a VM and not an app
	it('is named like the VM, says it is one, and carries no system-app chip', () => {
		const wrapper = tile({ title: 'Debian' })

		expect(wrapper.find('.vm-tile-name').text()).toBe('Debian')
		expect(wrapper.find('.vm-tile-chip').text()).toBe('VM')
		expect(wrapper.find('.system-marker').exists()).toBe(false)
		expect(wrapper.find('.vm-tile-screen svg').exists()).toBe(true)
	})

	it.each([
		['running', 'running'],
		['paused', 'paused'],
		['shut-off', 'stopped'],
		['crashed', 'other'],
		['shutting-down', 'other'],
		['something-new', 'other'],
	])('shows the state %s as its dot', (vmState, dot) => {
		const wrapper = tile({ state: vmState })

		expect(wrapper.find('.vm-tile-dot').classes()).toContain(`vm-dot-${dot}`)
	})

	// (2) the console straight away where there is one
	it('opens the console of a running VM on a click', async () => {
		const wrapper = tile({ id: 'vm-1', state: 'running' })

		await wrapper.find('button').trigger('click')

		expect(openVmConsole).toHaveBeenCalledWith(buefy, expect.objectContaining({ id: 'vm-1' }))
		expect(openVirtualMachines).not.toHaveBeenCalled()
	})

	it('opens the console of a paused VM, which the console allows', async () => {
		const wrapper = tile({ state: 'paused' })

		await wrapper.find('button').trigger('click')

		expect(openVmConsole).toHaveBeenCalledTimes(1)
	})

	it('opens the Virtual Machines window on a stopped VM, and starts nothing', async () => {
		const wrapper = tile({ id: 'vm-2', state: 'shut-off' })

		await wrapper.find('button').trigger('click')

		expect(openVirtualMachines).toHaveBeenCalledWith(buefy, state, 'vm-2')
		expect(openVmConsole).not.toHaveBeenCalled()
		expect(vmApi.action).not.toHaveBeenCalled()
	})

	// (6) a name is text
	it('shows a hostile name as text, never as HTML', () => {
		const wrapper = tile({ title: HOSTILE })

		expect(wrapper.find('.vm-tile-name').text()).toBe(HOSTILE)
		expect(wrapper.find('img').exists()).toBe(false)
		expect(wrapper.find('button').attributes('aria-label')).toBe(`Console of ${HOSTILE}`)
		expect(window.pwned).toBeUndefined()
	})

	it('cuts a long name to a sane length', () => {
		const wrapper = tile({ title: 'x'.repeat(500) })

		expect(wrapper.find('.vm-tile-name').text().length).toBeLessThanOrEqual(64)
		expect(wrapper.find('button').attributes('title').length).toBeLessThan(100)
	})

	it('says what a click does on a VM with no console', () => {
		const wrapper = tile({ title: 'Debian', state: 'shut-off' })

		expect(wrapper.find('button').attributes('aria-label')).toBe('Debian, Off: open in Virtual Machines')
	})

	// (7) a button, so Enter and Space open it; and no menu of app actions
	it('is a button of its own, with no menu of app actions', async () => {
		const wrapper = tile({})

		const button = wrapper.find('button')
		expect(button.attributes('type')).toBe('button')
		await button.trigger('contextmenu')
		expect(wrapper.find('.app-card-drop').exists()).toBe(false)
		expect(document.querySelector('.dropdown-menu')).toBeNull()
		expect(document.body.textContent).not.toContain('Uninstall')
	})
})
