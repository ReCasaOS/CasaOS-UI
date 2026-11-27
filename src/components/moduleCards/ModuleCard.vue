<template>
	<slot v-if="variant === 'panel' && state !== 'gone' && state !== 'loading'" :busy="busy" :card="card" :module="module" :run="run"
		:state="state" :texts="texts" />
	<div v-else-if="variant !== 'panel' && state !== 'gone' && state !== 'loading'"
		class="module-card widget has-text-white is-relative">
		<div class="blur-background"></div>
		<div class="widget-content">
			<!-- Header Start -->
			<div class="widget-header is-flex">
				<div class="widget-title is-flex-grow-1">
					{{ (card && card.title) || module.title }}
					<div v-if="module.foreign && module.owner" class="module-card-owner is-size-7">
						{{ $t(texts.owner, { owner: module.owner }) }}
					</div>
				</div>
				<div class="widget-icon-button is-flex-shrink-0">
					<b-icon :icon="card ? card.icon : fallback" pack="casa" size="is-20"></b-icon>
				</div>
			</div>
			<!-- Header End -->
			<p v-if="state === 'unavailable'" class="module-card-unavailable is-size-7" role="status">
				{{ $t(texts.unavailable) }}
			</p>
			<template v-else>
				<span v-if="card.status" :class="`is-${card.status.level}`" class="tag module-card-status">{{ card.status.text }}</span>
				<ul v-if="card.rows.length" :class="{ 'is-figures': card.layout === 'figures' }" class="module-card-rows">
					<li v-for="(row, index) in card.rows" :key="`row${index}`" :class="{ 'has-bar': typeof row.bar === 'number' }"
						class="is-flex is-align-items-center">
						<span class="module-card-label is-flex-grow-1">{{ row.label }}</span>
						<span v-if="row.value" :class="row.level ? `has-text-${levelColor[row.level]}` : ''" class="module-card-value">{{ row.value }}</span>
						<b-button v-if="row.action" :disabled="busy" class="ml-2" size="is-small" type="is-primary"
							@click="run(row.action)">
							{{ row.action.label }}
						</b-button>
						<span v-if="typeof row.bar === 'number'" :aria-label="row.label" :aria-valuenow="row.bar" :class="`is-${row.level || 'none'}`"
							aria-valuemax="100" aria-valuemin="0" class="module-card-bar" role="progressbar">
							<span :style="{ width: `${row.bar}%` }"></span>
						</span>
					</li>
				</ul>
				<p v-if="card.more > 0" class="module-card-more is-size-7">+{{ card.more }}</p>
				<div v-if="card.actions.length" class="module-card-actions is-flex mt-2">
					<b-button v-for="(action, index) in card.actions" :key="`action${index}`" :disabled="busy" class="mr-2"
						size="is-small" type="is-primary" @click="run(action)">
						{{ action.label }}
					</b-button>
				</div>
				<a v-if="card.link" :href="card.link.url" class="module-card-link is-block mt-2 is-size-7" rel="noopener noreferrer"
					target="_blank">{{ card.link.label }}</a>
			</template>
		</div>
	</div>
</template>

<script>
import escape from 'lodash/escape'
import { CARD_ICON_FALLBACK, CARD_TEXT, actionNote, cardView } from './moduleCards'
import { GONE, actUrl, getCard } from '@/service/moduleCards'

const UNAVAILABLE_REFRESH = 60
// the figures of an API widget: no more than this are drawn
const MAX_FIGURES = 4

// What a source gives, as it is drawn: nothing to send, and four figures at most.
function sourceView(view) {
	if (!view)
		return null
	const rows = view.layout === 'figures' ? view.rows.slice(0, MAX_FIGURES) : view.rows
	return { ...view, rows: rows.map(row => ({ ...row, action: null })), actions: [] }
}

// The variant `panel` is drawn by the home that holds it, in its own markup and styles (the default slot gets the state, the card and `run`).
export default {
	name: 'ModuleCard',
	props: {
		// an entry of cardList
		module: { type: Object, required: true },
		variant: { type: String, default: 'widget' },
		// What reads the card instead of the module's route: { load() }, a promise of the view to draw (cardView's, with `layout`, `more` and
		// a `bar` on a row), or of null when there is none for now. A `load` that rejects with the status 404 is a card that is gone. The
		// card of a source (an API widget) has no button, whatever the view holds. `module` is then { name, title }.
		source: { type: Object, default: null },
	},
	emits: ['loaded', 'gone'],
	data() {
		return {
			// the description of cardView, once read
			card: null,
			// loading | ok | unavailable | gone
			state: 'loading',
			sending: false,
			confirming: false,
			texts: CARD_TEXT,
			fallback: CARD_ICON_FALLBACK,
			levelColor: { ok: 'success', info: 'info', warning: 'warning', danger: 'danger' },
			timer: 0,
			stale: false,
			serial: 0,
			// false once the card has left the screen: it asks nothing and sends nothing after that
			alive: true,
			dialog: null,
		}
	},
	computed: {
		busy() {
			return this.sending || this.confirming
		},
		identity() {
			return `${this.module.name} ${this.module.route}`
		},
	},
	watch: {
		// the same instance can be handed to another module: what it drew and what it could send are the old one's
		identity() {
			clearTimeout(this.timer)
			this.dialog?.close?.()
			this.card = null
			this.state = 'loading'
			this.stale = false
			this.load()
		},
		// a new source is read at once; what is drawn stays until its answer
		source() {
			this.load()
		},
	},
	mounted() {
		document.addEventListener('visibilitychange', this.onVisible)
		this.load()
	},
	beforeUnmount() {
		document.removeEventListener('visibilitychange', this.onVisible)
		clearTimeout(this.timer)
		this.alive = false
		this.dialog?.close?.()
		// an answer that comes after this is nobody's
		this.serial++
	},
	methods: {
		async load() {
			clearTimeout(this.timer)
			if (!this.alive)
				return
			const serial = ++this.serial
			let refresh = UNAVAILABLE_REFRESH
			try {
				const view = this.source ? sourceView(await this.source.load()) : cardView((await getCard(this.module.route)).data, this.module.route)
				if (serial !== this.serial)
					return
				// a description that is refused is a module that does not speak the card: not available
				this.card = view
				this.state = view ? 'ok' : 'unavailable'
				if (view) {
					// a view with no rhythm of its own must not be read again at once, and for ever
					if (view.refresh > 0)
						refresh = view.refresh
					this.$emit('loaded', { name: this.module.name, icon: view.icon })
				}
			} catch (error) {
				if (serial !== this.serial)
					return
				if (this.source ? error?.status === 404 : GONE.includes(error?.status)) {
					this.card = null
					this.state = 'gone'
					this.$emit('gone', this.module.name)
					return
				}
				// only the word: what the card said before is not shown as if it still held
				this.card = null
				this.state = 'unavailable'
			}
			this.schedule(refresh)
		},
		schedule(seconds) {
			clearTimeout(this.timer)
			if (!this.alive)
				return
			this.timer = setTimeout(() => {
				// a hidden tab asks nothing: it reads again when it is seen
				if (document.hidden)
					this.stale = true
				else
					this.load()
			}, seconds * 1000)
		},
		onVisible() {
			if (!document.hidden && this.stale) {
				this.stale = false
				this.load()
			}
		},
		// nothing is sent before the answer to the confirmation, and not twice while one is open or in flight
		run(action) {
			if (this.busy)
				return
			if (!action.confirm)
				return this.send(action)
			this.confirming = true
			this.dialog = this.$buefy.dialog.confirm({
				title: this.$t(this.texts.confirm),
				// the dialog renders its message as HTML
				message: escape(action.confirm),
				confirmText: this.$t(this.texts.confirm),
				cancelText: this.$t(this.texts.cancel),
				onConfirm: () => {
					this.confirming = false
					if (this.alive)
						this.send(action)
				},
				onCancel: () => {
					this.confirming = false
				},
			})
		},
		async send(action) {
			if (this.sending || !this.alive)
				return
			this.sending = true
			let message = ''
			let type = 'is-success'
			try {
				message = actionNote((await actUrl(this.module.route, action.url, action.body)).data)
			} catch (error) {
				type = 'is-danger'
				message = actionNote(error?.data) || this.$t(this.texts.failed)
			}
			this.sending = false
			if (message) {
				// the toast renders its message as HTML
				this.$buefy.toast.open({ message: escape(message), type })
			}
			this.load()
		},
	},
}
</script>

<style lang="scss">
.module-card {
	.module-card-status {
		margin-bottom: 0.5rem;
	}

	.module-card-rows li {
		margin: 0.25rem 0;

		// the bar goes under the label and the value
		&.has-bar {
			flex-wrap: wrap;
		}
	}

	// a share of 100, in the colour of the row's level; the widget is glass in both themes
	.module-card-bar {
		display: block;
		flex: 0 0 100%;
		align-self: stretch;
		height: 0.25rem;
		margin-top: 0.25rem;
		border-radius: 0.125rem;
		background: rgba(255, 255, 255, 0.16);
		overflow: hidden;

		span {
			display: block;
			height: 100%;
			border-radius: inherit;
			background: rgba(255, 255, 255, 0.7);
		}

		&.is-ok span {
			background: #4ade80;
		}

		&.is-info span {
			background: #93c5fd;
		}

		&.is-warning span {
			background: #fbbf24;
		}

		&.is-danger span {
			background: #f87171;
		}
	}

	// the figures: the value, large, over its label, two to a line whatever the width
	.module-card-rows.is-figures {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		// a figure keeps its own height beside a taller one
		align-items: start;
		gap: 0.5rem;

		li {
			flex-direction: column;
			// in a column the bar is a line of its own already
			flex-wrap: nowrap;
			min-width: 0;
			margin: 0;
		}

		.module-card-bar {
			flex: 0 0 auto;
		}

		.module-card-value {
			order: -1;
			max-width: 100%;
			font-size: 1.5rem;
			font-weight: 600;
			line-height: 1.2;
			overflow-wrap: anywhere;
			text-align: center;
		}

		.module-card-label {
			max-width: 100%;
			font-size: 0.75rem;
			opacity: 0.7;
			overflow-wrap: anywhere;
			text-align: center;
		}
	}

	.module-card-more {
		opacity: 0.7;
	}

	.module-card-owner,
	.module-card-link {
		opacity: 0.7;
	}

	.module-card-link {
		color: inherit;
		text-decoration: underline;
	}
}
</style>
