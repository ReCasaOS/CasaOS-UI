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
		vm.username = 'plex'
		await save()

		expect(update).not.toHaveBeenCalled()
		expect(create).toHaveBeenCalledWith([{
			path: '/DATA/flare',
			anonymous: false,
			username: 'plex',
			time_machine: false,
		}])
		expect(vm.$emit).toHaveBeenCalledWith('reload', { username: 'plex' })
	})

	// Leaving the switch off has to keep working: it is what every share created
	// before this was, and the folder menu's only behaviour until now.
	it('still creates a guest share when no account is asked for', async () => {
		const { create, save } = modal({ path: '/DATA/flare' })

		await save()

		expect(create).toHaveBeenCalledWith([
			{ path: '/DATA/flare', anonymous: true, username: '', time_machine: false },
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
		vm.username = 'plex'
		await save()

		expect(create).not.toHaveBeenCalled()
		expect(update).toHaveBeenCalledWith(7, { username: 'plex', time_machine: false })
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
