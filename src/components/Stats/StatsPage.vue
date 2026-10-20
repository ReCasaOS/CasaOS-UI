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
										:class="{ 'is-selected': keyOf(item) === selectedKey }"
										class="stats-item"
										type="button"
										@click="select(keyOf(item))">
										<span :class="`state-${item.state}`" aria-hidden="true" class="stats-dot"></span>
										<span class="is-sr-only">{{ stateWord(item.state) }}</span>
										<span class="stats-item-name">{{ item.name }}</span>
										<span class="stats-item-cpu">{{ cpuText(item) }}</span>
										<span v-if="item.alerts > 0" class="stats-item-alerts">{{ $t('{n} alerts', { n: item.alerts }) }}</span>
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

				<div class="stats-main"></div>
			</div>
		</section>
	</div>
</template>

<script>
import { createPoller } from './poller'
import { groupItems, listNotes, normalizeItems, noteText } from './statsData'
import { formatValue, localeTag } from './statsFormat'
import { hasVirtualMachines } from '@/components/VirtualMachines/entry'
import { STATS_SOURCES, statsApi } from '@/service/stats'

const REFRESH_MS = 5000

// What each source is called when it fails
const COLUMN_NAMES = { app_management: 'Containers', virt_management: 'Virtual Machines', core: 'Machine' }

const STATE_WORDS = { running: 'Running', stopped: 'Stopped', paused: 'Paused', crashed: 'Crashed', unknown: 'Unknown' }

const blank = () => ({ state: 'loading', items: [], notes: [], error: '' })

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
	mounted() {
		this.initialUsed = false
		this.listPoller = createPoller({ run: () => this.loadAll(), intervalMs: REFRESH_MS })
		document.addEventListener('visibilitychange', this.onVisibility)
		this.$refs.title.focus()
		this.listPoller.start()
	},
	beforeUnmount() {
		document.removeEventListener('visibilitychange', this.onVisibility)
		this.listPoller.stop()
	},
	methods: {
		keyOf(item) {
			return `${item.source}|${item.id}`
		},
		stateWord(state) {
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
		onVisibility() {
			this.listPoller.visibilityChanged()
		},

		// The three sources at once; the virtual machines only where the module answers.
		async loadAll() {
			const virt = hasVirtualMachines().then(there => there ? this.loadColumn('virt_management') : this.markAbsent('virt_management'))
			await Promise.allSettled([this.loadColumn('app_management'), this.loadColumn('core'), virt])
			this.reconcile()
		},
		markAbsent(source) {
			this.listTicket[source]++
			Object.assign(this.columns[source], { state: 'absent', items: [], notes: [], error: '' })
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
					Object.assign(column, { state: 'ok', items: normalizeItems(raw, source), notes: listNotes(raw), error: '' })
				}
			} catch (e) {
				if (ticket !== this.listTicket[source]) {
					return
				}
				if (e?.response?.status === 404) {
					Object.assign(column, { state: 'absent', items: [], notes: [], error: '' })
				} else if (column.state !== 'ok') {
					// a refresh that fails keeps what the column already shows
					Object.assign(column, { state: 'error', items: [], notes: [], error: failureCode(e) })
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
			const first = !this.initialUsed
			this.initialUsed = true
			if (this.selectedKey && this.flat.some(item => this.keyOf(item) === this.selectedKey)) {
				return
			}
			const asked = first && this.initialItem ? this.flat.find(item => item.id === this.initialItem) : null
			const pick = asked || this.flat[0]
			this.selectedKey = pick ? this.keyOf(pick) : ''
		},
		select(key) {
			this.selectedKey = key
		},
	},
}
</script>

<style lang="scss" scoped>
.stats-page {
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

		@include touch {
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

		@include touch {
			display: none;
		}
	}

	.stats-select {
		display: none;
		width: 100%;
		padding: 0.5rem;
		border-radius: 0.5rem;

		@include touch {
			display: block;
		}
	}

	.stats-group-title {
		padding: 0 0.625rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--casa-text-dim);
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
			border-color: var(--casa-primary, #3b82f6);
			background: var(--casa-hover-tile);
		}
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
		color: var(--casa-text-dim);
	}

	.stats-item-alerts {
		flex-shrink: 0;
		padding: 0 0.4rem;
		border-radius: 1rem;
		font-size: 0.7rem;
		color: #b86e00;
		background: rgba(245, 166, 35, 0.15);
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

	.stats-column-error,
	.stats-note {
		padding: 0 0.625rem;
		font-size: 0.75rem;
		color: var(--casa-text-dim);
	}
}
</style>
