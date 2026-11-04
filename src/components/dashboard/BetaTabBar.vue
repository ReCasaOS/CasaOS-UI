<template>
	<nav :aria-label="$t('Main navigation')" class="beta-tabbar">
		<button v-for="tab in tabs" :key="tab.key" :aria-current="current === tab.key ? 'page' : undefined"
			:class="{ 'is-current': current === tab.key }" type="button" @click="go(tab)">
			<svg aria-hidden="true" fill="none" height="22" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="22">
				<path v-for="d in tab.icon" :key="d" :d="d"></path>
			</svg>
			<span>{{ tab.label }}</span>
		</button>
	</nav>
</template>

<script>
// The phone's navigation of the beta dashboard (the bottom bar of the proposal). Shown below the
// desktop breakpoint only: a desktop has the top bar and the side panels in reach.
export default {
	name: 'BetaTabBar',
	inject: ['homeShowFiles'],
	data() {
		return { current: 'home' }
	},
	computed: {
		tabs() {
			return [
				{ key: 'home', label: this.$t('Home'), icon: ['M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'], go: () => this.scrollTo('.dashboard-beta') },
				{ key: 'apps', label: this.$t('My apps'), icon: ['M4.5 3h4A1.5 1.5 0 0 1 10 4.5v4A1.5 1.5 0 0 1 8.5 10h-4A1.5 1.5 0 0 1 3 8.5v-4A1.5 1.5 0 0 1 4.5 3z', 'M15.5 3h4A1.5 1.5 0 0 1 21 4.5v4a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 14 8.5v-4A1.5 1.5 0 0 1 15.5 3z', 'M4.5 14h4A1.5 1.5 0 0 1 10 15.5v4A1.5 1.5 0 0 1 8.5 21h-4A1.5 1.5 0 0 1 3 19.5v-4A1.5 1.5 0 0 1 4.5 14z', 'M15.5 14h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-4a1.5 1.5 0 0 1 1.5-1.5z'], go: () => this.scrollTo('.beta-main') },
				{ key: 'files', label: this.$t('Files'), icon: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'], go: () => this.homeShowFiles() },
				{ key: 'settings', label: this.$t('Settings'), icon: ['M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', 'M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1'], go: this.openSettings },
			]
		},
	},
	methods: {
		go(tab) {
			// Files and Settings open over the page: the tab it was on stays the current one
			if (tab.key === 'home' || tab.key === 'apps') {
				this.current = tab.key
			}
			tab.go()
		},

		// the event TopBar listens for to open its settings menu
		openSettings() {
			// eslint-disable-next-line vue/custom-event-name-casing
			this.$EventBus.$emit('casaUI:openSettings')
		},

		scrollTo(selector) {
			document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
		},
	},
}
</script>

<style lang="scss" scoped>
.beta-tabbar {
	position: fixed;
	right: 0;
	bottom: 0;
	left: 0;
	// under the modals and the open menus
	z-index: 20;
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	padding: 0.375rem 0.5rem calc(0.625rem + env(safe-area-inset-bottom));
	border-top: 1px solid rgba(255, 255, 255, 0.08);
	background: rgba(11, 18, 32, 0.7);
	backdrop-filter: blur(18px);

	@include desktop {
		display: none;
	}

	button {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		min-height: 3rem;
		border: 0;
		background: none;
		color: #a3b1c6;
		font: inherit;
		font-size: 0.6875rem;
		font-weight: 500;
		cursor: pointer;

		&.is-current {
			color: #3b82f6;
			font-weight: 600;
		}

		&:focus-visible {
			outline: 2px solid #fff;
			outline-offset: -2px;
		}
	}
}
</style>
