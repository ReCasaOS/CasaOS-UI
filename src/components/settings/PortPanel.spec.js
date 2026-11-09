// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import PortPanel from './PortPanel.vue'

// getHttpsPort rejects by default: a gateway older than the HTTPS field answers 404
function open(editServerPort, { getHttpsPort = () => Promise.reject(new Error('404')), editHttpsPort = vi.fn(() => Promise.resolve({ data: { success: 200 } })), protocol = 'http:' } = {}) {
	return mount(PortPanel, {
		props: { initPort: '80' },
		global: {
			mocks: { $t: key => key, $messageBus: vi.fn(), $protocol: protocol, $baseIp: 'box.lan', $api: { sys: { editServerPort, getHttpsPort, editHttpsPort } } },
			stubs: {
				'b-field': { props: ['type', 'message'], template: '<div class="field" :data-type="type"><slot /><p>{{ message }}</p></div>' },
				'b-input': { template: '<input>', methods: { getElement: () => ({ select() {} }) } },
				'b-button': true,
				'b-checkbox': true,
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

describe('web UI port, HTTPS field', () => {
	const answer = data => () => Promise.resolve({ data: { success: 200, data } })
	const ok = () => vi.fn(() => Promise.resolve({ data: { success: 200 } }))

	it('stays hidden when the gateway does not know the route', async () => {
		const wrapper = open(ok())
		await flushPromises()

		expect(wrapper.vm.httpsInit).toBeNull()
		expect(wrapper.findAll('.field')).toHaveLength(1)
	})

	it('shows the field with the default 443 when the gateway answers empty', async () => {
		const wrapper = open(ok(), { getHttpsPort: answer('') })
		await flushPromises()

		expect(wrapper.vm.httpsInit).toBe('443')
		expect(wrapper.vm.httpsPort).toBe('443')
		expect(wrapper.findAll('.field')).toHaveLength(2)
		expect(wrapper.vm.httpsOff).toBe(false)
	})

	it('sends "0" for Off, and leaves the plain port alone', async () => {
		const editServerPort = ok()
		const editHttpsPort = ok()
		const wrapper = open(editServerPort, { getHttpsPort: answer('443'), editHttpsPort })
		await flushPromises()
		wrapper.vm.httpsOff = true
		wrapper.vm.savePort()
		await flushPromises()

		expect(editHttpsPort).toHaveBeenCalledWith({ port: '0' })
		expect(editServerPort).not.toHaveBeenCalled()
	})

	it('shows the gateway message when it refuses the port', async () => {
		const editHttpsPort = vi.fn(() => Promise.resolve({ data: { success: 400, message: 'port 8443 is already in use' } }))
		const wrapper = open(ok(), { getHttpsPort: answer('443'), editHttpsPort })
		await flushPromises()
		wrapper.vm.httpsPort = '8443'
		wrapper.vm.savePort()
		await flushPromises()

		expect(wrapper.text()).toContain('port 8443 is already in use')
		expect(wrapper.vm.isLoading).toBe(false)
	})

	it('warns before saving when this page came over https and the https port changes', async () => {
		const wrapper = open(ok(), { getHttpsPort: answer('443'), protocol: 'https:' })
		await flushPromises()
		expect(wrapper.text()).not.toContain('will stop answering')

		wrapper.vm.httpsOff = true
		await flushPromises()

		expect(wrapper.text()).toContain('will stop answering on this port')
	})

	it('goes to the plain port instead of polling after an https change from an https page', async () => {
		const open_ = vi.spyOn(window, 'open').mockImplementation(() => null)
		const wrapper = open(ok(), { getHttpsPort: answer('443'), protocol: 'https:' })
		wrapper.vm.checkUpdate = vi.fn()
		await flushPromises()
		wrapper.vm.httpsOff = true
		wrapper.vm.savePort()
		await flushPromises()

		expect(open_).toHaveBeenCalledWith('http://box.lan:80', '_self')
		expect(wrapper.vm.checkUpdate).not.toHaveBeenCalled()
		open_.mockRestore()
	})
})
