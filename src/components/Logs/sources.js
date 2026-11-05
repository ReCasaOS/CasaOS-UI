// The two live sources of the Logs page: a WebSocket on this box, a poller through the fleet relay for another box.
import { toRow } from './logsModel'

// The stream carries no cursor: after a reconnect the page fills the gap with one history query and merges by key.
export function createLocalStream({ url, WebSocket = globalThis.WebSocket, onRows, onLag, onState, setTimeout = globalThis.setTimeout, clearTimeout = globalThis.clearTimeout, now = Date.now }) {
	let socket = null
	let timer = null
	let delay = 1000
	let openedAt = null
	let active = false
	let pending = []
	let flushTimer = null

	// rows of one macrotask reach the page as one batch
	function queue(row) {
		pending.push(row)
		flushTimer ??= setTimeout(() => {
			const rows = pending
			pending = []
			flushTimer = null
			onRows(rows)
		}, 0)
	}

	function lost(ws) {
		if (ws !== socket || !active) {
			return
		}
		socket = null
		if (openedAt !== null && now() - openedAt >= 5000) {
			delay = 1000
		}
		openedAt = null
		onState?.('retrying')
		timer = setTimeout(connect, delay)
		delay = Math.min(delay * 2, 30000)
	}

	function connect() {
		timer = null
		let ws
		try {
			ws = new WebSocket(url())
		} catch {
			ws = {}
		}
		socket = ws
		ws.onopen = () => {
			openedAt = now()
			onState?.('open')
		}
		ws.onmessage = (ev) => {
			try {
				const m = JSON.parse(ev.data)
				if (m.t === 'line' || m.t === 'event') {
					queue(toRow(m[m.t]))
				} else if (m.t === 'lag') {
					onLag?.(m.dropped)
				}
			} catch {
				// a malformed message is dropped
			}
		}
		ws.onclose = () => lost(ws)
		ws.onerror = () => lost(ws)
		if (!ws.close) {
			lost(ws) // the constructor threw
		}
	}

	return {
		start() {
			if (!active) {
				active = true
				delay = 1000
				connect()
			}
		},
		stop() {
			active = false
			clearTimeout(timer)
			timer = null
			clearTimeout(flushTimer)
			flushTimer = null
			pending = []
			socket?.close?.()
			socket = null
			onState?.('closed')
		},
	}
}

// Each tick asks forwards from the cursor and follows `next` for at most maxPages pages.
// When the last page still has a `next`, the view is behind: onSkipped() lets the page show a marker, and the next
// tick goes on from the same cursor; 5 pages × 500 lines per 3 s (≈830 lines/s) catches up with any real app,
// so the marker means "behind", not "lines lost". A tick is scheduled only once the previous one has finished.
export function createRelayPoller({ ask, intervalMs = 3000, maxPages = 5, onRows, onSkipped, onState, since = '', setTimeout = globalThis.setTimeout, clearTimeout = globalThis.clearTimeout }) {
	let cursor = since
	let timer = null
	let active = false
	let generation = 0
	let failing = false

	async function tick() {
		timer = null
		const mine = generation
		try {
			for (let pages = 1; ; pages++) {
				const res = await ask(cursor ? { since: cursor, limit: 500 } : { limit: 500 })
				if (mine !== generation) {
					return
				}
				if (!res?.ok) {
					failing = true
					onState?.('retrying')
					break
				}
				if (failing) {
					failing = false
					onState?.('open')
				}
				const { lines = [], events = [], next = '' } = res.data ?? {}
				// the cursor moves before the rows are handed over, so a throwing handler cannot replay the page forever
				cursor = next || cursor
				const rows = [...lines, ...events].map(toRow)
				if (rows.length) {
					onRows(rows)
				}
				if (!next) {
					break
				}
				if (pages >= maxPages) {
					onSkipped?.()
					break
				}
			}
		} catch {
			// a thrown ask or handler: shown as a failure, and the chain goes on
			failing = true
			onState?.('retrying')
		}
		if (mine === generation && active) {
			timer = setTimeout(tick, intervalMs)
		}
	}

	return {
		start() {
			if (!active) {
				active = true
				tick()
			}
		},
		stop() {
			active = false
			generation++
			clearTimeout(timer)
			timer = null
		},
	}
}
