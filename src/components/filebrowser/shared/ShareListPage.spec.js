// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import ShareListPage from '@/components/filebrowser/shared/ShareListPage.vue'

// Every row says who can open the folder, and a share with no account has to say
// so out loud. "Nothing in that column" is exactly what a guest share looked like
// before, which is how somebody upgraded specifically to protect a share and
// could not tell that none of theirs were.

function page(shares) {
	const vm = {
		list: [],
		isLoading: true,
		$api: { samba: { getShares: vi.fn(() => Promise.resolve({ data: { data: shares } })) } },
	}

	return { vm, load: () => ShareListPage.methods.getSharedList.call(vm) }
}

describe('the shared folders list', () => {
	it('keeps the account, so the row can name it', async () => {
		const { vm, load } = page([{ id: 1, path: '/DATA/flare', username: 'plex' }])

		await load()

		expect(vm.list[0].username).toBe('plex')
		// glued onto the name it cannot be styled, and it reads as part of the folder
		expect(vm.list[0].name).toBe('flare')
	})

	it('leaves a guest share with no account, which the row reads as Everyone', async () => {
		const { vm, load } = page([{ id: 2, path: '/DATA/media' }])

		await load()

		expect(vm.list[0].username).toBe('')
		expect(vm.list[0].name).toBe('media')
	})

	it('survives a request that fails rather than showing a stale list', async () => {
		const vm = { list: [{ name: 'old' }], isLoading: false, $api: { samba: { getShares: () => Promise.reject(new Error('nope')) } } }

		await ShareListPage.methods.getSharedList.call(vm)

		expect(vm.list).toEqual([])
		expect(vm.isLoading).toBe(false)
	})
})
