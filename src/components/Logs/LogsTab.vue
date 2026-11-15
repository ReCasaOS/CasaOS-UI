<template>
	<!-- Logs on a tab of its own, the whole window -->
	<div class="logs-tab">
		<LogsPage :key="access" :initial-app="query.app" :initial-at="query.at" :initial-box="query.box" @close="close" />
	</div>
</template>

<script>
import LogsPage from './LogsPage.vue'
import { parseQuery } from './logsModel'
import { accessOf, confirmRole } from '@/store/confirmRole'

export default {
	name: 'LogsTab',
	components: {
		LogsPage,
	},
	computed: {
		access() {
			return accessOf(this.$store.getters)
		},
		query() {
			return parseQuery(this.$route)
		},
	},
	created() {
		confirmRole(this.$api, this.$store)
	},
	mounted() {
		this.previousTitle = document.title
		document.title = `${this.$t('Logs')} · ${this.previousTitle}`
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
.logs-tab {
	position: relative;
	z-index: 10;
	display: flex;
	height: 100%;

	:deep(.modal-card.logs-page) {
		width: 100%;
		height: 100%;
		max-height: 100%;
		margin: 0;
		border-radius: 0;

		.modal-card-body {
			flex: 1 1 auto;
			height: auto;
			min-height: 0;
		}
	}
}
</style>
