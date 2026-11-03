<template>
	<div class="dashboard-beta contextmenu-canvas">
		<!-- Beta bar: says which dashboard this is and how to leave it -->
		<div class="is-flex is-align-items-center mb-4 ml-2">
			<b-tag rounded type="is-dark">{{ $t('Beta') }}</b-tag>
			<span class="ml-2 is-flex-grow-1 has-text-grey-100">{{ $t('New dashboard (beta)') }}</span>
			<b-button rounded size="is-small" type="is-dark" @click="$emit('leave')">
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
	</div>
</template>

<script>
import SearchBar from '@/components/SearchBar.vue'
import CoreService from '@/components/CoreService.vue'
import AppSection from '@/components/Apps/AppSection.vue'
import HealthStrip from '@/components/dashboard/HealthStrip.vue'

export default {
	name: 'DashboardBeta',
	components: {
		SearchBar,
		CoreService,
		AppSection,
		HealthStrip,
	},
	emits: ['leave'],
	computed: {
		searchbarShow() {
			return this.$store.state.searchEngineSwitch
		},
	},
}
</script>
