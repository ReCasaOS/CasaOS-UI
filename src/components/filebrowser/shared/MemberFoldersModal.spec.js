import { describe, expect, it, vi } from 'vitest'
import MemberFoldersModal from './MemberFoldersModal.vue'

vi.mock('@/components/VirtualMachines/PathPicker.vue', () => ({ default: {} }))

const ok = data => Promise.resolve({ data: { success: 200, data } })

// the dialog of the account anna, on a box with these shares and folders
function dialog({ setUserShares = vi.fn(() => ok('anna')), createShare = vi.fn(() => ok([])) } = {}) {
	const vm = {
		username: 'anna',
		...MemberFoldersModal.data.call({}),
		$api: {
			samba: {
				getShares: () => ok([
					{ id: 1, path: '/DATA/Media', username: 'plex', members: [{ username: 'plex' }, { username: 'anna', read_only: true }] },
					{ id: 2, path: '/DATA/Private', username: 'plex', members: [{ username: 'plex' }] },
					{ id: 3, path: '/DATA/Public', members: [] },
				]),
				setUserShares,
				createShare,
			},
			folder: {
				getList: () => ok({ content: ['AppData', 'Media', 'Private', 'Public', 'Documents', '.hidden'].map(name => ({ name, path: `/DATA/${name}`, is_dir: true })) }),
			},
			storage: { list: () => ok([]) },
		},
		$emit: vi.fn(),
		$t: s => s,
	}
	for (const [name, fn] of Object.entries(MemberFoldersModal.computed))
		Object.defineProperty(vm, name, { get: () => fn.call(vm) })
	for (const name of Object.keys(MemberFoldersModal.methods))
		vm[name] = MemberFoldersModal.methods[name].bind(vm)
	return vm
}

async function opened(options) {
	const vm = dialog(options)
	await MemberFoldersModal.mounted.call(vm)
	return vm
}

describe('the folders of a share account', () => {
	// one stray tick would share the apps' data and secrets
	it('never offers AppData', async () => {
		const vm = await opened()
		expect(vm.rows.map(r => r.path)).not.toContain('/DATA/AppData')
		expect(vm.rows.map(r => r.path)).toEqual(['/DATA/Documents', '/DATA/Media', '/DATA/Private', '/DATA/Public'])
	})

	it('ticks the shares the account is in, and the guest shares', async () => {
		const vm = await opened()
		expect(vm.selected).toMatchObject({ '/DATA/Media': true, '/DATA/Private': false, '/DATA/Public': true })
		expect(vm.access['/DATA/Media']).toBe('ro')
		expect(vm.canSave).toBe(false)
	})

	it('saves the shares there first, then shares a new folder with this account alone', async () => {
		const vm = await opened()
		vm.selected['/DATA/Private'] = true
		vm.access['/DATA/Private'] = 'rw'
		vm.selected['/DATA/Documents'] = true
		vm.access['/DATA/Documents'] = 'ro'

		await vm.save()

		const { setUserShares, createShare } = vm.$api.samba
		// guest shares are not the account's to list
		expect(setUserShares).toHaveBeenCalledWith('anna', [{ id: 1, read_only: true }, { id: 2, read_only: false }])
		expect(createShare).toHaveBeenCalledWith([{
			path: '/DATA/Documents',
			anonymous: false,
			username: 'anna',
			members: [{ username: 'anna', read_only: true }],
			time_machine: false,
		}])
		expect(setUserShares.mock.invocationCallOrder[0]).toBeLessThan(createShare.mock.invocationCallOrder[0])
		expect(vm.$emit).toHaveBeenCalledWith('saved')
	})

	// before, the new shares were made first and stayed when this was refused
	it('creates nothing when the core refuses the change', async () => {
		const setUserShares = vi.fn(() => Promise.reject(Object.assign(new Error('400'), { response: { data: { message: 'a protected share needs at least one account' } } })))
		const vm = await opened({ setUserShares })
		vm.selected['/DATA/Media'] = false
		vm.selected['/DATA/Documents'] = true

		await vm.save()

		expect(vm.$api.samba.createShare).not.toHaveBeenCalled()
		expect(vm.error).toContain('at least one account')
		expect(vm.$emit).not.toHaveBeenCalledWith('close')
	})
})
