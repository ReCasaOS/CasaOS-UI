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
					{{ card ? card.title : module.title }}
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
				<ul v-if="card.rows.length" class="module-card-rows">
					<li v-for="(row, index) in card.rows" :key="`row${index}`" class="is-flex is-align-items-center">
						<span class="module-card-label is-flex-grow-1">{{ row.label }}</span>
						<span v-if="row.value" :class="row.level ? `has-text-${levelColor[row.level]}` : ''" class="module-card-value">{{ row.value }}</span>
						<b-button v-if="row.action" :disabled="busy" class="ml-2" size="is-small" type="is-primary"
							@click="run(row.action)">
							{{ row.action.label }}
						</b-button>
					</li>
				</ul>
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

// The variant `panel` is drawn by the home that holds it, in its own markup and styles (the default slot gets the state, the card and `run`).
export default {
	name: 'ModuleCard',
	props: {
		// an entry of cardList
		module: { type: Object, required: true },
		variant: { type: String, default: 'widget' },
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
				const view = cardView((await getCard(this.module.route)).data, this.module.route)
				if (serial !== this.serial)
					return
				// a description that is refused is a module that does not speak the card: not available
				this.card = view
				this.state = view ? 'ok' : 'unavailable'
				if (view) {
					refresh = view.refresh
					this.$emit('loaded', { name: this.module.name, icon: view.icon })
				}
			} catch (error) {
				if (serial !== this.serial)
					return
				if (GONE.includes(error?.status)) {
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
