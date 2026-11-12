// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/plugins/i18n'
import SnapRaidCreate from '@/components/Storage/SnapRaidCreate.vue'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))

const GB = 1e9
const storages = [
	{ name: 'Movies', size: 4000 * GB, uuid: 'u-movies', mount_point: '/media/Movies', persistedIn: 'casaos' },
	{ name: 'Series', size: 4000 * GB, uuid: 'u-series', mount_point: '/media/Series', persistedIn: 'casaos' },
	{ name: 'System', size: 100 * GB, uuid: 'u-sys', mount_point: '/', persistedIn: 'casaos', isSystem: true },
]
const drives = [{ name: 'sdc', model: 'Ironwolf', size: 8000 * GB, path: '/dev/sdc', children_number: 0, supported: false }]

function dialog(props, apiOverrides = {}) {
	const $api = {
		storage: {
			create: vi.fn(async () => ({ data: { success: 200 } })),
			list: vi.fn(async () => ({ data: { data: [{ path: '/dev/sdc', children: [{ uuid: 'u-sdc', mount_point: '/media/Parity1' }] }] } })),
		},
		disks: { protectDisks: vi.fn(async () => ({})), runSnapraid: vi.fn(async () => ({})) },
		local_storage: {
			getInitMergerfsStatus: vi.fn(async () => ({ data: { data: 'initialized' } })),
			initMergerfs: vi.fn(),
			updateMergerfsInfo: vi.fn(async () => ({})),
		},
		container: { updateState: vi.fn() },
		...apiOverrides,
	}
	const $openAPI = { appGrid: { getAppGrid: vi.fn(async () => ({ data: { data: [] } })) }, appCompose: { setComposeAppStatus: vi.fn() } }
	const wrapper = mount(SnapRaidCreate, { props, global: { plugins: [Buefy, i18n], mocks: { $api, $openAPI, require: () => '' } } })
	const toast = vi.spyOn(wrapper.vm.$buefy.toast, 'open').mockImplementation(() => {})
	const create = () => wrapper.findAll('button').find(b => b.text() === 'Create and protect')
	return { wrapper, $api, toast, create }
}

describe('the SnapRAID dialog', () => {
	it('asks for two drives at least, and offers no system storage', async () => {
		const { wrapper } = dialog({ storages: [storages[2]], drives: [] })
		expect(wrapper.text()).toContain('Plug at least two drives to make a SnapRAID.')
		expect(wrapper.vm.disks).toEqual([])
	})

	it('suggests the biggest drive left for the protection and says what is erased', async () => {
		const { wrapper, create } = dialog({ storages, drives })
		expect(wrapper.vm.disks.map(d => d.key)).toEqual(['/media/Movies', '/media/Series', '/dev/sdc'])
		wrapper.vm.dataKeys = ['/media/Movies', '/media/Series']
		await flushPromises()
		expect(wrapper.vm.parityKey).toBe('/dev/sdc')
		expect(wrapper.text()).toContain('The merged storage holds 7.28 TB')
		expect(wrapper.text()).toContain('Erased: sdc (Ironwolf).')
		expect(create().attributes('disabled')).toBeDefined()
	})

	it('keeps the drive picked for the protection while it is still on offer', async () => {
		const { wrapper } = dialog({ storages, drives })
		wrapper.vm.dataKeys = ['/dev/sdc']
		wrapper.vm.parityKey = '/media/Series'
		await flushPromises()
		expect(wrapper.vm.parityKey).toBe('/media/Series')
		// the drive picked for the protection is chosen to be merged: another one takes its place
		wrapper.vm.dataKeys = ['/dev/sdc', '/media/Series']
		await flushPromises()
		expect(wrapper.vm.parityKey).toBe('/media/Movies')
	})

	it('warns when the drive for the protection is smaller than a merged one', async () => {
		const { wrapper } = dialog({ storages, drives: [{ ...drives[0], size: 1000 * GB }] })
		wrapper.vm.dataKeys = ['/media/Movies']
		wrapper.vm.parityKey = '/dev/sdc'
		await flushPromises()
		expect(wrapper.text()).toContain('This drive is smaller than the biggest merged drive')
	})

	it('makes nothing until "I AM SURE" is typed, then makes the storage and closes', async () => {
		const { wrapper, $api, toast, create } = dialog({ storages, drives })
		wrapper.vm.dataKeys = ['/media/Movies', '/media/Series']
		wrapper.vm.typed = 'i am sure'
		await flushPromises()
		expect(wrapper.vm.ready).toBe(false)
		wrapper.vm.typed = 'I AM SURE'
		await flushPromises()
		expect(wrapper.vm.ready).toBe(true)
		await create().trigger('click')
		await flushPromises()
		expect($api.storage.create).toHaveBeenCalledWith({ path: '/dev/sdc', name: 'Parity1', format: true })
		expect($api.disks.protectDisks).toHaveBeenCalledWith(['/media/Movies', '/media/Series'], ['/media/Parity1'])
		expect($api.local_storage.updateMergerfsInfo).toHaveBeenCalledWith(expect.objectContaining({ mount_point: '/media/Pool' }))
		expect($api.disks.runSnapraid).toHaveBeenCalledWith('sync')
		expect(toast.mock.calls[0][0]).toMatchObject({ message: 'The SnapRAID storage is created: the first sync is running.', type: 'is-success' })
		expect(wrapper.emitted('changed')).toHaveLength(1)
		expect(wrapper.emitted('close')).toHaveLength(1)
	})

	it('shows the step that failed and why, and tells the manager to read the drives again on close', async () => {
		const protectDisks = vi.fn(async () => {
			throw Object.assign(new Error('409'), { response: { data: { message: 'a parity disk has less room than the fullest data disk' } } })
		})
		const { wrapper, create } = dialog({ storages, drives }, { disks: { protectDisks, runSnapraid: vi.fn() } })
		wrapper.vm.dataKeys = ['/media/Movies', '/media/Series']
		wrapper.vm.typed = 'I AM SURE'
		await flushPromises()
		await create().trigger('click')
		await flushPromises()
		expect(wrapper.vm.phase).toBe('failed')
		expect(wrapper.vm.steps.map(s => s.state)).toEqual(['done', 'failed', 'waiting', 'waiting'])
		expect(wrapper.text()).toContain('a parity disk has less room than the fullest data disk')
		expect(wrapper.emitted('close')).toBeUndefined()
		await wrapper.findAll('button').find(b => b.text() === 'Close').trigger('click')
		expect(wrapper.emitted('changed')).toHaveLength(1)
		expect(wrapper.emitted('close')).toHaveLength(1)
	})
})

describe('the folder of the merged storage', () => {
	async function ready(folder, apiOverrides) {
		const made = dialog({ storages, drives }, apiOverrides)
		made.wrapper.vm.dataKeys = ['/media/Movies', '/media/Series']
		made.wrapper.vm.typed = 'I AM SURE'
		if (folder !== undefined) {
			made.wrapper.vm.folder = folder
		}
		await flushPromises()
		return made
	}

	it('is /media/Pool unless said otherwise, and leaves the apps alone there', async () => {
		const { wrapper, $api } = await ready()
		expect(wrapper.vm.folder).toBe('/media/Pool')
		expect(wrapper.text()).toContain('The merged storage appears in /media/Pool. Your apps keep running.')
		expect(wrapper.text()).not.toContain('Your apps are stopped')
		expect(wrapper.text()).not.toContain('may be hidden')
		expect(wrapper.vm.ready).toBe(true)
		await wrapper.findAll('button').find(b => b.text() === 'Create and protect').trigger('click')
		await flushPromises()
		expect($api.local_storage.updateMergerfsInfo).toHaveBeenCalledWith(expect.objectContaining({ mount_point: '/media/Pool' }))
	})

	it('warns about the apps and the hidden files on /DATA, and merges there', async () => {
		const { wrapper, $api } = await ready(' /DATA/ ')
		expect(wrapper.text()).toContain('Your apps are stopped for a moment')
		expect(wrapper.text()).toContain('may be hidden')
		await wrapper.findAll('button').find(b => b.text() === 'Create and protect').trigger('click')
		await flushPromises()
		expect($api.local_storage.updateMergerfsInfo).toHaveBeenCalledWith(expect.objectContaining({ mount_point: '/DATA' }))
	})

	it('cannot be made with a folder that is no path, or that is a storage', async () => {
		const bad = await ready('media/Pool')
		expect(bad.wrapper.vm.ready).toBe(false)
		expect(bad.wrapper.text()).toContain('Use an absolute folder such as /media/Pool')
		const taken = await ready('/media/Movies/pool')
		expect(taken.wrapper.vm.ready).toBe(false)
		expect(taken.wrapper.text()).toContain('This folder is a storage, holds one or lies inside one.')
		const fine = await ready('/srv/pool')
		expect(fine.wrapper.vm.ready).toBe(true)
	})
})
