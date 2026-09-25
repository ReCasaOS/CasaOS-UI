// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UpdateAllModal from './UpdateAllModal.vue'

const noRun = () => Promise.reject(new Error('no run since the service started'))

async function open(plan) {
	const wrapper = mount(UpdateAllModal, {
		global: {
			mocks: { $t: k => k, $api: { updates: { run: noRun, plan } }, $EventBus: { $emit() {} } },
			stubs: {
				'b-message': { template: '<div class="message"><slot /></div>' },
				'b-button': { template: '<button><slot /></button>' },
				'b-icon': true,
				'b-checkbox': true,
			},
		},
	})
	await flushPromises()
	return wrapper
}

describe('the update every app dialog, with nothing to confirm', () => {
	it('says the plan failed, not that every app is current, and offers Close', async () => {
		const wrapper = await open(() => Promise.reject(Object.assign(new Error('Request failed'), { response: { data: { message: 'dial tcp: i/o timeout' } } })))

		expect(wrapper.find('.message').text()).toContain('Could not load what an update would do.')
		expect(wrapper.find('.message').text()).toContain('dial tcp: i/o timeout')
		expect(wrapper.text()).not.toContain('Every app is current')
		expect(wrapper.text()).not.toContain('Each app is pulled')
		expect(wrapper.findAll('button').map(b => b.text())).toEqual(['Close'])
		wrapper.unmount()
	})

	it('offers Close, not Cancel, when every app is current', async () => {
		const wrapper = await open(() => Promise.resolve({ data: { data: { apps: [] } } }))

		expect(wrapper.text()).toContain('Every app is current')
		expect(wrapper.findAll('button').map(b => b.text())).toEqual(['Close'])
		wrapper.unmount()
	})
})
