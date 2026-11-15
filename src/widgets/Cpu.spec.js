// @vitest-environment happy-dom
import Buefy from 'buefy'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import i18n from '@/plugins/i18n'
import Cpu from '@/widgets/Cpu.vue'

// require.context has no Vite equivalent; an empty table makes $t return its key.
vi.mock('@/assets/lang', () => ({ default: { en_us: {} } }))

// What the core sends from a machine without sensors: no thermal zone reads
// as temperature 0, no RAPL counter as power value "0".
function cpu(temperature, value, model = 'intel') {
	return { num: 4, percent: 12, temperature, power: { timestamp: '1000', value }, model }
}

function mountWidget(cpuInfo) {
	const $store = { state: { hardwareInfo: { cpu: cpuInfo, mem: { total: 1024, usedPercent: 50 } } } }
	const $api = { container: { getHardwareUsage: () => new Promise(() => {}) } }
	return mount(Cpu, { global: { plugins: [Buefy, i18n], mocks: { $store, $api, $messageBus: () => {} } } })
}

// The first .bar-content belongs to the CPU dial, the RAM dial always has one.
const readouts = wrapper => wrapper.findAll('.bar-content').map(el => el.text())

describe('system status widget', () => {
	it('shows no power and temperature readout on a machine without sensors', () => {
		const wrapper = mountWidget(cpu(0, '0'))
		expect(readouts(wrapper)).toEqual(['1 KB'])
		wrapper.unmount()
	})

	it('shows the temperature when only the thermal zone answers', () => {
		const wrapper = mountWidget(cpu(55, '0'))
		expect(readouts(wrapper)[0]).toBe('55°C')
		wrapper.unmount()
	})

	it('shows the power once two samples are in', async () => {
		const wrapper = mountWidget(cpu(55, '1000000'))
		const onUtilization = wrapper.vm.$options.sockets['casaos:system:utilization']
		onUtilization.call(wrapper.vm, { Properties: {
			sys_cpu: JSON.stringify({ ...cpu(55, '25000000'), power: { timestamp: '1002', value: '25000000' } }),
			sys_mem: JSON.stringify({ total: 1024, usedPercent: 50 }),
		} })
		await wrapper.vm.$nextTick()
		expect(readouts(wrapper)[0]).toBe('12.0W / 55°C')
		wrapper.unmount()
	})
})

// a session without the message bus: Home reads the load again into the store
it('follows the load read again into the store', async () => {
	const $store = reactive({ state: { hardwareInfo: { cpu: cpu(0, '0'), mem: { total: 1024, usedPercent: 50 } } } })
	const $api = { container: { getHardwareUsage: () => new Promise(() => {}) } }
	const wrapper = mount(Cpu, { global: { plugins: [Buefy, i18n], mocks: { $store, $api, $messageBus: () => {} } } })
	$store.state.hardwareInfo = { cpu: { ...cpu(0, '0'), percent: 77 }, mem: { total: 1024, usedPercent: 20 } }
	await wrapper.vm.$nextTick()
	expect(wrapper.vm.cpuSeries).toBe(77)
	expect(wrapper.vm.ramSeries).toBe(20)
	wrapper.unmount()
})
