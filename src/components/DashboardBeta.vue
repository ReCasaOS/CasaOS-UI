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

		<!-- Health strip: the widgets of the side bar, side by side -->
		<div class="columns is-variable is-2 health-strip">
			<div class="column"><Cpu /></div>
			<div class="column"><Disks /></div>
			<div class="column"><Network /></div>
		</div>

		<section>
			<transition name="fade">
				<SearchBar v-if="searchbarShow" />
			</transition>
		</section>
		<section>
			<CoreService />
		</section>
		<section>
			<AppSection system-first />
		</section>
	</div>
</template>

<script>
import SearchBar from '@/components/SearchBar.vue'
import CoreService from '@/components/CoreService.vue'
import AppSection from '@/components/Apps/AppSection.vue'
import Cpu from '@/widgets/Cpu.vue'
import Disks from '@/widgets/Disks.vue'
import Network from '@/widgets/Network.vue'

export default {
	name: 'DashboardBeta',
	components: {
		SearchBar,
		CoreService,
		AppSection,
		Cpu,
		Disks,
		Network,
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
.health-strip .column > :deep(.widget) {
	height: 100%;
}
</style>
