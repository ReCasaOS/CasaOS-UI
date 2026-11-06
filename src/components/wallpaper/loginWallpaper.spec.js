import { describe, expect, it } from 'vitest'
import { findLoginWallpaper, fitWithin, loginWallpaperPath, loginWallpaperURL } from './loginWallpaper'

describe('the login wallpaper', () => {
	it('lives where the user service serves it without a session', () => {
		expect(loginWallpaperPath()).toBe('/var/lib/casaos/1/login-wallpaper.jpg')
		expect(loginWallpaperURL()).toBe('/v1/users/image?path=/var/lib/casaos/1/login-wallpaper.jpg')
		expect(loginWallpaperURL(42)).toMatch(/&time=42$/)
	})

	it('is used when the file loads, and not when it does not', async () => {
		expect(await findLoginWallpaper('/x', () => Promise.resolve())).toBe('/x')
		expect(await findLoginWallpaper('/x', () => Promise.reject(new Error('404')))).toBe('')
	})

	it('shrinks a large image and leaves a small one as it is', () => {
		expect(fitWithin(6000, 4000, 2560)).toEqual({ width: 2560, height: 1707 })
		expect(fitWithin(3000, 5000, 2560)).toEqual({ width: 1536, height: 2560 })
		expect(fitWithin(1920, 1080, 2560)).toEqual({ width: 1920, height: 1080 })
	})
})
