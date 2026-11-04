import { describe, expect, it, vi } from 'vitest'
import { checkStarred, parentOf } from './starred.js'
import actions from '@/store/actions'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'

const saveShutcutDetail = vi.fn(list => Promise.resolve({ data: { data: list } }))
vi.mock('@/service/api.js', () => ({ default: { users: { saveShutcutDetail: list => saveShutcutDetail(list) } } }))

const listings = {
	'/DATA': [{ path: '/DATA/Projects', is_dir: true, extensions: { share: { shared: 'true' } } }],
	'/DATA/Media': [{ path: '/DATA/Media/notes.txt', is_dir: false, name: 'notes.txt' }, { path: '/DATA/Media/Films', is_dir: false }],
}
const listFolder = vi.fn(path => listings[path] ? Promise.resolve(listings[path]) : Promise.reject(new Error('no such folder')))

describe('the Starred list in the sidebar', () => {
	it('finds each entry in its parent folder, a listing per parent', async () => {
		listFolder.mockClear()
		const list = await checkStarred([
			{ name: 'Projects', path: '/DATA/Projects', type: 'folder', icon: 'folder' },
			{ name: 'notes.txt', path: '/DATA/Media/notes.txt', type: 'file' },
			{ name: 'Gone', path: '/DATA/Media/gone.mkv', type: 'file' },
		], listFolder)

		expect(listFolder).toHaveBeenCalledTimes(2)
		expect(list.map(i => i.unavailable)).toEqual([false, false, true])
		expect(list[0]).toMatchObject({ icon: 'folder-outline', visible: true, extensions: { share: { shared: 'true' } } })
		expect(list[1]).toMatchObject({ icon: 'files-outline', entry: { name: 'notes.txt' } })
		expect(list[2]).toMatchObject({ entry: null, extensions: null })
	})

	it('marks unavailable a folder that became a file, an entry whose folder is gone, and keeps a picked icon', async () => {
		const list = await checkStarred([
			{ name: 'Films', path: '/DATA/Media/Films', type: 'folder', icon: 'media-outline' },
			{ name: 'Old', path: '/DATA/Old/x', type: 'folder' },
		], listFolder)

		expect(list.map(i => i.unavailable)).toEqual([true, true])
		expect(list[0].icon).toBe('media-outline')
	})

	it('takes the root as the parent of a top folder', () => {
		expect(parentOf('/DATA')).toBe('/')
		expect(parentOf('/DATA/Media/a.txt')).toBe('/DATA/Media')
	})

	it('saves files as files and folders as folders, without changing the list it was given', async () => {
		const given = [{ name: 'notes.txt', path: '/DATA/notes.txt', type: 'file' }, { name: 'Old', path: '/DATA/Old', casamod: 'pin-side-panel' }]
		const commit = vi.fn()

		await actions.SET_SHORTCUT_DATA({ commit }, given)

		const saved = saveShutcutDetail.mock.calls[0][0]
		expect(saved.map(s => [s.type, s.icon])).toEqual([['file', 'files-outline'], ['folder', 'folder']])
		expect(saved[1].casamod).toBe('pin-side-panel')
		expect(given[1].type).toBeUndefined()
		expect(commit).toHaveBeenCalledWith('SET_SHORTCUT_DATA', saved)
	})

	it('has its words in English and in French', () => {
		for (const key of ['Starred', 'Add to Starred', 'Remove from Starred', 'Not available: it may have been moved or deleted']) {
			expect(en[key]).toBeTruthy()
			expect(fr[key]).toBeTruthy()
		}
	})
})
