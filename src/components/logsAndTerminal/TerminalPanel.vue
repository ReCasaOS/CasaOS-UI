<template>
	<div class="modal-card">
		<!-- Modal-Card Header Start -->
		<header class="modal-card-head">
			<div class="is-flex-grow-1">
				<h3 class="title is-header">CasaOS</h3>
			</div>
			<b-tooltip label="Download logs" position="is-bottom" size="is-small" type="is-black">
				<b-icon v-show="showTabName === 'logs'" class="close-button" icon="downloads-outline" pack="casa"
					@click="downloadSystemLog" />
			</b-tooltip>
			<NewTabButton page="terminal" />
			<b-icon class="close-button ml-2" icon="close-outline" pack="casa" @click="$emit('close');" />

		</header>
		<!-- Modal-Card Header End -->

		<!-- Modal-Card Body Start -->
		<section class="modal-card-body " style="overflow:hidden">
			<div class="is-flex-grow-1">
				<b-tabs :animated="false" @update:model-value="onInput">
					<b-tab-item :label="$t('Terminal')" value="terminal">
						<terminal-card ref="terminal" :init-ws-url="wsUrl"></terminal-card>
					</b-tab-item>
					<b-tab-item :label="$t('Logs')" value="logs">
						<logs-card ref="logs" :data="logData"></logs-card>
					</b-tab-item>
				</b-tabs>

			</div>

		</section>
		<!-- Modal-Card Body End -->

		<b-loading v-model="isLoading" :is-full-page="false"></b-loading>
	</div>
</template>

<script>
import qs from 'qs'
import TerminalCard from './TerminalCard.vue'
import LogsCard from './LogsCard.vue'
import NewTabButton from '@/components/basicComponents/NewTabButton.vue'

export default {
	name: 'terminal-panel',
	components: {
		NewTabButton,
		TerminalCard,
		LogsCard,
	},
	data() {
		return {
			isLoading: false,
			wsUrl: ``,
			logData: '',
			timer: '',
			showTabName: 'terminal',
		}
	},
	mounted() {
		this.getLogs()
		this.timer = setInterval(() => {
			this.getLogs()
		}, 1000 * 5)
	},
	unmounted() {
		clearInterval(this.timer)
	},
	methods: {
		getLogs() {
			this.$api.sys.getLogs().then((res) => {
				const data = res.data.data
				const replaceData = data.replace(/\n(.{8})/gu, '\n')
				this.logData = replaceData.substring(8, replaceData.length - 1)
			})
		},
		onInput(e) {
			if (e == 'terminal') {
				this.showTabName = 'terminal'
				this.$refs.terminal.active(true)
				this.$refs.logs.active(false)
				this.$messageBus('terminallogs_terminal')
			} else {
				this.showTabName = 'logs'
				this.$refs.terminal.active(false)
				this.$refs.logs.active(true)
				this.$messageBus('terminallogs_logs')
			}
		},
		downloadSystemLog() {
			const parameters = {
				token: this.$store.state.access_token,
			}
			window.open(`/v2/casaos/health/logs?${qs.stringify(parameters)}`, '_self')
		},
	},
}
</script>

<style lang="scss" scoped>
.cursor-pointer {
	cursor: pointer;
}
</style>
