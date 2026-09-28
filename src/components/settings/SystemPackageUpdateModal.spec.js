// @vitest-environment happy-dom
import { h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import SystemPackageUpdateModal from './SystemPackageUpdateModal.vue'

const answer = data => () => Promise.resolve({ data: { success: 200, data } })
const pending = () => new Promise(() => {})
const idle = { supported: true, manager: 'apt', state: 'idle', reboot_required: false }
// Buttons and messages keep their words, which is what is checked.
const withSlot = {
	render() {
		return h('div', this.$slots.default?.())
	},
}

let wrapper
afterEach(() => wrapper?.unmount())

async function open(sys) {
	wrapper = mount(SystemPackageUpdateModal, {
		global: {
			mocks: { $t: key => key, $api: { sys: { getSystemPackageUpdateStatus: answer(idle), ...sys } } },
			stubs: { 'b-button': withSlot, 'b-message': withSlot, 'b-icon': true },
		},
	})
	await flushPromises()
	return wrapper
}

describe('system packages', () => {
	it('a failed check says so, with the core\'s words, and not that nothing is to update', async () => {
		const failure = Object.assign(new Error('Request failed with status code 500'), { response: { data: { message: 'E: Could not get lock /var/lib/apt/lists/lock' } } })
		const w = await open({ getSystemPackages: () => Promise.reject(failure) })

		expect(w.text()).toContain('Could not check for system package updates.')
		expect(w.text()).toContain('E: Could not get lock /var/lib/apt/lists/lock')
		expect(w.text()).not.toContain('No system package updates are available.')
		expect(w.text()).not.toContain('Request failed with status code 500')
	})

	it('an unsupported host gets the translated sentence, the core\'s reason below, and no footer', async () => {
		const w = await open({ getSystemPackages: answer({ supported: false, reason: 'apt-get was not found on this host.', updates: [], count: 0 }) })

		expect(w.text()).toContain('System package updates are not supported on this host.')
		expect(w.text()).toContain('apt-get was not found on this host.')
		expect(w.find('footer').exists()).toBe(false)
	})

	it('shows no footer while the update runs', async () => {
		const w = await open({
			getSystemPackageUpdateStatus: answer({ ...idle, state: 'running', log: 'Reading package lists...' }),
			getSystemPackages: pending,
		})

		expect(w.find('footer').exists()).toBe(false)
		expect(w.find('pre').text()).toBe('Reading package lists...')
	})
})
