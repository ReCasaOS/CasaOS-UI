// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/plugins/i18n'
import StorageItem from '@/components/Storage/StorageItem.vue'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('lottie-web-vue', () => ({ default: { name: 'lottie-animation', template: '<div/>' } }))

const array = { name: 'md0', path: '/dev/md0', level: 'raid5', state: 'ok', action: 'idle', progress: -1, remaining: -1, missing: 0, members: [{ name: 'sdb', disk: 'sdb', state: 'active' }, { name: 'sdc', disk: 'sdc', state: 'active' }, { name: 'sdd', disk: 'sdd', state: 'active' }] }
const raidItem = { name: 'test', disk: '/dev/md0', path: '/dev/md0', mount_point: '/media/test', fsType: 'ext4', usePercent: 10, size: 98000000000, availSize: 97000000000, raid: array }
const driveItem = { name: 'Backup', disk: '/dev/sdb', path: '/dev/sdb1', mount_point: '/media/Backup', fsType: 'ext4', usePercent: 10, size: 98000000000, availSize: 97000000000 }

function storageItem(item, api = {}) {
	const wrapper = mount(StorageItem, {
		props: { item },
		global: { plugins: [Buefy, i18n], mocks: { require: () => '', $api: { disks: { deleteRaid: vi.fn(() => Promise.resolve({})), umount: vi.fn(() => Promise.resolve({ data: { success: 200 } })), ...api } } } },
	})
	const prompt = vi.spyOn(wrapper.vm.$buefy.dialog, 'prompt').mockImplementation(() => {})
	const toast = vi.spyOn(wrapper.vm.$buefy.toast, 'open').mockImplementation(() => {})
	const remove = () => wrapper.findAll('button').find(b => b.text() === 'Remove').trigger('click')
	return { wrapper, prompt, toast, remove }
}

describe('removing a storage', () => {
	it('asks an array for its name typed again, as the array is erased and not unmounted', async () => {
		const { prompt, remove } = storageItem(raidItem)
		await remove()
		const dialog = prompt.mock.calls[0][0]
		expect(dialog.title).toBe('Delete md0?')
		expect(dialog.message).toContain('Everything on md0 is erased and its disks are left blank')
		expect(dialog.message).toContain('Type md0 to delete it')
		expect(dialog.inputAttrs.pattern).toBe('^md0$')
	})

	it('deletes the array with the name typed, then reads the list again', async () => {
		const deleteRaid = vi.fn(() => Promise.resolve({}))
		const { wrapper, prompt, toast, remove } = storageItem(raidItem, { deleteRaid })
		await remove()
		await prompt.mock.calls[0][0].onConfirm('md0')
		await flushPromises()
		expect(deleteRaid).toHaveBeenCalledWith('md0', 'md0')
		expect(toast.mock.calls[0][0].message).toBe('md0 is deleted. Its disks are blank.')
		expect(wrapper.emitted('getDiskList')).toHaveLength(1)
		expect(wrapper.vm.isRemoving).toBe(false)
	})

	it('says why when the array is refused, and reads nothing again', async () => {
		const refused = Object.assign(new Error('409'), { response: { data: { message: 'this array is part of the merged storage' } } })
		const deleteRaid = vi.fn(() => Promise.reject(refused))
		const { wrapper, prompt, toast, remove } = storageItem(raidItem, { deleteRaid })
		await remove()
		await prompt.mock.calls[0][0].onConfirm('md0')
		await flushPromises()
		expect(toast.mock.calls[0][0]).toMatchObject({ message: 'this array is part of the merged storage', type: 'is-danger' })
		expect(wrapper.emitted('getDiskList')).toBeUndefined()
		expect(wrapper.vm.isRemoving).toBe(false)
	})

	it('lets the button go when the person gives up', async () => {
		const { wrapper, prompt, remove } = storageItem(raidItem)
		await remove()
		prompt.mock.calls[0][0].onCancel()
		expect(wrapper.vm.isRemoving).toBe(false)
	})

	it('still unmounts a drive with the password, as it did', async () => {
		const umount = vi.fn(() => Promise.resolve({ data: { success: 200 } }))
		const deleteRaid = vi.fn()
		const { prompt, remove } = storageItem(driveItem, { umount, deleteRaid })
		await remove()
		const dialog = prompt.mock.calls[0][0]
		expect(dialog.title).toBe('Remove')
		await dialog.onConfirm('secret')
		expect(umount).toHaveBeenCalledWith({ path: '/dev/sdb', password: 'secret' })
		expect(deleteRaid).not.toHaveBeenCalled()
	})
})
