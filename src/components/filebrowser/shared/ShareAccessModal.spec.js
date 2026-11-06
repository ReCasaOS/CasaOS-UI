// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import ShareAccessModal from '@/components/filebrowser/shared/ShareAccessModal.vue'

// Sharing a folder from its own menu posted `anonymous: true` and opened no
// dialog at all, so the obvious route was also the one that could not protect
// anything. The same dialog now serves both, which means one thing has to be
// right: a folder with no id yet is created, and an existing share is updated.
// Getting that backwards either loses the new share or writes to `/shares/undefined`.

function modal(share) {
	const create = vi.fn(() => Promise.resolve())
	const update = vi.fn(() => Promise.resolve())
	const vm = {
		share,
		...ShareAccessModal.data.call({ share }),
		users: ['plex', 'anna'],
		$api: { samba: { createShare: create, updateShare: update } },
		$emit: vi.fn(),
		$t: key => key,
	}
	for (const [name, fn] of Object.entries(ShareAccessModal.computed))
		Object.defineProperty(vm, name, { get: () => fn.call(vm) })

	return { vm, create, update, save: () => ShareAccessModal.methods.save.call(vm) }
}

describe('sharing a folder that is not shared yet', () => {
	it('creates the share rather than updating one that has no id', async () => {
		const { vm, create, update, save } = modal({ path: '/DATA/flare' })

		vm.requireAccount = true
		vm.selected.plex = true
		vm.access.plex = 'rw'
		await save()

		expect(update).not.toHaveBeenCalled()
		expect(create).toHaveBeenCalledWith([{
			path: '/DATA/flare',
			anonymous: false,
			username: 'plex',
			members: [{ username: 'plex', read_only: false }],
			time_machine: false,
		}])
		expect(vm.$emit).toHaveBeenCalledWith('reload', { members: [{ username: 'plex', read_only: false }] })
	})

	// Leaving the switch off has to keep working: it is what every share created
	// before this was, and the folder menu's only behaviour until now.
	it('still creates a guest share when no account is asked for', async () => {
		const { create, save } = modal({ path: '/DATA/flare' })

		await save()

		expect(create).toHaveBeenCalledWith([
			{ path: '/DATA/flare', anonymous: true, username: '', members: [], time_machine: false },
		])
	})

	// Nothing has changed, but there is a share to make -- so the button is live.
	it('can be submitted without changing anything', () => {
		expect(modal({ path: '/DATA/flare' }).vm.canSave).toBe(true)
	})

	it('cannot be submitted with an account required and none chosen', () => {
		const { vm } = modal({ path: '/DATA/flare' })
		vm.requireAccount = true

		expect(vm.canSave).toBe(false)
	})
})

describe('changing an existing share', () => {
	it('updates it', async () => {
		const { vm, create, update, save } = modal({ id: 7, path: '/DATA/flare', username: '' })

		vm.requireAccount = true
		vm.selected.plex = true
		vm.selected.anna = true
		vm.access.plex = 'rw'
		vm.access.anna = 'ro'
		await save()

		expect(create).not.toHaveBeenCalled()
		expect(update).toHaveBeenCalledWith(7, {
			anonymous: false,
			username: 'plex',
			members: [{ username: 'plex', read_only: false }, { username: 'anna', read_only: true }],
			time_machine: false,
		})
	})

	// A box running an older CasaOS sends only the one account a share had.
	it('reads a share from before members as its one account, with write access', () => {
		const { vm } = modal({ id: 7, path: '/DATA/flare', username: 'plex' })

		expect(vm.members).toEqual([{ username: 'plex', read_only: false }])
	})

	it('counts a change of access as a change', () => {
		const { vm } = modal({ id: 7, path: '/DATA/flare', members: [{ username: 'plex', read_only: false }] })

		expect(vm.canSave).toBe(false)
		vm.access.plex = 'ro'
		expect(vm.canSave).toBe(true)
	})

	// An unchanged share has nothing to save, which is what tells the two modes
	// apart in the footer.
	it('cannot be saved until something changes', () => {
		const { vm } = modal({ id: 7, path: '/DATA/flare', username: 'plex', time_machine: false })

		expect(vm.canSave).toBe(false)
		vm.timeMachine = true
		expect(vm.canSave).toBe(true)
	})
})

// A CasaOS without members reads username alone: without it a protected share
// would be created, or edited back, as a guest share open to anybody.
describe('a box whose CasaOS knows no members', () => {
	it('gets the account that can write as username, else the first', async () => {
		const { vm, update, save } = modal({ id: 4, path: '/DATA/flare', members: [{ username: 'anna', read_only: true }] })

		vm.selected.plex = true
		vm.access.plex = 'rw'
		await save()

		expect(update).toHaveBeenCalledWith(4, expect.objectContaining({ anonymous: false, username: 'plex' }))

		const ro = modal({ id: 5, path: '/DATA/b', members: [{ username: 'anna', read_only: true }] })
		ro.vm.timeMachine = true
		await ro.save()
		expect(ro.update).toHaveBeenCalledWith(5, expect.objectContaining({ username: 'anna' }))
	})
})

// A member that is not a share account (a share made before, on another
// account) is listed and kept: a save, even of Time Machine alone, must not drop it.
describe('a member the dialog does not know', () => {
	it('is kept on save', async () => {
		const { vm, update, save } = modal({ id: 6, path: '/DATA/old', members: [{ username: 'vince', read_only: false }, { username: 'anna', read_only: true }] })

		expect(vm.accounts).toEqual(['plex', 'anna', 'vince'])
		vm.timeMachine = true
		await save()

		expect(update).toHaveBeenCalledWith(6, expect.objectContaining({
			members: [{ username: 'anna', read_only: true }, { username: 'vince', read_only: false }],
		}))
	})
})
