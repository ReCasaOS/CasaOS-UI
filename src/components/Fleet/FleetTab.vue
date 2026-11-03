<template>
	<!-- the Fleet on a tab of its own, the whole window -->
	<div class="fleet-tab">
		<FleetPage @close="close" />
	</div>
</template>

<script>
import FleetPage from './FleetPage.vue'

export default {
	name: 'FleetTab',
	components: {
		FleetPage,
	},
	mounted() {
		this.previousTitle = document.title
		document.title = `${this.$t('Fleet')} · ${this.previousTitle}`
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
.fleet-tab {
	position: relative;
	z-index: 10;
	display: flex;
	height: 100%;

	:deep(.modal-card.fleet-page) {
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
