// The console login of the Terminal: what is typed at the prompt.

export const LOGIN_USER_KEY = 'terminal_user'
export const LOGIN_PORT_KEY = 'terminal_port'
// whether the Terminal opens full screen; this browser's choice
export const FULLSCREEN_KEY = 'terminal_fullscreen'

export function opensFullScreen(storage = globalThis.localStorage) {
	try {
		return storage?.getItem(FULLSCREEN_KEY) === 'true'
	} catch {
		return false
	}
}

export function setOpensFullScreen(on, storage = globalThis.localStorage) {
	try {
		storage?.setItem(FULLSCREEN_KEY, on ? 'true' : 'false')
	} catch {
		// a browser that keeps nothing opens it in the window
	}
}

// "vince", or "vince:2222" for SSH on another port; the port last used
// otherwise, 22 the first time.
export function parseLogin(text, savedPort) {
	const [user, port] = String(text || '').trim().split(':')
	const n = Number.parseInt(port || savedPort || '22', 10)
	return { user: user || '', port: n > 0 && n < 65536 ? n : 22 }
}
