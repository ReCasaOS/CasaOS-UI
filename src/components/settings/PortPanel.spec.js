// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import PortPanel from './PortPanel.vue'

function open(editServerPort) {
	return mount(PortPanel, {
		props: { initPort: '80' },
		global: {
			mocks: { $t: key => key, $messageBus: vi.fn(), $api: { sys: { editServerPort } } },
			stubs: {
				'b-field': { props: ['type', 'message'], template: '<div class="field" :data-type="type"><slot /><p>{{ message }}</p></div>' },
				'b-input': { template: '<input>', methods: { getElement: () => ({ select() {} }) } },
				'b-button': true,
				'b-icon': true,
				'b-loading': true,
			},
		},
	})
}

describe('web UI port', () => {
	it('opens without marking the field valid', () => {
		expect(open(vi.fn()).find('.field').attributes('data-type')).toBe('')
	})

	it('says the setting was not saved when the request fails without an answer', async () => {
		const wrapper = open(vi.fn(() => Promise.reject(new Error('Network Error'))))
		wrapper.vm.savePort()
		await flushPromises()

		expect(wrapper.find('.field').attributes('data-type')).toBe('is-danger')
		expect(wrapper.text()).toContain('The setting could not be saved.')
		expect(wrapper.vm.isLoading).toBe(false)
	})
})
