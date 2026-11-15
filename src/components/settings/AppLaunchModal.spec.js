// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppLaunchModal from './AppLaunchModal.vue'

const hasVMs = vi.hoisted(() => ({ value: false }))
const isMaster = vi.hoisted(() => ({ value: false }))
const probes = vi.hoisted(() => ({ fleet: 0, vms: 0 }))
vi.mock('@/components/Fleet/entry', async importOriginal => ({
	...await importOriginal(),
	hasFleet: () => {
		probes.fleet++
		return Promise.resolve(isMaster.value)
	},
}))
vi.mock('@/components/VirtualMachines/entry', async importOriginal => ({
	...await importOriginal(),
	hasVirtualMachines: () => {
		probes.vms++
		return Promise.resolve(hasVMs.value)
	},
}))

// getters: the account's, as the store gives them; none is the owner's dialog
async function open(getters) {
	const wrapper = mount(AppLaunchModal, {
		global: {
			mocks: {
				$t: key => key,
				$store: { state: { appLaunchInIframe: true, appLaunchExceptions: [] }, getters: getters || { canWrite: true, canReadModule: () => true } },
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
		isMaster.value = false
		probes.fleet = 0
		probes.vms = 0
	})

	it('asks nothing of a module an account without rights may not read, and offers it no card it does not have', async () => {
		hasVMs.value = true
		isMaster.value = true
		const wrapper = await open({ canWrite: false, canReadModule: () => false })

		expect(probes).toEqual({ fleet: 0, vms: 0 })
		const titles = wrapper.vm.builtins.map(b => b.title)
		expect(titles).not.toContain('Files')
		expect(titles).not.toContain('App Store')
		expect(titles).not.toContain('Virtual Machines')
		expect(titles).not.toContain('Fleet')
		expect(titles).toContain('Statistics')
		wrapper.unmount()
	})

	it('offers a user with the vm right the Virtual Machines card, and never the Fleet card', async () => {
		hasVMs.value = true
		isMaster.value = true
		const wrapper = await open({ canWrite: false, canReadModule: name => name === 'vm' || name === 'fleet' })

		expect(probes).toEqual({ fleet: 0, vms: 1 })
		expect(wrapper.vm.builtins.map(b => b.title)).toContain('Virtual Machines')
		expect(wrapper.vm.builtins.map(b => b.title)).not.toContain('Fleet')
		wrapper.unmount()
	})

	it('lists Fleet only where the core says master', async () => {
		let wrapper = await open()
		expect(wrapper.vm.builtins.map(b => b.title)).not.toContain('Fleet')
		wrapper.unmount()
		isMaster.value = true
		wrapper = await open()
		expect(wrapper.vm.builtins.map(b => b.id)).toContain('casaos:fleet')
		expect(wrapper.vm.builtins.map(b => b.title)).toContain('Fleet')
		wrapper.unmount()
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
