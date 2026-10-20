<template>
	<div class="modal-card stats-page">
		<header class="modal-card-head">
			<div class="is-flex is-align-items-center is-flex-grow-1">
				<h3 ref="title" class="title is-header mb-0 mr-2" tabindex="-1">{{ $t('Statistics') }}</h3>
			</div>
			<button :aria-label="$t('Close')" class="close-button ml-2" type="button" @click="$emit('close')">
				<b-icon icon="close-outline" pack="casa" />
			</button>
		</header>

		<section class="modal-card-body">
			<b-loading :active="loading" :is-full-page="false"></b-loading>

			<div class="stats-split">
				<div class="stats-side">
					<!-- wide windows: buttons grouped by kind -->
					<nav :aria-label="$t('Statistics items')" class="stats-list">
						<div v-for="group in groups" :key="group.id" class="stats-group">
							<h3 class="stats-group-title">{{ $t(group.label) }}</h3>
							<ul>
								<li v-for="item in group.items" :key="keyOf(item)">
									<button :aria-pressed="String(keyOf(item) === selectedKey)"
										:class="{ 'is-selected': keyOf(item) === selectedKey, 'is-stale': columns[item.source].state === 'error' }"
										class="stats-item"
										type="button"
										@click="select(keyOf(item))">
										<span :class="`state-${item.state}`" aria-hidden="true" class="stats-dot"></span>
										<span class="is-sr-only">{{ stateWord(item.state, item.kind) }}</span>
										<span v-if="columns[item.source].state === 'error'" class="is-sr-only">{{ $t('Out of date') }}</span>
										<span class="stats-item-name">{{ item.name }}</span>
										<span class="stats-item-cpu">{{ cpuText(item) }}</span>
										<span v-if="item.alerts > 0" class="stats-item-alerts">{{ item.alerts === 1 ? $t('{n} alert', { n: 1 }) : $t('{n} alerts', { n: item.alerts }) }}</span>
									</button>
								</li>
							</ul>
						</div>
					</nav>

					<!-- narrow windows: the same items in a native select -->
					<select :aria-label="$t('Statistics items')" :value="selectedKey" class="stats-select" @change="select($event.target.value)">
						<optgroup v-for="group in groups" :key="group.id" :label="$t(group.label)">
							<option v-for="item in group.items" :key="keyOf(item)" :value="keyOf(item)">{{ item.name }}</option>
						</optgroup>
					</select>

					<div v-for="failure in failures" :key="failure.source" class="stats-column-error" role="status">
						<p>{{ failure.text }}</p>
						<button class="button is-small is-rounded" type="button" @click="retry(failure.source)">{{ $t('Retry') }}</button>
					</div>
					<p v-for="note in listNoteTexts" :key="note.key" class="stats-note">{{ note.text }}</p>
				</div>

				<div class="stats-main">
					<p v-if="nothingToShow" class="stats-empty">{{ $t('No containers or virtual machines to show') }}</p>
					<template v-if="selected">
						<div class="stats-head">
							<div class="stats-title">
								<h4 class="stats-name">{{ selected.name }}</h4>
								<span class="stats-kind">{{ kindWord(selected.kind) }}</span>
								<span class="stats-state">{{ stateWord(selected.state, selected.kind) }}</span>
								<span v-if="sinceText" class="stats-since">{{ sinceText }}</span>
								<button class="button is-small is-rounded ml-auto" type="button" @click="openAlerts">{{ $t('Alert settings') }}</button>
							</div>
							<p v-if="detailText" :title="detailText" class="stats-detail">{{ detailText }}</p>
						</div>

						<section v-if="alertLines.length" :aria-label="$t('Active alerts')" class="stats-alerts" role="status">
							<p v-for="line in alertLines" :key="line.key">{{ line.text }}</p>
						</section>
						<div v-else-if="alertsState === 'error'" class="stats-alerts-error" role="status">
							<span>{{ $t('Alerts could not be read.') }}</span>
							<button class="button is-small is-rounded" type="button" @click="loadAlerts">{{ $t('Retry') }}</button>
						</div>

						<div class="stats-toolbar">
							<div :aria-label="$t('Period')" class="stats-ranges" role="group">
								<button v-for="r in ranges"
									:key="r.id"
									:aria-pressed="String(r.id === range)"
									:class="{ 'is-active': r.id === range }"
									type="button"
									@click="setRange(r.id)">
									{{ $t(r.label) }}
								</button>
							</div>
							<button v-if="range !== 'live'" class="button is-small is-rounded" type="button" @click="restartSeries">{{ $t('Refresh') }}</button>
							<button v-if="hasData" class="button is-small is-rounded" type="button" @click="zoomIn">{{ $t('Zoom in') }}</button>
							<button v-if="zoom" class="button is-small is-rounded" type="button" @click="zoom = null">{{ $t('Reset zoom') }}</button>
						</div>

						<div v-if="seriesState === 'error'" class="stats-series-error" role="status">
							<p>{{ $t('The measurements could not be read.') }}</p>
							<button class="button is-small is-rounded" type="button" @click="restartSeries">{{ $t('Retry') }}</button>
						</div>
						<template v-else-if="seriesState === 'notfound'">
							<p class="stats-series-error" role="status">{{ $t('This item is no longer there.') }}</p>
							<p class="stats-no-data">{{ $t('No data for this period') }}</p>
						</template>

						<template v-if="seriesData">
							<p v-for="(note, i) in seriesNoteTexts" :key="i" class="stats-series-note">{{ note }}</p>
							<dl class="stats-figures">
								<div v-for="figure in figureList" :key="figure.id" class="stats-figure">
									<dt>{{ figure.label }}</dt>
									<dd>{{ figure.text }}</dd>
								</div>
							</dl>
							<p v-if="!hasData" class="stats-no-data">{{ $t('No data for this period') }}</p>
							<div v-if="hasData" class="stats-charts">
								<stats-chart v-for="chart in charts"
									:key="chart.id"
									:chart="chart"
									:cursor="cursor"
									:locale="locale"
									:range="range"
									:scale="seriesData.scale || null"
									:zoom="zoom"
									@cursor="cursor = $event"
									@toggle="toggleSeries"
									@zoom="zoom = $event" />
							</div>
						</template>
						<b-loading :active="seriesState === 'loading' && !seriesData" :is-full-page="false"></b-loading>
					</template>
				</div>
			</div>
		</section>
		<alert-settings-dialog v-if="alertDialog"
			:item-gone="!flat.some(item => keyOf(item) === alertDialog.key)"
			:item-id="alertDialog.id"
			:item-name="alertDialog.name"
			:source="alertDialog.source"
			@close="closeAlerts"
			@saved="onAlertsSaved" />
	</div>
</template>

<script>
import { createPoller } from './poller'
import AlertSettingsDialog from './AlertSettingsDialog.vue'
import StatsChart from './StatsChart.vue'
import { buildCharts, figures, groupItems, listNotes, normalizeItems, noteText } from './statsData'
import { formatDateTime, formatValue, localeTag } from './statsFormat'
import { clean } from '@/components/settings/osPlan'
import { hasVirtualMachines } from '@/components/VirtualMachines/entry'
import { STATS_SOURCES, statsApi } from '@/service/stats'

const REFRESH_MS = 5000

// What each source is called when it fails
const COLUMN_NAMES = { app_management: 'Containers', virt_management: 'Virtual Machines', core: 'Machine' }

const STATE_WORDS = { running: 'Running', stopped: 'Stopped', paused: 'Paused', crashed: 'Crashed', unknown: 'Unknown' }

const KIND_WORDS = { 'app-container': 'Container', 'container': 'Container', 'vm': 'Virtual machine', 'host': 'Machine' }

const RANGES = [
	{ id: 'live', label: 'Live' },
	{ id: '15m', label: '15 min' },
	{ id: '1h', label: '1 h' },
	{ id: '24h', label: '24 h' },
	{ id: '7d', label: '7 days' },
]

const DETAIL_MAX = 200

// The narrowest window the zoom goes to
const MIN_WINDOW_MS = 10000

// Failed refreshes in a row before a column that has items says so
const FAILS_BEFORE_ERROR = 2

// At most one forced re-read of the list for an item the series says is gone
const GONE_RETRY_MS = 30000

const blank = () => ({ state: 'loading', items: [], notes: [], error: '', fails: 0 })

// Why a column could not be read: signin | down | failed
function failureCode(e) {
	const response = e?.response
	if (response?.status === 401) {
		return 'signin'
	}
	if (!response) {
		return typeof navigator !== 'undefined' && navigator.onLine === false ? 'failed' : 'down'
	}
	return [502, 503, 504].includes(response.status) ? 'down' : 'failed'
}

export default {
	name: 'StatsPage',
	components: { AlertSettingsDialog, StatsChart },
	props: {
		initialItem: { type: String, default: '' },
	},
	emits: ['close'],
	data() {
		return {
			columns: Object.fromEntries(STATS_SOURCES.map(source => [source, blank()])),
			selectedKey: '',
			// the newest ask of each column: an older answer never replaces a newer one
			listTicket: Object.fromEntries(STATS_SOURCES.map(source => [source, 0])),
			ranges: RANGES,
			range: 'live',
			seriesState: 'loading',
			seriesData: null,
			// the item the series belongs to
			seriesKey: '',
			seriesTicket: 0,
			zoom: null,
			cursor: null,
			// the lines the person hid, by key (the keys are unique across charts)
			hiddenKeys: [],
			// the active alerts of the selected item: idle | ok | error
			alertsState: 'idle',
			alertsActive: [],
			alertTicket: 0,
			// the item the open dialog is for, as it was when it opened: {key, id, source, name}
			alertDialog: null,
		}
	},
	computed: {
		locale() {
			return localeTag(this.$i18n.locale)
		},
		groups() {
			return groupItems(STATS_SOURCES.flatMap(source => this.columns[source].items))
		},
		flat() {
			return this.groups.flatMap(group => group.items)
		},
		selected() {
			return this.flat.find(item => this.keyOf(item) === this.selectedKey) || null
		},
		sinceText() {
			const item = this.selected
			if (!item || !['running', 'paused'].includes(item.state) || !item.started_at) {
				return ''
			}
			return this.$t('Running since {since}', { since: formatDateTime(item.started_at, this.locale) })
		},
		detailText() {
			return this.selected?.detail ? Array.from(this.selected.detail).slice(0, DETAIL_MAX).join('') : ''
		},
		settled() {
			return STATS_SOURCES.every(source => this.columns[source].state !== 'loading')
		},
		nothingToShow() {
			return this.settled && this.flat.length === 0 && this.failures.length === 0
		},
		figureList() {
			return figures(this.seriesData, this.selected, this.locale, this.$t)
		},
		// a string, so that a new object for the same item (every poll of the list) does not build the charts again
		selectedKind() {
			return this.selected?.kind || ''
		},
		charts() {
			return buildCharts(this.seriesData, { range: this.range, hidden: new Set(this.hiddenKeys), kind: this.selectedKind, locale: this.locale, t: (key, params) => this.$t(key, params) })
		},
		hasData() {
			return this.charts.some(chart => !chart.empty)
		},
		seriesNoteTexts() {
			const notes = Array.isArray(this.seriesData?.notes) ? this.seriesData.notes : []
			return notes.filter(code => typeof code === 'string').slice(0, 10).map(code => noteText(code, this.$t))
		},
		// what changes the alerts: the item, or the count the list gives for it
		alertSignature() {
			return this.selected ? `${this.selectedKey}|${this.selected.alerts}` : ''
		},
		alertLines() {
			return this.alertsActive.map((alert, i) => ({ key: i, text: this.alertText(alert) }))
		},
		loading() {
			return STATS_SOURCES.some(source => this.columns[source].state === 'loading') && this.flat.length === 0
		},
		failures() {
			return STATS_SOURCES
				.filter(source => this.columns[source].state === 'error')
				.map(source => ({ source, text: this.failureText(source, this.columns[source].error) }))
		},
		listNoteTexts() {
			return STATS_SOURCES.flatMap(source => this.columns[source].state === 'ok'
				? this.columns[source].notes.map((code, i) => ({ key: `${source}${i}`, text: noteText(code, this.$t) }))
				: [])
		},
	},
	watch: {
		selectedKey() {
			this.restartSeries()
		},
		alertSignature() {
			this.loadAlerts()
		},
	},
	mounted() {
		this.initialDone = false
		this.userPicked = false
		this.goneAt = {}
		this.seriesPoller = createPoller({ run: () => this.fetchSeries(), intervalMs: REFRESH_MS })
		this.listPoller = createPoller({ run: () => this.loadAll(), intervalMs: REFRESH_MS })
		document.addEventListener('visibilitychange', this.onVisibility)
		window.addEventListener('stats-open-item', this.onOpenItem)
		this.$refs.title.focus()
		this.listPoller.start()
	},
	beforeUnmount() {
		document.removeEventListener('visibilitychange', this.onVisibility)
		window.removeEventListener('stats-open-item', this.onOpenItem)
		this.listPoller.stop()
		this.seriesPoller.stop()
	},
	sockets: {
		'resource:alert-firing': function (res) {
			this.onResourceAlert(res)
		},
		'resource:alert-resolved': function (res) {
			this.onResourceAlert(res)
		},
	},
	methods: {
		// An alert fired or ended: the list is read again (the poller folds a burst into one more ask), and the alerts of the
		// open item too when the event is about it.
		onResourceAlert(res) {
			this.listPoller?.now()
			const item = res?.Properties?.item
			if (typeof item === 'string' && this.selected?.id === item) {
				this.loadAlerts()
			}
		},
		keyOf(item) {
			return `${item.source}|${item.id}`
		},
		stateWord(state, kind) {
			// 'Crashed' is the word for a virtual machine; a container that failed has exited with an error
			if (state === 'crashed' && kind !== 'vm') {
				return this.$t('Exited with an error')
			}
			return this.$t(STATE_WORDS[state] || 'Unknown')
		},
		cpuText(item) {
			return formatValue(item.cpu_percent, 'percent', this.locale)
		},
		failureText(source, code) {
			const name = this.$t(COLUMN_NAMES[source])
			if (code === 'signin') {
				return this.$t('Sign in again to read {name}.', { name })
			}
			return this.$t(code === 'down' ? '{name} did not answer.' : '{name} could not be read.', { name })
		},
		kindWord(kind) {
			return this.$t(KIND_WORDS[kind] || 'Container')
		},
		onVisibility() {
			this.listPoller.visibilityChanged()
			this.seriesPoller.visibilityChanged()
		},

		// The three sources at once; the virtual machines only where the module answers.
		async loadAll() {
			const virt = hasVirtualMachines().then(there => there ? this.loadColumn('virt_management') : this.markAbsent('virt_management'))
			await Promise.allSettled([this.loadColumn('app_management'), this.loadColumn('core'), virt])
			this.reconcile()
		},
		markAbsent(source) {
			this.listTicket[source]++
			Object.assign(this.columns[source], { state: 'absent', items: [], notes: [], error: '', fails: 0 })
		},
		async loadColumn(source) {
			const ticket = ++this.listTicket[source]
			const column = this.columns[source]
			try {
				const raw = await statsApi.list(source)
				if (!raw || !Array.isArray(raw.items)) {
					// an answer that is not a list is a column that failed, not one that did not answer
					throw Object.assign(new Error('not a list'), { response: {} })
				}
				if (ticket === this.listTicket[source]) {
					Object.assign(column, { state: 'ok', items: normalizeItems(raw, source), notes: listNotes(raw), error: '', fails: 0 })
					this.reconcile()
				}
			} catch (e) {
				if (ticket !== this.listTicket[source]) {
					return
				}
				if (e?.response?.status === 404) {
					Object.assign(column, { state: 'absent', items: [], notes: [], error: '', fails: 0 })
				} else if (column.items.length === 0 || ++column.fails >= FAILS_BEFORE_ERROR) {
					// a column with items keeps them (marked out of date) and says so from the second failure in a row
					Object.assign(column, { state: 'error', error: failureCode(e) }, column.items.length === 0 ? { items: [], notes: [] } : {})
				}
			}
		},
		async retry(source) {
			this.columns[source].state = 'loading'
			await this.loadColumn(source)
			this.reconcile()
		},

		// The selection: kept while its item exists, else the one asked for at the start, else the first.
		reconcile() {
			if (!this.initialDone) {
				// 'source|id' or the id alone; the choice waits for the column that has it, unless the person chose first
				const asked = this.initialItem ? this.flat.find(item => this.keyOf(item) === this.initialItem || item.id === this.initialItem) : null
				if (asked && !this.userPicked) {
					this.initialDone = true
					this.selectedKey = this.keyOf(asked)
					return
				}
				if (asked || !this.initialItem || this.settled) {
					this.initialDone = true
				}
			}
			if (this.selectedKey && this.flat.some(item => this.keyOf(item) === this.selectedKey)) {
				return
			}
			const pick = this.flat[0]
			this.selectedKey = pick ? this.keyOf(pick) : ''
		},
		// An alert notification asked for an item while this window is open: show it, if the list has it.
		onOpenItem(event) {
			const asked = typeof event?.detail === 'string' ? this.flat.find(item => this.keyOf(item) === event.detail || item.id === event.detail) : null
			if (asked) {
				this.select(this.keyOf(asked))
			}
		},
		select(key) {
			this.userPicked = true
			this.selectedKey = key
		},

		setRange(id) {
			if (id !== this.range) {
				this.range = id
				this.restartSeries()
			}
		},
		alertText(alert) {
			const since = formatDateTime(alert.since, this.locale)
			const value = Number.isFinite(alert.value) ? formatValue(alert.value, 'count', this.locale) : null
			const named = { cpu_high: ['Processor at {value} % since {since}', 'Processor high since {since}'], mem_high: ['Memory at {value} % since {since}', 'Memory high since {since}'] }[alert.key]
			if (named) {
				return value === null ? this.$t(named[1], { since }) : this.$t(named[0], { value, since })
			}
			return alert.key === 'vm_crashed' ? this.$t('The virtual machine crashed since {since}', { since }) : this.$t('Alert {key} since {since}', { key: alert.key, since })
		},
		// The active alerts of the selected item; an answer for another item (or an older one) is dropped.
		async loadAlerts() {
			const item = this.selected
			const ticket = ++this.alertTicket
			if (!item) {
				this.alertsActive = []
				this.alertsState = 'idle'
				return
			}
			const key = this.selectedKey
			if (this.alertsKey !== key) {
				this.alertsActive = []
			}
			try {
				const raw = await statsApi.alerts(item.source, item.id)
				if (!raw || !Array.isArray(raw.active)) {
					throw new Error('not alerts')
				}
				if (ticket === this.alertTicket) {
					this.setActive(raw.active, key)
				}
			} catch {
				if (ticket === this.alertTicket) {
					this.alertsKey = key
					this.alertsState = 'error'
				}
			}
		},
		setActive(list, key) {
			this.alertsKey = key
			this.alertsActive = list.slice(0, 20).filter(a => a && typeof a === 'object' && typeof a.key === 'string').map(a => ({
				key: clean(a.key, 60),
				since: a.since,
				value: typeof a.value === 'number' || (typeof a.value === 'string' && a.value.trim() !== '') ? Number(a.value) : Number.NaN,
			}))
			this.alertsState = 'ok'
		},
		openAlerts(event) {
			if (!this.selected) {
				return
			}
			const { id, source, name } = this.selected
			this.alertOpener = event.currentTarget
			this.alertDialog = { key: this.selectedKey, id, source, name }
		},
		// The focus goes back to the button that opened the dialog, or to the heading when that button is gone.
		closeAlerts() {
			const opener = this.alertOpener
			this.alertDialog = null
			this.alertOpener = null
			this.$nextTick(() => {
				opener?.focus?.({ preventScroll: true })
				if (!opener?.isConnected || document.activeElement !== opener) {
					this.$refs.title?.focus?.({ preventScroll: true })
				}
			})
		},
		// What the service answered to the save is the state of the banner.
		onAlertsSaved(response) {
			if (response && Array.isArray(response.active) && this.alertDialog?.key === this.selectedKey) {
				this.alertTicket++
				this.setActive(response.active, this.selectedKey)
			}
		},
		toggleSeries(key) {
			this.hiddenKeys = this.hiddenKeys.includes(key) ? this.hiddenKeys.filter(k => k !== key) : [...this.hiddenKeys, key]
		},
		// Halves the window around the cursor, or the middle of the window. Never refetches.
		zoomIn() {
			const from = this.zoom ? this.zoom.min : this.seriesData?.from * 1000
			const to = this.zoom ? this.zoom.max : this.seriesData?.to * 1000
			if (!Number.isFinite(from) || !Number.isFinite(to) || to - from < 2 * MIN_WINDOW_MS) {
				return
			}
			const half = (to - from) / 4
			const centre = this.cursor === null ? (from + to) / 2 : Math.min(Math.max(this.cursor * 1000, from + half), to - half)
			this.zoom = { min: centre - half, max: centre + half }
		},
		// A new item or period: the answers still on their way are no longer wanted, and the curves of another item are not kept.
		restartSeries() {
			this.seriesTicket++
			this.zoom = null
			this.cursor = null
			this.seriesPoller.stop()
			if (this.seriesKey !== this.selectedKey) {
				this.hiddenKeys = []
				this.seriesData = null
				this.seriesKey = ''
			}
			this.seriesState = 'loading'
			if (!this.selected) {
				return
			}
			if (this.range === 'live') {
				this.seriesPoller.start()
			} else {
				this.fetchSeries()
			}
		},
		async fetchSeries() {
			const item = this.selected
			if (!item) {
				return
			}
			const ticket = this.seriesTicket
			const key = this.selectedKey
			try {
				const raw = await statsApi.series(item.source, item.id, this.range)
				if (!raw || !Array.isArray(raw.series)) {
					throw Object.assign(new Error('not a series'), { response: {} })
				}
				if (ticket === this.seriesTicket) {
					this.seriesData = raw
					this.seriesKey = key
					this.seriesState = 'ok'
					// live data slides: a window it has slid past is of nothing now
					if (this.range === 'live' && this.zoom && Number.isFinite(raw.from) && this.zoom.min < raw.from * 1000) {
						this.zoom = null
					}
				}
			} catch (e) {
				if (ticket !== this.seriesTicket) {
					return
				}
				if (e?.response?.status === 404) {
					// the item went: the list is read again, and the selection falls back
					this.seriesData = null
					this.seriesKey = ''
					this.seriesState = 'notfound'
					// the list is read again, but not at every poll if it still holds the item
					const now = Date.now()
					if (!(now - (this.goneAt[key] ?? -Infinity) < GONE_RETRY_MS)) {
						this.goneAt[key] = now
						this.listPoller.now()
					}
				} else {
					this.seriesState = 'error'
				}
			}
		},
	},
}
</script>

<style lang="scss" scoped>
// The window is narrow below this width: one column, the select instead of the list
$stats-narrow: 44rem;

.stats-page {
	position: relative;
	// the layout answers to the width of the window (a modal 66rem wide, a tab, a phone), not to the screen
	container-type: inline-size;

	.modal-card-body {
		position: relative;
		min-height: 16rem;
	}

	// the close control is a button, for the keyboard: nothing of a button's own.
	// This rule outranks the global ones of .close-button, so it gives each state again.
	button.close-button {
		padding: 0;
		border: 0;
		color: inherit;
		background-color: transparent;

		&:hover {
			background-color: var(--casa-hover-tint);
		}

		&:active {
			background-color: var(--casa-active);
		}
	}

	.stats-split {
		display: grid;
		grid-template-columns: 16rem minmax(0, 1fr);
		gap: 1rem;
		align-items: start;

		@container (max-width: #{$stats-narrow}) {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.stats-side {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.stats-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.5rem;
		border-radius: 0.75rem;
		background: var(--casa-surface-sunken);
		border: 1px solid var(--casa-border);

		@container (max-width: #{$stats-narrow}) {
			display: none;
		}
	}

	.stats-select {
		display: none;
		width: 100%;
		padding: 0.5rem;
		border-radius: 0.5rem;

		@container (max-width: #{$stats-narrow}) {
			display: block;
		}
	}

	.stats-group-title {
		padding: 0 0.625rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--casa-text-hint);
	}

	.stats-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 0.625rem;
		border-radius: 0.5rem;
		border: 1px solid transparent;
		color: inherit;
		background: transparent;
		text-align: left;
		cursor: pointer;

		&:hover {
			background: var(--casa-hover-tile);
		}

		&.is-selected {
			border-color: var(--stats-accent);
			background: var(--casa-hover-tile);
		}
	}

	.stats-item.is-stale {
		opacity: 0.6;
	}

	.stats-item-name {
		flex-grow: 1;
		min-width: 0;
		overflow: hidden;
		color: var(--casa-text-strong);
		font-weight: 500;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.stats-item-cpu {
		flex-shrink: 0;
		font-size: 0.75rem;
		color: var(--casa-text-hint);
	}

	.stats-item-alerts {
		flex-shrink: 0;
		padding: 0 0.4rem;
		border-radius: 1rem;
		font-size: 0.7rem;
		color: var(--casa-text-warning);
		background: var(--casa-warning-tint);
	}

	// a shape per state, so that the colour is not the only sign
	.stats-dot {
		flex-shrink: 0;
		width: 0.5rem;
		height: 0.5rem;
		background: #8a8f98;

		&.state-running {
			border-radius: 50%;
			background: #3dd26b;
		}

		&.state-paused {
			border-radius: 50%;
			background: transparent;
			border: 2px solid #f5a623;
		}

		&.state-crashed {
			background: #e5484d;
			transform: rotate(45deg);
		}

		&.state-unknown {
			background: transparent;
			border: 1px dashed #8a8f98;
		}
	}

	.stats-main {
		position: relative;
		min-width: 0;
		min-height: 20rem;
	}

	.stats-title {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem;
	}

	.stats-name {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--casa-text-strong);
		overflow-wrap: anywhere;
	}

	.stats-kind,
	.stats-state,
	.stats-since,
	.stats-detail {
		font-size: 0.75rem;
		color: var(--casa-text-hint);
	}

	.stats-detail {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.stats-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin: 0.75rem 0;
	}

	.stats-ranges {
		display: inline-flex;
		border-radius: 1rem;
		border: 1px solid var(--casa-border);

		button {
			padding: 0.25rem 0.75rem;
			border-radius: 1rem;

			// a finger, not a pointer
			@media (max-width: 600px) {
				min-height: 2.25rem;
			}

			&:focus-visible {
				outline: 2px solid var(--stats-accent);
				outline-offset: -2px;
			}
			border: 0;
			font-size: 0.75rem;
			color: inherit;
			background: transparent;
			cursor: pointer;

			&.is-active {
				color: #fff;
				background: var(--stats-accent-fill);
			}
		}
	}

	.stats-series-error,
	.stats-empty,
	.stats-series-note,
	.stats-no-data {
		margin-bottom: 0.5rem;
		font-size: 0.8125rem;
		color: var(--casa-text-hint);
	}

	.stats-figures {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
		gap: 0.5rem;
		margin-bottom: 1rem;

		@container (max-width: #{$stats-narrow}) {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}

	.stats-figure {
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		border: 1px solid var(--casa-border);

		dt {
			font-size: 0.75rem;
			color: var(--casa-text-hint);
		}

		dd {
			font-size: 1.125rem;
			font-weight: 600;
			color: var(--casa-text-strong);
		}
	}

	.stats-alerts,
	.stats-alerts-error {
		margin: 0.5rem 0;
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.8125rem;
	}

	.stats-alerts {
		color: var(--casa-text-warning);
		background: var(--casa-warning-tint);
	}

	.stats-alerts-error {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--casa-text-hint);
	}

	.stats-charts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;

		@container (max-width: #{$stats-narrow}) {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.stats-column-error,
	.stats-note {
		padding: 0 0.625rem;
		font-size: 0.75rem;
		color: var(--casa-text-hint);
	}
}
</style>

<style lang="scss">
// The modal the page opens in: the same size as the one of the virtual machines.
.stats-modal {
	.animation-content {
		width: 66rem;
		max-width: calc(100vw - 2rem) !important;
	}

	.modal-card.stats-page {
		width: 100%;
		max-height: calc(100vh - 5rem);

		.modal-card-body {
			overflow-y: auto;
		}
	}
}

// Blue for text and for a filled pill, both readable (at least 4.5:1) against the surface or against white text.
.stats-page {
	--stats-accent: hsl(216, 90%, 40%);
	--stats-accent-fill: hsl(216, 90%, 40%);
}

html[data-theme='dark'] .stats-page {
	--stats-accent: hsl(216, 90%, 72%);
}
</style>
