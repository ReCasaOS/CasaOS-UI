// What the box found about framing each app's URL, for the rest of this session.
//
// The frame opens at once and asks while it loads: deciding before opening would
// put the request between the click and `window.open`, and a browser that sees no
// click behind `window.open` blocks it as a popup. So the first time an app turns
// out to refuse the frame, the frame says so and offers a tab; from then on the
// card opens it in a tab straight away, still inside the click.

const STORAGE_KEY = 'appFrameRefused'

const refused = new Set(read())

function read() {
	try {
		const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]')
		return Array.isArray(parsed) ? parsed : []
	} catch {
		return []
	}
}

function write() {
	try {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...refused]))
	} catch {
		// a private window: remembered until the page reloads, which is enough
	}
}

export function frameRefused(url) {
	return refused.has(url)
}

export function rememberFrameRefused(url) {
	refused.add(url)
	write()
}

// for tests
export function forgetFrameChecks() {
	refused.clear()
	write()
}
