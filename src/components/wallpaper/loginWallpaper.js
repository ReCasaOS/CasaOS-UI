// The login screen's own wallpaper. The login page has no session to read the
// user's settings with, so the wallpaper is a file at a known place: a JPEG in
// the first user's image folder, which the user service serves to anybody, as
// it does the avatar the login page shows. No file: the built-in wallpaper.

export const LOGIN_WALLPAPER_KEY = 'login-wallpaper'
export const LOGIN_WALLPAPER_NAME = `${LOGIN_WALLPAPER_KEY}.jpg`
export const LOGIN_WALLPAPER_USER = 1

// where the user service keeps the file of user id
export function loginWallpaperPath(userId = LOGIN_WALLPAPER_USER) {
	return `/var/lib/casaos/${userId}/${LOGIN_WALLPAPER_NAME}`
}

// the file's address; bust keeps a browser from showing the one it cached
export function loginWallpaperURL(bust = '') {
	return `/v1/users/image?path=${loginWallpaperPath()}${bust ? `&time=${bust}` : ''}`
}

// Resolves to the address when there is a login wallpaper, to '' otherwise.
// loadImage is the browser's Image, replaced in tests.
export function findLoginWallpaper(url = loginWallpaperURL(Date.now()), loadImage = defaultLoadImage) {
	return loadImage(url).then(() => url, () => '')
}

function defaultLoadImage(url) {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.onload = () => resolve(img)
		img.onerror = reject
		img.src = url
	})
}

// The size an image is drawn at: within maxSide on its longer side, never
// larger than it is.
export function fitWithin(width, height, maxSide) {
	const scale = Math.min(1, maxSide / Math.max(width, height))
	return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

// Any image the page can show (a built-in one, an upload) as a JPEG blob of
// at most maxSide pixels: one name and format for the login page to find, and
// no ten-megabyte photo to load before the password box.
export async function toJPEG(src, maxSide = 2560, quality = 0.85) {
	const img = await defaultLoadImage(src)
	const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, maxSide)
	const canvas = document.createElement('canvas')
	canvas.width = width
	canvas.height = height
	canvas.getContext('2d').drawImage(img, 0, 0, width, height)
	return new Promise((resolve, reject) => {
		canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('the image could not be converted'))), 'image/jpeg', quality)
	})
}
