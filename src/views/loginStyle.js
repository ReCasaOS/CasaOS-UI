// Which login page the box shows: 'classic' (the default) or 'beta' (the new
// one, opt-in from the settings menu, as the new dashboard is). The login page
// has no session to read a user's settings with, so the user service keeps the
// choice for the whole box and says it to anybody in GET /v1/users/status. The
// router's guard asks that before every page (needInit) and puts the answer in
// the store; this browser keeps the last one too, for a box it cannot reach.

export const LOGIN_STYLES = ['classic', 'beta']
export const LOGIN_STYLE_KEY = 'login-style'

function storageOf(storage) {
	return storage ?? (typeof localStorage === 'undefined' ? null : localStorage)
}

// The style this browser saw last; 'classic' when it saw none, or cannot say.
export function cachedLoginStyle(storage) {
	try {
		const value = storageOf(storage)?.getItem(LOGIN_STYLE_KEY)
		return LOGIN_STYLES.includes(value) ? value : 'classic'
	} catch {
		return 'classic'
	}
}

export function cacheLoginStyle(style, storage) {
	try {
		storageOf(storage)?.setItem(LOGIN_STYLE_KEY, LOGIN_STYLES.includes(style) ? style : 'classic')
	} catch {
		// a browser that keeps nothing shows the classic page first, and then the right one
	}
}

// The style in an answer of GET /v1/users/status; a user service that does
// not know the setting yet says nothing, which is the classic page.
export function loginStyleOf(statusResponse) {
	const value = statusResponse?.data?.data?.login_style
	return LOGIN_STYLES.includes(value) ? value : 'classic'
}
