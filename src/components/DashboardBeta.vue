<template>
	<div class="dashboard-beta contextmenu-canvas">
		<!-- Beta bar: says which dashboard this is and how to leave it -->
		<div class="beta-bar is-flex is-align-items-center mb-4 ml-2">
			<b-tag rounded type="is-dark">{{ $t('Beta') }}</b-tag>
			<span class="beta-title has-text-grey-100">{{ $t('New dashboard (beta)') }}</span>
			<b-button class="beta-leave" rounded size="is-small" type="is-dark" @click="$emit('leave')">
				{{ $t('Back to the classic dashboard') }}
			</b-button>
		</div>

		<!-- The health strip and the side panels (what needs a person, storage, backups); the apps go in its main column -->
		<HealthStrip>
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
	computed: {
		searchbarShow() {
			return this.$store.state.searchEngineSwitch
		},
	},
}
</script>

<style lang="scss" scoped>
// the fixed tab bar of a phone must not cover the last cards
.dashboard-beta {
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
</style>
