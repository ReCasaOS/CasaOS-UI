<template>
	<!-- Statistics on a tab of its own, the whole window -->
	<div class="stats-tab">
		<StatsPage :key="access" :initial-item="initialItem" @close="close" />
	</div>
</template>

<script>
import StatsPage from './StatsPage.vue'
import { accessOf, confirmRole } from '@/store/confirmRole'

export default {
	name: 'StatsTab',
	components: {
		StatsPage,
	},
	computed: {
		access() {
			return accessOf(this.$store.getters)
		},
		// only a string: a repeated parameter arrives as an array
		initialItem() {
			const item = this.$route.query.item
			return typeof item === 'string' ? item : ''
		},
	},
	created() {
		confirmRole(this.$api, this.$store)
	},
	mounted() {
		this.previousTitle = document.title
		document.title = `${this.$t('Statistics')} · ${this.previousTitle}`
	},
	beforeUnmount() {
		document.title = this.previousTitle
	},
	methods: {
		// A tab the dashboard opened can close itself; one opened by hand
		// cannot, and goes to the dashboard instead.
		close() {
			window.close()
			if (!window.closed) {
				this.$router.push('/')
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.stats-tab {
	position: relative;
	z-index: 10;
	display: flex;
	height: 100%;

	:deep(.modal-card.stats-page) {
		width: 100%;
		height: 100%;
		max-height: 100%;
		margin: 0;
		border-radius: 0;

		.modal-card-body {
			overflow-y: auto;
		}
	}
}
</style>
