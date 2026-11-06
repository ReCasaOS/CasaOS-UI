// Where signing in leads: the page the guard turned away, when it is a page of
// this dashboard, else the dashboard.
//
// The redirect comes from the address bar, so anyone can write it into a link.
// Only a path of this app is followed: it starts with one "/" and nothing that
// a browser or the router could read as another host, however it is encoded.
// The router runs on the hash ("#/…"), so even a path that slipped through
// stays on this page; the check is there so that never depends on the router.

const MAX_LENGTH = 2048
// layers of percent-encoding looked through: "%252F" is "/" twice over
const MAX_DECODES = 3

// What a browser takes as the start of another host: "//host", "/\host"
// (backslash is a slash to browsers), and a space after the first slash to be
// safe.
function leavesTheApp(path) {
	return !path.startsWith('/') || /^\/[\s/\\]/.test(path)
}

// Tabs, newlines and other control characters, which URL parsers drop, so
// "/<tab>/host" is "//host" to a browser. None is ever in a path of this app.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x1F\x7F]/

function isLoginOrLogout(path) {
	const page = path.split(/[?#]/)[0].replace(/\/+$/, '').toLowerCase()
	return page === '/login' || page === '/logout'
}

export function afterLogin(redirect) {
	if (typeof redirect !== 'string' || redirect.length === 0 || redirect.length > MAX_LENGTH) {
		return '/'
	}
	// the router writes spaces as %20; a raw one is not from a link it made
	if (redirect.includes(' ')) {
		return '/'
	}
	let layer = redirect
	for (let i = 0; i <= MAX_DECODES; i++) {
		if (CONTROL.test(layer) || leavesTheApp(layer) || isLoginOrLogout(layer)) {
			return '/'
		}
		let next
		try {
			next = decodeURIComponent(layer)
		} catch {
			// a lone "%" or a broken sequence: not something the router wrote
			return '/'
		}
		if (next === layer) {
			return redirect
		}
		layer = next
	}
	// still encoded after that many layers: nobody links like that
	return '/'
}
