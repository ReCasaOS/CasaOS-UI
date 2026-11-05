// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import Ports from './Ports.vue'
import i18n from '@/plugins/i18n'
import '@/plugins/vee-validate'

vi.mock('@/assets/lang', () => ({ default: { en_us: {} } }))

describe('ports', () => {
	// ReCasaOS/CasaOS#91: the blur handler read el._value, which Vue 2's v-model set and
	// Vue 3 never does, so a host port typed by hand was dropped and the field stayed red.
	it('keeps the host port typed in the field', async () => {
		const items = [{ target: 3001, published: '3001', host_ip: '', protocol: 'tcp' }]
		const wrapper = mount(Ports, {
			props: { modelValue: items, showHostPost: true },
			global: { plugins: [Buefy, i18n] },
		})

		const host = wrapper.find('input')
		await host.setValue('12345')
		await host.trigger('blur')
		await flushPromises()

		expect(items[0]).toMatchObject({ published: '12345', host_ip: '' })
		wrapper.unmount()
	})
})
