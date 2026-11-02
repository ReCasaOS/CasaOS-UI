// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/plugins/i18n'
import MergeStorages from '@/components/Storage/MergeStorages.vue'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))

const storageList = [{
	path: '/dev/sdb',
	disk_name: 'sdb',
	children: [{ uuid: 'u-movies', label: 'Movies', mount_point: '/media/Movies', size: 4e12, avail: 1e12, persisted_in: 'casaos', type: 'ext4', drive_name: 'sdb' }],
}]

function dialog(props) {
	const $api = {
		storage: { list: vi.fn(async () => ({ data: { data: storageList } })) },
		folder: { getFolderSize: vi.fn(async () => ({ data: { data: true } })) },
		local_storage: {
			getMergerfsInfo: vi.fn(async () => ({ data: { data: [] } })),
			getInitMergerfsStatus: vi.fn(async () => ({ data: { data: 'initialized' } })),
			initMergerfs: vi.fn(),
			updateMergerfsInfo: vi.fn(async () => ({})),
		},
		container: { updateState: vi.fn() },
	}
	const $openAPI = { appGrid: { getAppGrid: vi.fn(async () => ({ data: { data: [{ name: 'plex', app_type: 'v2app', status: 'running' }] } })) }, appCompose: { setComposeAppStatus: vi.fn() } }
	const $EventBus = { $emit: vi.fn(), $on: vi.fn(), $off: vi.fn() }
	const wrapper = mount(MergeStorages, { props, global: { plugins: [Buefy, i18n], mocks: { $api, $openAPI, $EventBus, $messageBus: vi.fn(), require: () => '' } } })
	vi.spyOn(wrapper.vm.$buefy.toast, 'open').mockImplementation(() => {})
	return { wrapper, $api, $openAPI }
}

describe('the merged storage outside /DATA', () => {
	it('is edited where it is, with no app stopped and nothing to initialize', async () => {
		const { wrapper, $api, $openAPI } = dialog({ mergeStorageList: ['u-movies'], mountPoint: '/media/Pool' })
		await flushPromises()
		expect(wrapper.text()).toContain('Selected storage will be merged in /media/Pool.')
		expect(wrapper.text()).not.toContain('/DATA/AppData')
		expect(wrapper.text()).not.toContain('may be hidden')
		await wrapper.vm.test()
		await flushPromises()
		expect($api.local_storage.updateMergerfsInfo).toHaveBeenCalledWith({ fstype: 'fuse.mergerfs', mount_point: '/media/Pool', source_base_path: '', source_volume_uuids: ['u-movies'] })
		expect($api.folder.getFolderSize).not.toHaveBeenCalled()
		expect($openAPI.appGrid.getAppGrid).not.toHaveBeenCalled()
		expect($api.local_storage.getInitMergerfsStatus).not.toHaveBeenCalled()
		expect(wrapper.emitted('merge-success')).toHaveLength(1)
	})

	it('is removed from where it is, saying that the files stay on the drives', async () => {
		const { wrapper, $api, $openAPI } = dialog({ mergeStorageList: ['u-movies'], mountPoint: '/media/Pool' })
		await flushPromises()
		wrapper.vm.removeMergedStorage()
		await flushPromises()
		expect(wrapper.text()).toContain('Removing the merged storage empties /media/Pool. The files stay on their drives.')
		expect($api.local_storage.updateMergerfsInfo).toHaveBeenCalledWith({ fstype: 'fuse.mergerfs', mount_point: '/media/Pool', source_base_path: '', source_volume_uuids: [] })
		expect($openAPI.appCompose.setComposeAppStatus).not.toHaveBeenCalled()
	})

	it('still stops the apps and initializes /DATA there', async () => {
		const { wrapper, $api, $openAPI } = dialog({ mergeStorageList: ['u-movies'] })
		await flushPromises()
		expect(wrapper.text()).toContain('/DATA/AppData')
		await wrapper.vm.restart()
		await flushPromises()
		expect($openAPI.appCompose.setComposeAppStatus.mock.calls).toEqual([['plex', 'stop'], ['plex', 'start']])
		expect($api.local_storage.updateMergerfsInfo).toHaveBeenCalledWith(expect.objectContaining({ mount_point: '/DATA' }))
	})
})
