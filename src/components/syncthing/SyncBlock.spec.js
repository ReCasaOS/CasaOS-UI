// @vitest-environment happy-dom
import { flushPromises, shallowMount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import SyncBlock from './SyncBlock.vue'

describe('the sync block', () => {
	// The store's x-casaos gives Syncthing no hostname, so the box's address has
	// to reach findSyncthing from here: the helper's own spec cannot see whether
	// this component passes it.
	it('opens the Web UI on the box for an App Store install', async () => {
		const syncthing = { name: 'syncthing', app_type: 'v2app', image: 'linuxserver/syncthing', port: '8384', index: '/', hostname: '', status: 'running' }
		const open = vi.spyOn(window, 'open').mockImplementation(() => null)
		const wrapper = shallowMount(SyncBlock, {
			global: {
				mocks: {
					$t: key => key,
					$baseIp: '10.0.0.2',
					$EventBus: { $on() {}, $off() {}, $emit() {} },
					$openAPI: { appGrid: { getAppGrid: async () => ({ data: { data: [syncthing] } }) } },
				},
			},
		})
		await flushPromises()

		await wrapper.vm.openSyncPanel()

		expect(open).toHaveBeenCalledWith('http://10.0.0.2:8384/', '_blank')
		open.mockRestore()
	})
})
