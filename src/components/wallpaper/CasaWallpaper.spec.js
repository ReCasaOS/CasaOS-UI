import { describe, expect, it, vi } from 'vitest'
import CasaWallpaper from './CasaWallpaper.vue'

describe('wallpaper dialog', () => {
	it('closes with Escape', () => {
		const open = vi.fn()
		CasaWallpaper.methods.showChangeWallpaperModal.call({ $buefy: { modal: { open } } })

		expect(open).toHaveBeenCalledWith(expect.objectContaining({ canCancel: ['escape'] }))
	})
})
