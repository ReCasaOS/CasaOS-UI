<template>
	<div class="dashboard-beta contextmenu-canvas">
		<!-- Beta bar: says which dashboard this is and how to leave it -->
		<div class="beta-bar is-flex is-align-items-center mb-4 ml-2">
			<b-tag rounded type="is-dark">{{ $t('Beta') }}</b-tag>
			<span class="beta-title has-text-grey-100">{{ $t('New dashboard (beta)') }}</span>
			<button :aria-label="bellLabel" class="beta-bell" type="button" @click="$refs.strip.showAttention()">
				<b-icon icon="bell-outline" size="is-20" />
				<span v-if="attentionCount > 0" class="beta-bell-count">{{ attentionCount }}</span>
			</button>
			<b-button class="beta-leave" rounded size="is-small" type="is-dark" @click="$emit('leave')">
				{{ $t('Back to the classic dashboard') }}
			</b-button>
		</div>

		<!-- The health strip and the side panels (what needs a person, storage, backups); the apps go in its main column -->
		<HealthStrip ref="strip" @attention="attentionCount = $event">
			<section>
				<transition name="fade">
					<SearchBar v-if="searchbarShow" />
				</transition>
			</section>
			<section>
				<CoreService />
			</section>
			<section>
				<AppSection compact system-first />
			</section>
		</HealthStrip>

		<BetaTabBar />
	</div>
</template>

<script>
import SearchBar from '@/components/SearchBar.vue'
import CoreService from '@/components/CoreService.vue'
import AppSection from '@/components/Apps/AppSection.vue'
import HealthStrip from '@/components/dashboard/HealthStrip.vue'
import BetaTabBar from '@/components/dashboard/BetaTabBar.vue'

export default {
	name: 'DashboardBeta',
	components: {
		SearchBar,
		CoreService,
		AppSection,
		HealthStrip,
		BetaTabBar,
	},
	emits: ['leave'],
	data() {
		return { attentionCount: 0 }
	},
	computed: {
		bellLabel() {
			return this.attentionCount > 0 ? this.$t('Needs attention ({count})', { count: this.attentionCount }) : this.$t('Needs attention')
		},
		searchbarShow() {
			return this.$store.state.searchEngineSwitch
		},
	},
}
</script>

<style lang="scss" scoped>
// the fixed tab bar of a phone must not cover the last cards
// a stacking context below the top bar (20), like .main-content of the classic one in Home.vue:
// the cards' badges (z-index 20 and 30) must stay under the top bar's open menus (#107)
.dashboard-beta {
	position: relative;
	z-index: 10;
	padding-bottom: 4.5rem;

	@include desktop {
		padding-bottom: 0;
	}
}

// a narrow screen puts the button under the title instead of squeezing the title into four lines
.beta-bar {
	flex-wrap: wrap;
	gap: 0.5rem;
}

.beta-title {
	flex: 1 1 8rem;
}

.beta-leave {
	flex-shrink: 0;
}

// the bell of the proposal: the number of things that need a person, on the accent
.beta-bell {
	position: relative;
	flex-shrink: 0;
	width: 2.25rem;
	height: 2.25rem;
	border: 0;
	border-radius: 0.75rem;
	background: transparent;
	color: #f1f5f9;
	cursor: pointer;

	&:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	&:focus-visible {
		outline: 2px solid #fff;
	}
}

.beta-bell-count {
	position: absolute;
	top: 0;
	right: 0;
	min-width: 1.125rem;
	height: 1.125rem;
	padding: 0 0.25rem;
	border-radius: 0.5625rem;
	background: #3b82f6;
	color: #fff;
	font-size: 0.6875rem;
	font-weight: 600;
	line-height: 1.125rem;
}
</style>
