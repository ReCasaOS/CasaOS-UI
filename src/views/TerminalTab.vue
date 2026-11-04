<template>
	<!-- the Terminal on a tab of its own, the whole window: #/terminal -->
	<div class="terminal-tab">
		<TerminalPanel @close="close" />
	</div>
</template>

<script>
import TerminalPanel from '@/components/logsAndTerminal/TerminalPanel.vue'

export default {
	name: 'TerminalTab',
	components: {
		TerminalPanel,
	},
	mounted() {
		this.previousTitle = document.title
		document.title = `${this.$t('Terminal')} · ${this.previousTitle}`
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
.terminal-tab {
	position: relative;
	z-index: 10;
	display: flex;
	height: 100%;

	:deep(.modal-card) {
		width: 100%;
		max-width: none;
		height: 100%;
		max-height: 100%;
		margin: 0;
		border-radius: 0;
	}

	// the terminal takes what the tab leaves it
	:deep(.xterm.sheight) {
		height: calc(100vh - 9rem);
	}
}
</style>
