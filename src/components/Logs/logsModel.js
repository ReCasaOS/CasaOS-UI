// Rows of the Logs page: lines and events from the wire, a time-sorted buffer, and the page's small helpers.
export const MAX_LINES = 20000

const RANGES = { '1h': 3600000, '24h': 86400000, '7d': 7 * 86400000 }
const EVENT_LEVELS = { 'died': 'error', 'oom-killed': 'error', 'unhealthy': 'error', 'restarting': 'error', 'stopped': 'warn', 'uninstalled': 'warn' }

// djb2: a cheap, stable 32-bit hash, for keys (written base36) and colours only
function hash(s) {
	s = String(s ?? '')
	let h = 5381
	for (let i = 0; i < s.length; i++) {
		h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
	}
	return h
}

// Same rule as the server's GuessLevel; stderr is at least a warning.
export function levelOf(stream, text = '') {
	if (/\b(?:error|err|fatal|panic)(?:\b|_)/i.test(text)) {
		return 'error'
	}
	return stream === 'e' || /\bwarn/i.test(text) ? 'warn' : 'info'
}

export const colorOf = appService => (appService ? hash(appService) % 12 : 0)

function parseJson(text) {
	const t = text.trim()
	if (!t.startsWith('{') && !t.startsWith('[')) {
		return null
	}
	try {
		return JSON.parse(t)
	} catch {
		return null
	}
}

function sentence(e) {
	const who = `${e.app}/${e.service || e.container}`
	if (e.kind === 'died') {
		return e.exit_code == null ? `${who} died` : `${who} died, exit code ${e.exit_code}`
	}
	if (e.from_image && e.to_image) {
		return `${who} ${e.kind} from ${e.from_image} to ${e.to_image}`
	}
	return `${who} ${String(e.kind).replace(/-/g, ' ')}`
}

// an unparsable time still renders, at the epoch
function dateOf(at) {
	const d = new Date(at)
	return Number.isNaN(d.getTime()) ? new Date(0) : d
}

// A wire line or event → a row; an event is told apart by its kind. Never throws, so a bad row cannot wedge a source.
export function toRow(x) {
	x ??= {}
	const { at, app, service, container } = x
	if (x.kind) {
		return { kind: 'event', at: dateOf(at), key: `event/${app}/${container}/${x.kind}/${at}`, app, service, container, event: x, level: EVENT_LEVELS[x.kind] || 'info', text: sentence(x) }
	}
	const text = String(x.text ?? '')
	return { kind: 'line', at: dateOf(at), key: `${app}/${service}/${container}/${at}/${hash(text).toString(36)}`, app, service, container, stream: x.stream, level: levelOf(x.stream, text), text, json: parseJson(text) }
}

// Merges rows into a buffer sorted by at, skipping known keys, trimmed to MAX_LINES from the front.
// keys is the caller's Set of the buffer's keys and is updated in place (returned as is); the buffer array is never changed.
export function insertRows(buffer, rows, keys = new Set(buffer.map(r => r.key))) {
	const fresh = rows.filter((r) => {
		if (keys.has(r.key)) {
			return false
		}
		keys.add(r.key)
		return true
	})
	let out
	const last = buffer.at(-1)?.at ?? -Infinity
	if (fresh.every((r, i) => r.at >= (i ? fresh[i - 1].at : last))) {
		out = buffer.concat(fresh) // the live case: a batch newer than the buffer, in order
	} else {
		fresh.sort((a, b) => a.at - b.at)
		out = []
		let i = 0
		let j = 0
		while (i < buffer.length || j < fresh.length) {
			// on a tie the row already there stays first
			out.push(j >= fresh.length || (i < buffer.length && buffer[i].at <= fresh[j].at) ? buffer[i++] : fresh[j++])
		}
	}
	const dropped = Math.max(0, out.length - MAX_LINES)
	for (let i = 0; i < dropped; i++) {
		keys.delete(out[i].key)
	}
	return { buffer: dropped ? out.slice(dropped) : out, keys, dropped }
}

export const skippedMarker = (n, at) => ({ kind: 'marker', key: `marker/${at?.getTime?.() || 0}/${n}`, at, n, text: n ? `${n} lines skipped` : 'lines skipped' })

const first = v => [].concat(v ?? []).find(x => typeof x === 'string') ?? ''

export function parseQuery(route) {
	const q = route?.query ?? {}
	return { app: first(q.app), at: first(q.at), box: first(q.box) }
}

export function rangeBounds(range, now, custom) {
	if (range === 'custom') {
		return { since: custom?.since ?? null, until: custom?.until ?? null }
	}
	return { since: RANGES[range] ? new Date(now.getTime() - RANGES[range]) : null, until: null }
}

// A cursor just before a moment, for a forwards walk from it: the server orders by time first.
// Written as text: nanoseconds since 1970 pass Number's precision.
export const cursorAt = date => `${new Date(date).getTime() - 1}999999:0:_`
