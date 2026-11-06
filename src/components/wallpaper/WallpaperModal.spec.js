import { describe, expect, it, vi } from 'vitest'
import WallpaperModal from './WallpaperModal.vue'

vi.mock('simple-uploader.js', () => ({ default: class {} }))
vi.mock('./loginWallpaper', async (original) => {
	const real = await original()
	return { ...real, toJPEG: vi.fn(() => Promise.resolve(new Blob(['jpeg']))) }
})

const BUILT_IN = '/built-in-1.jpg'
const FOUND = '/v1/users/image?path=/var/lib/casaos/1/login-wallpaper.jpg&time=1'
const missing = () => Promise.reject(Object.assign(new Error('500'), { response: { status: 500, data: { success: 60001 } } }))
const forbidden = () => Promise.reject(Object.assign(new Error('500'), { response: { status: 500, data: { success: 10012 } } }))

// the dialog's methods on a plain object: the probe for the login file has not answered yet
function dialog({ userId = 1, removeUserImage = vi.fn(() => Promise.resolve({ data: { success: 200 } })) } = {}) {
	const vm = {
		wallpaperItems: [{ path: BUILT_IN }, { path: '/built-in-2.jpg' }],
		backgroundStyleObj: { backgroundImage: '' },
		path: '/dashboard.jpg',
		from: 'Built-in',
		target: 'desktop',
		loginProbed: false,
		loginUploadPath: '',
		isLoading: false,
		choices: { desktop: { path: '/dashboard.jpg', from: 'Built-in' }, login: { path: BUILT_IN, from: 'Built-in' } },
		uploader: { opts: {} },
		$store: { state: { user: { id: userId } } },
		$api: { users: { removeUserImage, uploadUserImage: vi.fn(() => Promise.resolve({ data: { success: 200 } })) } },
		$buefy: { toast: { open: vi.fn() } },
		$emit: vi.fn(),
		$t: s => s,
		getTargetUrl: k => k,
		parseUrl: u => u,
	}
	for (const name of ['onLoginProbed', 'removeImage', 'removeLoginUpload', 'switchTarget', 'saveLogin', 'changeWallpaper'])
		vm[name] = WallpaperModal.methods[name].bind(vm)
	vm.canSetLogin = WallpaperModal.computed.canSetLogin.call(vm)
	return vm
}

describe('the login screen wallpaper in the dialog', () => {
	// before: built-in 1 stayed chosen and Apply deleted the custom file
	it('shows the file the probe finds, even when the login tab was opened first', () => {
		const vm = dialog()
		vm.switchTarget('login')
		expect(vm.path).toBe(BUILT_IN)

		vm.onLoginProbed(FOUND)

		expect(vm.path).toBe(FOUND)
		expect(vm.from).toBe('Login')
		expect(vm.backgroundStyleObj.backgroundImage).toBe(`url(${FOUND})`)
		expect(vm.loginProbed).toBe(true)
	})

	it('keeps what the person picked meanwhile', () => {
		const vm = dialog()
		vm.switchTarget('login')
		vm.changeWallpaper('/built-in-2.jpg')

		vm.onLoginProbed(FOUND)

		expect(vm.path).toBe('/built-in-2.jpg')
		expect(vm.choices.login.path).toBe(FOUND)
	})

	it('waits for the probe before Apply on the login tab', async () => {
		const { readFileSync } = await import('node:fs')
		const source = readFileSync('src/components/wallpaper/WallpaperModal.vue', 'utf8')
		expect(source).toMatch(/:disabled="target === 'login' && !loginProbed" :label="\$t\('Apply'\)"/)
	})

	it('is the first account\'s only', () => {
		expect(dialog({ userId: 1 }).canSetLogin).toBe(true)
		expect(dialog({ userId: 2 }).canSetLogin).toBe(false)
	})

	it('deletes the file for the default one, and a missing file is no failure', async () => {
		const vm = dialog({ removeUserImage: vi.fn(missing) })
		vm.switchTarget('login')
		vm.onLoginProbed('')
		await vm.saveLogin()
		expect(vm.$api.users.removeUserImage).toHaveBeenCalledWith('/var/lib/casaos/1/login-wallpaper.jpg')
		expect(vm.$buefy.toast.open).toHaveBeenCalledWith(expect.objectContaining({ type: 'is-success' }))
	})

	it('says so when the delete is refused', async () => {
		const vm = dialog({ removeUserImage: vi.fn(forbidden) })
		vm.switchTarget('login')
		vm.onLoginProbed(FOUND)
		vm.changeWallpaper(BUILT_IN)
		await vm.saveLogin()
		expect(vm.$buefy.toast.open).toHaveBeenCalledWith(expect.objectContaining({ type: 'is-danger' }))
		expect(vm.$emit).not.toHaveBeenCalledWith('close')
	})

	it('deletes the raw upload once it is a JPEG', async () => {
		const vm = dialog()
		vm.switchTarget('login')
		vm.onLoginProbed('')
		vm.path = 'SERVER_URL/v1/users/image?path=/var/lib/casaos/1/login-wallpaper-upload.svg&time=2'
		vm.from = 'Upload'
		vm.loginUploadPath = '/var/lib/casaos/1/login-wallpaper-upload.svg'
		await vm.saveLogin()
		expect(vm.$api.users.uploadUserImage).toHaveBeenCalled()
		expect(vm.$api.users.removeUserImage).toHaveBeenCalledWith('/var/lib/casaos/1/login-wallpaper-upload.svg')
		expect(vm.loginUploadPath).toBe('')
	})

	it('deletes an upload that was never applied when the dialog closes', async () => {
		const vm = dialog()
		vm.loginUploadPath = '/var/lib/casaos/1/login-wallpaper-upload.png'
		WallpaperModal.beforeUnmount.call(vm)
		await Promise.resolve()
		expect(vm.$api.users.removeUserImage).toHaveBeenCalledWith('/var/lib/casaos/1/login-wallpaper-upload.png')
	})
})
