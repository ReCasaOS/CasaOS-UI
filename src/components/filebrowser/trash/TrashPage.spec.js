// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import TrashPage from '@/components/filebrowser/trash/TrashPage.vue'
import { mixin } from '@/mixins/mixin'
import batch from '@/service/batch'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'

vi.mock('@/service/service', () => ({ api: { delete: vi.fn((url, data) => Promise.resolve({ url, data })) } }))

// an axios error: the core's answer is on response.data
const answered = data => Object.assign(new Error('answered'), { response: { data } })

const item = { trash: '/media/usb', name: 'photo.jpg.2', path: '/media/usb/Photos/photo.jpg', deleted_at: '2026-10-27T10:00:00+01:00', is_dir: false, size: 2048 }

// The page's methods on a stand-in for the component, with the API it calls.
function page(file) {
	const vm = {
		...TrashPage.data(),
		$t: (key, values) => key.replace(/\{(\w+)\}/g, (_, k) => values[k]),
		$buefy: { toast: { open: vi.fn() }, dialog: { confirm: vi.fn() } },
		$api: { file },
	}
	for (const [name, fn] of Object.entries(TrashPage.methods)) {
		vm[name] = fn.bind(vm)
	}
	return vm
}

describe('the trash page', () => {
	it('lists the items with the space they take and how long they stay', async () => {
		const vm = page({ trash: () => Promise.resolve({ data: { data: { items: [item], size: 2048, retention_days: 30 } } }) })

		await vm.load()

		expect(vm.items).toEqual([item])
		expect(vm.size).toBe(2048)
		expect(vm.days).toBe(30)
		expect(vm.isLoading).toBe(false)
		expect(vm.baseName(item.path)).toBe('photo.jpg')
		expect(vm.folderOf(item.path)).toBe('/media/usb/Photos')
		expect(vm.folderOf('/a')).toBe('/')
	})

	it('says when the list cannot be read instead of showing an empty trash', async () => {
		const vm = page({ trash: () => Promise.reject(answered({ message: 'boom' })) })

		await vm.load()

		expect(vm.error).toBe('boom')
		expect(vm.items).toEqual([])
	})

	it('restores by the trash and name the list gave, says where, and reloads', async () => {
		const file = {
			restoreTrash: vi.fn(() => Promise.resolve({ data: { data: ['/media/usb/Photos/photo (restored).jpg'] } })),
			trash: vi.fn(() => Promise.resolve({ data: { data: { items: [], size: 0 } } })),
		}
		const vm = page(file)

		await vm.restore(item)

		expect(file.restoreTrash).toHaveBeenCalledWith([{ trash: '/media/usb', name: 'photo.jpg.2' }])
		expect(vm.$buefy.toast.open).toHaveBeenCalledWith(expect.objectContaining({ message: 'Restored to /media/usb/Photos/photo (restored).jpg', type: 'is-success' }))
		expect(file.trash).toHaveBeenCalled()
		expect(vm.busy).toBe(null)
	})

	it('deletes for good only once confirmed', async () => {
		const file = { deleteTrash: vi.fn(() => Promise.resolve({})), trash: vi.fn(() => Promise.resolve({ data: { data: { items: [] } } })) }
		const vm = page(file)

		vm.confirmDelete(item)
		expect(file.deleteTrash).not.toHaveBeenCalled()
		await vm.$buefy.dialog.confirm.mock.calls[0][0].onConfirm()

		expect(file.deleteTrash).toHaveBeenCalledWith([{ trash: '/media/usb', name: 'photo.jpg.2' }])
	})

	it('shows a file name, a path and an error as text, not as markup', async () => {
		const evil = { ...item, path: '/DATA/<img src=x onerror=alert(1)>' }
		const file = {
			restoreTrash: () => Promise.resolve({ data: { data: [evil.path] } }),
			deleteTrash: () => Promise.reject(answered({ message: 'open /DATA/<i>x</i>: denied' })),
			trash: () => Promise.resolve({ data: { data: { items: [] } } }),
		}
		const vm = page(file)

		vm.confirmDelete(evil)
		await vm.restore(evil)
		await vm.remove(evil)

		const shown = [vm.$buefy.dialog.confirm.mock.calls[0][0].message, ...vm.$buefy.toast.open.mock.calls.map(c => c[0].message)]
		expect(shown).toHaveLength(3)
		for (const text of shown) {
			expect(text).not.toMatch(/<(img|i)[\s>]/)
		}
	})

	it('shows a dash for a date that could not be read', () => {
		const vm = page({})
		expect(vm.deletedOn({ deleted_at: '0001-01-01T00:00:00Z' })).toBe('—')
		expect(vm.deletedOn(item)).not.toBe('—')
	})
})

describe('deleting from Files', () => {
	function files(answer) {
		const del = vi.fn(answer)
		const vm = {
			$t: key => key,
			$api: { batch: { delete: del } },
			$store: { state: { shortcutData: [] }, dispatch: vi.fn() },
			$buefy: { toast: { open: vi.fn() }, dialog: { confirm: vi.fn() } },
			$refs: {},
			reload: vi.fn(),
		}
		vm.deleteItem = mixin.methods.deleteItem.bind(vm)
		return { vm, del }
	}

	it('moves to the trash unless asked to delete for good', async () => {
		const { vm, del } = files(() => Promise.resolve({ data: { success: 200 } }))

		vm.deleteItem({ path: '/DATA/a' })
		vm.deleteItem([{ path: '/DATA/b' }], true)
		await vi.waitFor(() => expect(vm.reload).toHaveBeenCalledTimes(2))

		expect(del.mock.calls).toEqual([[JSON.stringify(['/DATA/a']), true], [JSON.stringify(['/DATA/b']), false]])
	})

	it('offers the permanent delete of the refused items only, their names escaped', async () => {
		const refused = [{ path: '/media/ro/<b>x</b>', reason: 'cannot be moved to the trash: read-only file system' }]
		const { vm, del } = files(() => Promise.reject(answered({ success: 60007, data: refused })))

		vm.deleteItem([{ path: '/DATA/a' }, { path: '/media/ro/<b>x</b>' }])
		await vi.waitFor(() => expect(vm.$buefy.dialog.confirm).toHaveBeenCalled())

		// /DATA/a went to the trash: the list is read again
		expect(vm.reload).toHaveBeenCalledTimes(1)
		const dialog = vm.$buefy.dialog.confirm.mock.calls[0][0]
		expect(dialog.message).toContain('&lt;b&gt;x&lt;/b&gt;')
		expect(dialog.message).not.toContain('<b>x</b>')
		expect(dialog.message).toContain('read-only file system')
		dialog.onConfirm()
		expect(del).toHaveBeenLastCalledWith(JSON.stringify(['/media/ro/<b>x</b>']), false)
	})

	it('reads the list again when the trash answers an error, since what it could move is gone', async () => {
		const { vm } = files(() => Promise.reject(answered({ success: 60003, message: 'Delete error' })))

		vm.deleteItem([{ path: '/DATA/a' }, { path: '/DATA/b' }])
		await vi.waitFor(() => expect(vm.reload).toHaveBeenCalledTimes(1))

		expect(vm.$buefy.toast.open).toHaveBeenCalledWith(expect.objectContaining({ message: 'Delete error', type: 'is-danger' }))
	})

	it('closes the context menu rather than toggling it', async () => {
		const { vm } = files(() => Promise.resolve({ data: { success: 200 } }))
		vm.$refs.dropDown = { isActive: true }
		vm.$emit = vi.fn()

		vm.deleteItem({ path: '/DATA/a' })
		await vi.waitFor(() => expect(vm.reload).toHaveBeenCalled())

		expect(vm.$refs.dropDown.isActive).toBe(false)
		expect(vm.$emit).toHaveBeenCalledWith('reload')
	})

	it('asks the core for the trash in the query', async () => {
		const { api } = await import('@/service/service')
		await batch.delete('["/a"]', true)
		await batch.delete('["/a"]')
		expect(api.delete.mock.calls).toEqual([['/batch?to_trash=true', '["/a"]'], ['/batch', '["/a"]']])
	})
})

const KEYS = [
	'Trash',
	'Empty the trash',
	'The trash is empty.',
	'{size} in the trash. Items are deleted for good after {days} days.',
	'Deleted from',
	'Deleted on',
	'Delete permanently',
	'Restored to {path}',
	'Delete {name} permanently? This cannot be undone.',
	'Empty the trash? Everything in it is deleted for good.',
	'These items go to the trash, where you can restore them for {days} days.',
	'Delete permanently instead: this cannot be undone',
	'Cannot move to the trash',
	'These items cannot go to the trash:',
	'Delete them permanently? This cannot be undone.',
]

describe('the language files', () => {
	it.each(KEYS)('say "%s" in English and in French', (key) => {
		expect(en[key]).toBe(key)
		expect(fr[key]).toBeTruthy()
		expect(fr[key]).not.toBe(key)
		expect(fr[key].match(/\{\w+\}/g) || []).toEqual(key.match(/\{\w+\}/g) || [])
		expect(fr[key]).not.toMatch(/\S[:?!;]/)
		expect(fr[key].replace(/\{\w+\}/g, '')).not.toMatch(/[{}|@$]/)
	})
})
