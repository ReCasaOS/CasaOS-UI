<template>
	<div :class="{ 'is-embedded': embedded }" class="log-stream">
		<p v-if="state === 'outdated'" class="log-note" role="status">{{ $t('Update this box to read its logs') }}</p>
		<div v-else-if="state === 'error'" class="log-note" role="status">
			<b-button rounded size="is-small" @click="start">{{ $t('Retry') }}</b-button>
		</div>

		<div v-show="state !== 'outdated'" ref="scroller" :style="{ '--log-row': `${rowHeight}px` }" class="log-scroller" @scroll="onScroll">
			<div :style="{ height: `${win.start * rowHeight}px` }" aria-hidden="true"></div>
			<template v-for="row in visibleRows" :key="row.key">
				<div v-if="row.kind === 'event'"
					:class="`is-level-${row.level}`"
					class="log-row is-event"
					role="button"
					tabindex="0"
					@click="$emit('event', row.event)"
					@keydown.enter="$emit('event', row.event)">
					<span :title="row.at.toISOString()" class="log-time">{{ timeOf(row.at) }}</span>
					<b-icon :icon="iconOf(row.event.kind)" class="log-event-icon" size="is-small" />
					<span class="log-text">{{ row.text }}</span>
				</div>
				<div v-else-if="row.kind === 'marker'" class="log-row is-marker">{{ markerText(row) }}</div>
				<div v-else :class="lineClass(row)" class="log-row is-line" @click="expanded = row">
					<span :title="row.at.toISOString()" class="log-time">{{ timeOf(row.at) }}</span>
					<span :class="`hue-${hueOf(row)}`" class="log-label">{{ labelOf(row) }}</span>
					<span class="log-text">{{ row.text }}</span>
					<button v-if="row.json" class="log-json" type="button" @click.stop="expanded = row">{…}</button>
				</div>
			</template>
			<div :style="{ height: `${(buffer.length - win.end) * rowHeight}px` }" aria-hidden="true"></div>
		</div>

		<button v-if="paused && newCount" class="log-banner" type="button" @click="jumpToNow">{{ $t('{n} new lines', { n: newCount }) }}</button>

		<!-- a long line opens over the list: an inline expanded row would break the fixed row height -->
		<div v-if="expanded" class="log-expanded" role="dialog">
			<div class="log-expanded-head">
				<span>{{ expanded.at.toLocaleString() }} · {{ labelOf(expanded) }}</span>
				<button :aria-label="$t('Close')" class="delete" type="button" @click="expanded = null"></button>
			</div>
			<pre>{{ expanded.json ? JSON.stringify(expanded.json, null, 2) : expanded.text }}</pre>
		</div>

		<b-loading :active="state === 'loading'" :is-full-page="false" />
	</div>
</template>

<script>
import { shallowRef } from 'vue'
import FileSaver from 'file-saver'
import { MAX_LINES, colorOf, insertRows, skippedMarker, toRow } from './logsModel'
import { createLocalStream, createRelayPoller } from './sources'
import { visibleRange } from './virtualList'
import { logsApi } from '@/service/logs'
import { instance } from '@/service/service.js'

const PAGE = 500
const FORWARD_PAGE = 1000
const OVERSCAN = 20
const BATCH_MS = 100
const SKIP_EVERY_MS = 5000
const GAP_PAGES = 5
const DOWNLOAD_PAGES = 100
// sorts before every line: a forwards walk from the first one
const ZERO = '0:0:_'

const ICONS = {
	'died': 'skull-outline',
	'oom-killed': 'skull-outline',
	'started': 'play-circle-outline',
	'stopped': 'stop-circle-outline',
	'restarting': 'restart',
	'unhealthy': 'heart-broken',
	'healthy': 'heart-pulse',
	'installed': 'download',
	'uninstalled': 'delete-outline',
	'updated': 'update',
	'image-pulled': 'cloud-download-outline',
	'created': 'plus-circle-outline',
}

// A cursor just before a moment, for a forwards walk from it: the server orders by time first.
// Written as text: nanoseconds since 1970 pass Number's precision.
export const cursorAt = date => `${new Date(date).getTime() - 1}999999:0:_`

const rowsOf = res => [...(res.data?.lines ?? []), ...(res.data?.events ?? [])].map(toRow)
const pad = (n, w = 2) => String(n).padStart(w, '0')
const stamp = d => new Date(d).toISOString().replace(/[-:]|\.\d+/g, '')

export default {
	name: 'LogStream',
	props: {
		box: { type: String, default: null },
		apps: { type: Array, default: () => [] },
		services: { type: Array, default: null },
		// { stream: 'o'|'e'|'', level: 'warn'|'error'|'', q, regex }
		filter: { type: Object, default: () => ({}) },
		// { since, until } as dates, null = live
		range: { type: Object, default: null },
		focusAt: { type: String, default: null },
		embedded: { type: Boolean, default: false },
		wsFactory: { type: Function, default: null },
	},
	emits: ['lag', 'status', 'event'],
	setup() {
		// up to MAX_LINES rows: replaced whole on each merge, never made deeply reactive
		return { buffer: shallowRef([]) }
	},
	data() {
		return {
			state: 'loading', // loading | open | outdated | error
			connected: false,
			paused: false,
			newCount: 0,
			scrollTop: 0,
			viewport: 0,
			expanded: null,
			focused: !!this.focusAt,
			rowHeight: typeof window !== 'undefined' && window.matchMedia?.('(max-width: 768px)').matches ? 20 : 22,
		}
	},
	computed: {
		win() {
			return visibleRange(this.scrollTop, this.viewport || 800, this.rowHeight, this.buffer.length, OVERSCAN)
		},
		visibleRows() {
			return this.buffer.slice(this.win.start, this.win.end)
		},
		sourceKey() {
			return JSON.stringify([this.box, this.apps, this.services, this.filter, this.range, this.focusAt])
		},
	},
	watch: {
		sourceKey() {
			this.focused = !!this.focusAt
			this.start()
		},
	},
	created() {
		// the plumbing, out of Vue's reach
		this.generation = 0
		this.source = null
		this.keys = new Set()
		this.pending = []
		this.held = []
		this.flushTimer = null
		this.lastSkip = 0
		this.manual = false
		this.toasted = false
	},
	mounted() {
		this.measure()
		if (typeof ResizeObserver !== 'undefined') {
			this.observer = new ResizeObserver(() => this.measure())
			this.observer.observe(this.$refs.scroller)
		}
		this.start()
	},
	beforeUnmount() {
		this.generation++
		this.stopSource()
		this.observer?.disconnect()
	},
	methods: {
		params() {
			const f = this.filter || {}
			const p = {}
			if (this.apps?.length) {
				p.app = [...this.apps]
			}
			if (this.services?.length) {
				p.service = [...this.services]
			}
			if (f.stream) {
				p.stream = f.stream
			}
			if (f.level) {
				p.level = f.level
			}
			if (f.q) {
				p.q = f.q
				if (f.regex) {
					p.regex = true
				}
			}
			return p
		},
		until() {
			if (this.focused && this.focusAt) {
				return new Date(Date.parse(this.focusAt) + 60000).toISOString()
			}
			return this.range?.until ? new Date(this.range.until).toISOString() : null
		},
		withUntil(p) {
			const until = this.until()
			return until ? { ...p, until } : p
		},

		// Two reads: the newest page backwards (its `next` is its oldest line's cursor, for "older"), then forwards
		// from there, the same lines again, whose `next` is the newest line's cursor, for catching up.
		async start() {
			this.stopSource()
			const gen = ++this.generation
			this.buffer = []
			this.keys = new Set()
			this.pending = []
			this.held = []
			this.newCount = 0
			this.expanded = null
			this.oldestCursor = ''
			this.newestCursor = ''
			this.exhausted = false
			this.loadingOlder = false
			this.paused = this.focused
			this.manual = this.focused
			this.state = 'loading'
			const base = this.params()
			const first = await logsApi.query(this.box, this.withUntil({ ...base, limit: PAGE }))
			if (gen !== this.generation) {
				return
			}
			if (!first.ok) {
				this.fail(first)
				return
			}
			this.oldestCursor = first.data?.next || ''
			this.exhausted = !this.oldestCursor
			const since = this.oldestCursor || ZERO
			const second = await logsApi.query(this.box, this.withUntil({ ...base, since, limit: FORWARD_PAGE }))
			if (gen !== this.generation) {
				return
			}
			this.merge(second.ok ? [...rowsOf(first), ...rowsOf(second)] : rowsOf(first))
			this.newestCursor = (second.ok && second.data?.next) || since
			this.state = 'open'
			await this.$nextTick()
			if (this.focused) {
				this.scrollToFocus()
			} else {
				this.scrollToBottom()
			}
			// a closed range has nothing live to follow
			if (!this.range?.until) {
				this.startSource(base)
			}
		},
		fail(res) {
			if (res.status === 404) {
				this.state = 'outdated'
				return
			}
			this.state = 'error'
			if (!this.toasted) {
				this.toasted = true
				this.$buefy?.toast.open({ message: res.error || this.$t('Error'), type: 'is-danger' })
			}
		},
		startSource(base) {
			const onState = s => this.sourceState(s)
			if (this.box) {
				this.source = createRelayPoller({
					ask: p => logsApi.query(this.box, { ...base, ...p }),
					since: this.newestCursor,
					onRows: (rows, next) => {
						this.newestCursor = next || this.newestCursor
						this.receive(rows)
					},
					onSkipped: () => this.skipped(),
					onState,
				})
			} else {
				this.source = createLocalStream({
					url: () => logsApi.streamUrl(base, this.$store?.state?.access_token, { wsProtocol: this.$wsProtocol, baseURL: this.$baseURL }),
					WebSocket: this.wsFactory || window.WebSocket,
					onRows: rows => this.receive(rows),
					onLag: (n) => {
						this.$emit('lag', n)
						this.receive([skippedMarker(n, new Date())])
					},
					onState,
				})
			}
			this.source.start()
		},
		stopSource() {
			const source = this.source
			this.source = null
			source?.stop()
			clearTimeout(this.flushTimer)
			this.flushTimer = null
		},
		sourceState(s) {
			// the socket carries no cursor: what was missed while it was down is read from the history
			if (s === 'open' && this.retrying && !this.box) {
				this.fillGap()
			}
			this.retrying = s === 'retrying'
			this.connected = s === 'open'
			this.emitStatus()
		},
		async fillGap() {
			const gen = this.generation
			for (let i = 0; i < GAP_PAGES; i++) {
				const res = await logsApi.query(this.box, { ...this.params(), since: this.newestCursor, limit: FORWARD_PAGE })
				if (gen !== this.generation || !res.ok) {
					return
				}
				this.newestCursor = res.data?.next || this.newestCursor
				this.receive(rowsOf(res))
				if ((res.data?.lines?.length ?? 0) < FORWARD_PAGE) {
					return
				}
			}
		},
		skipped() {
			const now = Date.now()
			if (now - this.lastSkip >= SKIP_EVERY_MS) {
				this.lastSkip = now
				this.receive([skippedMarker(0, new Date())])
			}
		},

		// live rows reach the list at most every 100 ms
		receive(rows) {
			if (!rows.length) {
				return
			}
			this.pending = this.pending.concat(rows)
			this.flushTimer ??= setTimeout(() => this.flush(), BATCH_MS)
		},
		flush() {
			this.flushTimer = null
			const rows = this.pending
			this.pending = []
			if (this.paused) {
				// held aside, not merged: the list under the reader's eyes does not move
				this.held = this.held.concat(rows)
				if (this.held.length > MAX_LINES) {
					this.held = this.held.slice(-MAX_LINES)
				}
				this.newCount = this.held.length
				return
			}
			this.merge(rows)
			this.$nextTick(() => this.scrollToBottom())
		},
		merge(rows) {
			const since = this.range?.since ? new Date(this.range.since) : null
			const kept = since ? rows.filter(r => r.at >= since) : rows
			if (kept.length < rows.length) {
				this.exhausted = true
			}
			this.buffer = insertRows(this.buffer, kept, this.keys).buffer
			this.emitStatus()
		},
		emitStatus() {
			this.$emit('status', { connected: this.connected, lines: this.buffer.length, paused: this.paused })
		},

		measure() {
			this.viewport = this.$refs.scroller?.clientHeight || 0
		},
		onScroll() {
			const el = this.$refs.scroller
			const rh = this.rowHeight
			this.scrollTop = el.scrollTop
			const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2 * rh
			if (!atBottom && !this.paused) {
				this.paused = true
				this.emitStatus()
			} else if (atBottom && this.paused && !this.manual) {
				this.jumpToNow()
			}
			if (el.scrollTop < rh && !this.loadingOlder && !this.exhausted && this.oldestCursor) {
				this.loadOlder()
			}
		},
		async loadOlder() {
			const gen = this.generation
			this.loadingOlder = true
			const res = await logsApi.query(this.box, { ...this.params(), before: this.oldestCursor, limit: PAGE })
			this.loadingOlder = false
			if (gen !== this.generation || !res.ok) {
				return
			}
			this.oldestCursor = res.data?.next || ''
			this.exhausted ||= !this.oldestCursor || this.buffer.length >= MAX_LINES
			const before = this.buffer.length
			this.merge(rowsOf(res))
			const added = this.buffer.length - before
			await this.$nextTick()
			// the rows above push the view down: move it back to the line that was on screen
			const el = this.$refs.scroller
			if (el && added > 0) {
				el.scrollTop += added * this.rowHeight
				this.scrollTop = el.scrollTop
			}
		},
		scrollToBottom() {
			const el = this.$refs.scroller
			if (el) {
				el.scrollTop = el.scrollHeight
				this.scrollTop = el.scrollTop
			}
		},
		scrollToFocus() {
			const el = this.$refs.scroller
			const at = Date.parse(this.focusAt)
			const i = this.buffer.findIndex(r => r.at.getTime() >= at)
			if (el) {
				el.scrollTop = Math.max(0, (i < 0 ? this.buffer.length : i) * this.rowHeight - el.clientHeight / 2)
				this.scrollTop = el.scrollTop
			}
		},

		pause() {
			this.paused = true
			this.manual = true
			this.emitStatus()
		},
		resume() {
			this.jumpToNow()
		},
		jumpToNow() {
			if (this.focused) {
				// the page around a moment is history: now is a fresh live read
				this.focused = false
				this.start()
				return
			}
			this.paused = false
			this.manual = false
			const held = this.held
			this.held = []
			this.newCount = 0
			this.merge(held)
			this.$nextTick(() => this.scrollToBottom())
		},
		clear() {
			this.buffer = []
			this.keys = new Set()
			this.held = []
			this.newCount = 0
			this.expanded = null
			// what was cleared does not come back from the top
			this.exhausted = true
			this.emitStatus()
		},

		// This box streams the export route (the token goes in the header, so a fetch, not a link); a fleet box
		// is read page by page through the relay, whose body is capped.
		async download() {
			const p = this.withUntil(this.params())
			if (this.range?.since) {
				p.since = cursorAt(this.range.since)
			}
			try {
				if (!this.box) {
					const res = await instance.request({ method: 'get', url: logsApi.exportUrl(p), responseType: 'blob' })
					const name = /filename="?([^";]+)"?/.exec(res.headers?.['content-disposition'] || '')?.[1]
					FileSaver.saveAs(res.data, name || 'recasaos-logs.log')
					return
				}
				const out = []
				let cursor = p.since || ZERO
				for (let i = 0; i < DOWNLOAD_PAGES; i++) {
					const res = await logsApi.query(this.box, { ...p, since: cursor, limit: FORWARD_PAGE })
					if (!res.ok) {
						throw new Error(res.error)
					}
					const lines = res.data?.lines ?? []
					for (const l of lines) {
						out.push(`${l.at} ${l.stream} ${l.text}\n`)
					}
					if (lines.length < FORWARD_PAGE || !res.data.next) {
						break
					}
					cursor = res.data.next
				}
				const name = `recasaos-logs-${this.apps?.length === 1 ? this.apps[0] : 'all'}-${this.range?.since ? stamp(this.range.since) : 'start'}-${p.until ? stamp(p.until) : 'now'}.log`
				FileSaver.saveAs(new Blob(out, { type: 'text/plain' }), name)
			} catch (e) {
				this.$buefy?.toast.open({ message: e?.response?.data?.message || e?.message || this.$t('Error'), type: 'is-danger' })
			}
		},

		timeOf(at) {
			return `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}.${pad(at.getMilliseconds(), 3)}`
		},
		labelOf(row) {
			return row.service && row.service !== row.app ? `${row.app}/${row.service}` : row.app || row.container || ''
		},
		hueOf(row) {
			return colorOf(`${row.app}/${row.service}`)
		},
		lineClass(row) {
			return { 'is-level-error': row.level === 'error', 'is-level-warn': row.level === 'warn', 'is-stderr': row.stream === 'e' }
		},
		iconOf(kind) {
			return ICONS[kind] || 'information-outline'
		},
		markerText(row) {
			return row.n ? this.$t('{n} lines skipped', { n: row.n }) : this.$t('Lines skipped')
		},
	},
}
</script>

<style lang="scss" scoped>
.log-stream {
	position: relative;
	display: flex;
	flex-direction: column;
	flex: 1 1 auto;
	min-height: 12rem;
	height: 100%;
}

.log-note {
	padding: 1rem;
	text-align: center;
	color: var(--casa-text-hint);
}

.log-scroller {
	flex: 1 1 auto;
	min-height: 0;
	overflow: auto;
	border-radius: 0.5rem;
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 0.75rem;
	background: var(--casa-surface-sunken);
	border: 1px solid var(--casa-border);
}

.log-row {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	height: var(--log-row);
	padding: 0 0.5rem;
	line-height: var(--log-row);
	white-space: pre;
	cursor: pointer;

	&:hover {
		background: var(--casa-hover-tint);
	}

	&.is-level-warn {
		background: rgb(245 166 35 / 12%);
	}

	&.is-level-error {
		background: rgb(255 59 48 / 12%);
	}

	&.is-stderr .log-text {
		color: #c0504d;
	}

	&.is-event {
		font-weight: 500;
		border-top: 1px solid var(--casa-border);
	}

	&.is-marker {
		justify-content: center;
		color: var(--casa-text-hint);
		font-style: italic;
		cursor: default;
	}
}

.log-time {
	flex-shrink: 0;
	color: var(--casa-text-hint);
}

.log-label {
	flex-shrink: 0;
	max-width: 12rem;
	overflow: hidden;
	text-overflow: ellipsis;
}

.log-text {
	flex: 1 1 auto;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
}

.log-json {
	flex-shrink: 0;
	padding: 0 0.25rem;
	border: 1px solid var(--casa-border);
	border-radius: 0.25rem;
	color: inherit;
	background: transparent;
	font: inherit;
	cursor: pointer;
}

$hues: #e6194b, #3cb44b, #c9a300, #4363d8, #f58231, #911eb4, #1fa8b8, #d03fd0, #7a9a00, #d6618f, #008080, #9a6324;

@for $i from 0 through 11 {
	.hue-#{$i} {
		color: nth($hues, $i + 1);
	}
}

.log-banner {
	position: absolute;
	bottom: 1rem;
	left: 50%;
	transform: translateX(-50%);
	padding: 0.25rem 0.75rem;
	border: 0;
	border-radius: 1rem;
	color: #fff;
	background: var(--casa-primary, #3273dc);
	box-shadow: 0 2px 8px rgb(0 0 0 / 20%);
	cursor: pointer;
}

.log-expanded {
	position: absolute;
	inset: 1rem;
	z-index: 2;
	display: flex;
	flex-direction: column;
	padding: 0.75rem;
	border-radius: 0.5rem;
	background: var(--casa-surface, #fff);
	box-shadow: 0 4px 16px rgb(0 0 0 / 25%);

	pre {
		flex: 1 1 auto;
		overflow: auto;
		white-space: pre-wrap;
		word-break: break-word;
		font-size: 0.75rem;
	}
}

.log-expanded-head {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 0.5rem;
	font-size: 0.75rem;
	color: var(--casa-text-hint);
}
</style>
