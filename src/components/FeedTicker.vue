<template>
	<!-- The footer's headlines (CasaOS#180): one at a time, the next every few seconds, paused while
		pointed at or focused. Nothing at all while off, with no headline, or when the core cannot say. -->
	<div v-if="current" class="feed-ticker" data-feed-ticker @focusin="paused = true" @focusout="paused = false"
		@mouseenter="paused = true" @mouseleave="paused = false">
		<transition mode="out-in" name="feed-fade">
			<a :key="index" :href="current.link" :title="`${current.source}: ${current.title}`" class="feed-item"
				rel="noopener noreferrer" target="_blank">
				<span class="feed-source">{{ current.source }}</span>
				<span class="feed-title">{{ current.title }}</span>
			</a>
		</transition>
	</div>
</template>

<script>
export const ROTATE_MS = 8000
// the core refreshes every 30 minutes; asking more often only reads its cache
export const RELOAD_MS = 10 * 60 * 1000
// the first read after turning it on finds nothing yet: the core is fetching
export const RETRY_MS = 15 * 1000

export default {
	name: 'feed-ticker',
	data() {
		return { items: [], index: 0, paused: false, rotateTimer: null, loadTimer: null }
	},
	computed: {
		current() {
			return this.items.length ? this.items[this.index % this.items.length] : null
		},
	},
	mounted() {
		this.load()
		this.$EventBus?.$on('casaUI:feedsChanged', this.reload)
		this.rotateTimer = setInterval(() => {
			if (!this.paused && this.items.length > 1)
				this.index = (this.index + 1) % this.items.length
		}, ROTATE_MS)
	},
	beforeUnmount() {
		this.$EventBus?.$off('casaUI:feedsChanged', this.reload)
		clearInterval(this.rotateTimer)
		clearTimeout(this.loadTimer)
	},
	methods: {
		// after a save: once now, and once more when the box has had time to read a feed just added
		reload() {
			clearTimeout(this.loadTimer)
			this.load(RETRY_MS)
		},
		async load(soon = RELOAD_MS) {
			let next = soon
			try {
				const { enabled, feeds, items } = (await this.$api.sys.getFeeds()).data.data
				this.items = enabled ? (items || []) : []
				if (enabled && feeds?.length && !this.items.length)
					next = RETRY_MS
			} catch {
				// an older core (404), or no answer: the footer stays as it was
				this.items = []
			}
			if (this.index >= this.items.length)
				this.index = 0
			this.loadTimer = setTimeout(() => this.load(), next)
		},
	},
}
</script>

<style lang="scss" scoped>
.feed-ticker {
	position: fixed;
	bottom: 0;
	// between the brand on the left and the contact icons on the right
	left: 30rem;
	right: 12rem;
	display: flex;
	justify-content: center;
	margin-bottom: 7px;
	min-width: 0;
	font-size: 0.875rem;
	line-height: 1.25rem;
}

.feed-item {
	display: flex;
	gap: 0.5rem;
	min-width: 0;
	max-width: 100%;
	color: var(--casa-on-glass-dim);

	&:hover,
	&:focus-visible {
		color: inherit;

		.feed-title {
			text-decoration: underline;
		}
	}
}

.feed-source {
	flex-shrink: 0;
	max-width: 12rem;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	opacity: 0.7;
}

.feed-title {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.feed-fade-enter-active,
.feed-fade-leave-active {
	transition: opacity 0.4s;
}

.feed-fade-enter-from,
.feed-fade-leave-to {
	opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
	.feed-fade-enter-active,
	.feed-fade-leave-active {
		transition: none;
	}
}

// no room between the two bars
@media screen and (max-width: 1100px) {
	.feed-ticker {
		display: none;
	}
}
</style>
