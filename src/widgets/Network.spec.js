// @vitest-environment happy-dom
import Buefy from 'buefy'
import { config, shallowMount } from '@vue/test-utils'
import { beforeAll, expect, it } from 'vitest'
import { reactive } from 'vue'
import Network from './Network.vue'

beforeAll(() => {
	config.global.plugins = [Buefy]
})

function sample(bytesSent, bytesRecv, time) {
	return { Properties: { sys_net: JSON.stringify([{ name: 'eth0', bytesSent, bytesRecv, time }]) } }
}

it('mounts the chart only once a sample is in, and feeds it through the series prop', async () => {
	const wrapper = shallowMount(Network, {
		global: { mocks: { $t: key => key, $store: { state: { hardwareInfo: { net: [{ name: 'eth0' }] } } } } },
	})
	// apexcharts 4 rejects render() with `series: undefined` and never recovers.
	expect(wrapper.findComponent({ name: 'VueApexCharts' }).exists()).toBe(false)

	const onUtilization = wrapper.vm.$options.sockets['casaos:system:utilization']
	onUtilization.call(wrapper.vm, sample(1000, 2000, 10))
	onUtilization.call(wrapper.vm, sample(1000 + 2048 * 2, 2000 + 4096 * 2, 12))
	await wrapper.vm.$nextTick()

	// The async component is stubbed unresolved, so its props are not readable;
	// the bound expression is `networks[networkId]`.
	expect(wrapper.findComponent({ name: 'VueApexCharts' }).exists()).toBe(true)
	expect(wrapper.vm.networks[wrapper.vm.networkId].map(s => s.data)).toEqual([['0', '2'], ['0', '4']])
	expect(wrapper.vm.currentUpSpeed).toBe('2')
	expect(wrapper.vm.currentDownSpeed).toBe('4')
})

it('follows the network read again into the store', async () => {
	const $store = reactive({ state: { hardwareInfo: { net: [{ name: 'eth0' }] } } })
	const wrapper = shallowMount(Network, { global: { mocks: { $t: key => key, $store } } })
	$store.state.hardwareInfo = { net: [{ name: 'eth0', bytesSent: 1000, bytesRecv: 2000, time: 10 }] }
	await wrapper.vm.$nextTick()
	expect(wrapper.vm.initNetwork).toEqual([{ name: 'eth0', bytesSent: 1000, bytesRecv: 2000, time: 10 }])
})
