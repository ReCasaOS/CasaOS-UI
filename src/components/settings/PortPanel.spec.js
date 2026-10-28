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

	// The field is a number input: what it holds after an edit is a number, and the gateway
	// (PUT /v1/gateway/port, ChangePortRequest) reads the port as text and answers 400 to a number.
	it.each([[8081], ['8081']])('sends the port as text when the field holds %j', async (port) => {
		const editServerPort = vi.fn(() => Promise.resolve({ data: { success: 200 } }))
		const wrapper = open(editServerPort)
		wrapper.vm.checkUpdate = vi.fn()
		wrapper.vm.port = port
		wrapper.vm.savePort()
		await flushPromises()

		expect(editServerPort).toHaveBeenCalledWith({ port: '8081' })
	})

	it('sends nothing for a port out of range', async () => {
		const editServerPort = vi.fn()
		const wrapper = open(editServerPort)
		wrapper.vm.port = 79
		wrapper.vm.savePort()
		await flushPromises()

		expect(editServerPort).not.toHaveBeenCalled()
		expect(wrapper.vm.isLoading).toBe(false)
	})
})
