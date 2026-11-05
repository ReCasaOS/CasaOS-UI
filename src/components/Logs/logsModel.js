// Rows of the Logs page: lines and events from the wire, a time-sorted buffer, and the page's small helpers.
export const MAX_LINES = 20000

const RANGES = { '1h': 3600000, '24h': 86400000, '7d': 7 * 86400000 }
const EVENT_LEVELS = { 'died': 'error', 'oom-killed': 'error', 'unhealthy': 'error', 'restarting': 'error', 'stopped': 'warn', 'uninstalled': 'warn' }

// djb2, base36: cheap and stable, for keys and colours only
function hash(s = '') {
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

export const colorOf = appService => hash(appService) % 12

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
		return `${who} died, exit code ${e.exit_code}`
	}
	if (e.from_image && e.to_image) {
		return `${who} ${e.kind} from ${e.from_image} to ${e.to_image}`
	}
	return `${who} ${String(e.kind).replace(/-/g, ' ')}`
}

// A wire line or event → a row; an event is told apart by its kind.
export function toRow(x) {
	const { at, app, service, container } = x
	if (x.kind) {
		return { kind: 'event', at: new Date(at), key: `event/${app}/${container}/${x.kind}/${at}`, app, service, container, event: x, level: EVENT_LEVELS[x.kind] || 'info', text: sentence(x) }
	}
	const text = x.text ?? ''
	return { kind: 'line', at: new Date(at), key: `${app}/${service}/${container}/${at}/${hash(text).toString(36)}`, app, service, container, stream: x.stream, level: levelOf(x.stream, text), text, json: parseJson(text) }
}

// Merges rows into a buffer sorted by at, skipping known keys, trimmed to MAX_LINES from the front.
// keys defaults to the buffer's own; neither input is changed. Returns {buffer, keys, dropped}.
export function insertRows(buffer, rows, keys = new Set(buffer.map(r => r.key))) {
	const known = new Set(keys)
	const fresh = rows.filter((r) => {
		if (known.has(r.key)) {
			return false
		}
		known.add(r.key)
		return true
	}).sort((a, b) => a.at - b.at)
	const out = []
	let i = 0
	let j = 0
	while (i < buffer.length || j < fresh.length) {
		// on a tie the row already there stays first
		out.push(j >= fresh.length || (i < buffer.length && buffer[i].at <= fresh[j].at) ? buffer[i++] : fresh[j++])
	}
	const dropped = Math.max(0, out.length - MAX_LINES)
	for (const r of out.slice(0, dropped)) {
		known.delete(r.key)
	}
	return { buffer: dropped ? out.slice(dropped) : out, keys: known, dropped }
}

export const skippedMarker = (n, at) => ({ kind: 'marker', key: `marker/${at.getTime()}/${n}`, at, n, text: n ? `${n} lines skipped` : 'lines skipped' })

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
