// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppLaunchModal from './AppLaunchModal.vue'

const hasVMs = vi.hoisted(() => ({ value: false }))
vi.mock('@/components/VirtualMachines/entry', async importOriginal => ({
	...await importOriginal(),
	hasVirtualMachines: () => Promise.resolve(hasVMs.value),
}))

async function open() {
	const wrapper = mount(AppLaunchModal, {
		global: {
			mocks: {
				$t: key => key,
				$store: { state: { appLaunchInIframe: true, appLaunchExceptions: [] } },
				$openAPI: { appManagement: { compose: { myComposeAppList: () => Promise.resolve({ data: { data: {} } }) } } },
			},
			stubs: { 'b-field': true, 'b-switch': true, 'b-loading': true, 'b-message': true, 'b-button': true, 'b-checkbox': { template: '<label><slot /></label>' } },
		},
	})
	await flushPromises()
	return wrapper
}

describe('the built-in apps of the App launching setting', () => {
	beforeEach(() => {
		hasVMs.value = false
	})

	it('lists Statistics, and no Virtual Machines without the module', async () => {
		const wrapper = await open()
		const titles = wrapper.vm.builtins.map(b => b.title)
		expect(titles).toContain('Statistics')
		expect(titles).not.toContain('Virtual Machines')
		wrapper.unmount()
	})

	it('lists Virtual Machines too when the module is there', async () => {
		hasVMs.value = true
		const wrapper = await open()
		expect(wrapper.vm.builtins.map(b => b.title)).toEqual(expect.arrayContaining(['Statistics', 'Virtual Machines']))
		wrapper.unmount()
	})
})
