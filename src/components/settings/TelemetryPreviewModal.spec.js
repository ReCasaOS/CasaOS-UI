// @vitest-environment happy-dom
import { h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TelemetryPreviewModal from './TelemetryPreviewModal.vue'

// The core builds this with the function its sender uses; the modal shows it as is.
const PROPERTIES = {
	distribution: 'v0.5.0',
	core: 'v0.4.59',
	arch: 'arm64',
	os: 'debian 12',
	kernel: '6.8',
	virtualization: 'none',
	model: 'Raspberry Pi 5 Model B Rev 1.0',
	docker: '28.3.1',
	cpu_cores: 4,
	ram_gb: 8,
	disks: 2,
	storage_tb: '4-8',
	raid: false,
}

function open(getTelemetry) {
	return mount(TelemetryPreviewModal, {
		global: {
			mocks: { $t: key => key, $api: { sys: { getTelemetry } } },
			// The warning's words are what is checked, so its stub keeps them.
			stubs: { 'b-button': true, 'b-loading': true, 'b-message': { render() { return h('div', this.$slots.default()) } } },
		},
	})
}

describe('what is sent', () => {
	it('shows the properties the core answers, as JSON', async () => {
		const getTelemetry = vi.fn(() => Promise.resolve({
			data: { success: 200, data: { enabled: true, notice_seen: true, preview: { event: 'heartbeat', properties: PROPERTIES } } },
		}))
		const wrapper = open(getTelemetry)
		await flushPromises()

		expect(getTelemetry).toHaveBeenCalledTimes(1)
		expect(JSON.parse(wrapper.find('pre').text())).toEqual(PROPERTIES)
	})

	it('shows a spinner until the core answers', async () => {
		let resolve
		const wrapper = open(vi.fn(() => new Promise((r) => {
			resolve = r
		})))
		expect(wrapper.find('b-loading-stub').attributes('modelvalue')).toBe('true')

		resolve({ data: { success: 200, data: { preview: { properties: PROPERTIES } } } })
		await flushPromises()
		expect(wrapper.find('b-loading-stub').attributes('modelvalue')).toBe('false')
	})

	it('names PostHog (EU) and links the README section', async () => {
		const wrapper = open(vi.fn(() => new Promise(() => {})))

		expect(wrapper.text()).toContain('PostHog (EU)')
		expect(wrapper.find('a').attributes('href')).toBe('https://github.com/ReCasaOS/CasaOS-Install#anonymous-statistics')
	})

	it('says so when the preview cannot be loaded', async () => {
		const wrapper = open(vi.fn(() => Promise.reject(new Error('offline'))))
		await flushPromises()

		expect(wrapper.find('pre').exists()).toBe(false)
		expect(wrapper.text()).toContain('The preview could not be loaded.')
		expect(wrapper.find('b-loading-stub').attributes('modelvalue')).toBe('false')
	})
})
