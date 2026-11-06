import { afterEach, describe, expect, it, vi } from 'vitest'
import CasaWallpaper from './CasaWallpaper.vue'

describe('wallpaper dialog', () => {
	it('closes with Escape', () => {
		const open = vi.fn()
		CasaWallpaper.methods.showChangeWallpaperModal.call({ $buefy: { modal: { open } } })

		expect(open).toHaveBeenCalledWith(expect.objectContaining({ canCancel: ['escape'] }))
	})
})

describe('the login screen wallpaper', () => {
	const watcher = CasaWallpaper.watch['$route.path'].handler
	// the tests swap the browser's Image and localStorage: put them back
	const { Image, localStorage } = globalThis
	afterEach(() => {
		globalThis.Image = Image
		globalThis.localStorage = localStorage
	})

	function background(path, found) {
		const vm = {
			$route: { path },
			$store: { state: { wallpaperObject: { path: '/built-in.jpg' } } },
			backgroundStyleObj: { backgroundImage: 'url(/dashboard.jpg)' },
			parseUrl: url => url,
		}
		globalThis.Image = class {
			get src() {
				return this.url
			}

			set src(url) {
				this.url = url
				setTimeout(() => (found ? this.onload() : this.onerror()), 0)
			}
		}
		watcher.call(vm, path)
		return vm
	}

	it('shows the login wallpaper on the login page when there is one', async () => {
		const vm = background('/login', true)
		await new Promise(resolve => setTimeout(resolve, 5))
		expect(vm.backgroundStyleObj.backgroundImage).toMatch(/login-wallpaper\.jpg/)
	})

	it('keeps the built-in one when there is none', async () => {
		const vm = background('/login', false)
		await new Promise(resolve => setTimeout(resolve, 5))
		expect(vm.backgroundStyleObj.backgroundImage).toBe('url(/dashboard.jpg)')
	})

	it('puts the dashboard\'s back once signed in', () => {
		globalThis.localStorage = { getItem: () => null }
		const vm = background('/', false)
		expect(vm.backgroundStyleObj.backgroundImage).toBe('url(/built-in.jpg)')
	})
})
