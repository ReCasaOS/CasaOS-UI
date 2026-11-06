<template>
	<div class="modal-card">
		<!-- Modal-Card Body Start -->
		<section class="modal-card-body ">
			<div class="close-container">
				<button class="delete" type="button" @click="$emit('close')"></button>
			</div>
			<h3 class="title is-3">{{ serviceName || appName }}</h3>
			<div class="is-flex-grow-1">
				<b-tabs :animated="false" :model-value="activeTab" @update:model-value="onInput">
					<b-tab-item :label="$t('Terminal')" value="terminal">
						<terminal-card ref="terminal" :init-ws-url="wsUrl"></terminal-card>
					</b-tab-item>
					<b-tab-item :label="$t('Logs')" value="logs">
						<template v-if="streamed">
							<div class="is-flex">
								<b-button class="ml-auto" icon-left="download" size="is-small" @click="$refs.stream?.download()">
									{{ $t('Download') }}
								</b-button>
							</div>
							<!-- as tall as the polled log was -->
							<LogStream ref="stream" :apps="[appName]" :services="serviceName ? [serviceName] : null" embedded style="height: 35rem" />
						</template>
						<!-- an AppManagement older than the Logs feature: the log read every five seconds -->
						<template v-else-if="streamed === false">
							<div class="is-flex is-align-items-center">
								<b-select :model-value="lines" size="is-small" @update:model-value="onLinesChange">
									<option :value="100">{{ $t('Last 100 lines') }}</option>
									<option :value="1000">{{ $t('Last 1000 lines') }}</option>
									<option :value="-1">{{ $t('Whole log') }}</option>
								</b-select>
								<span v-if="isWholeLog" class="ml-3 is-size-7 has-text-grey">
									{{ $t('The whole log does not refresh on its own.') }}
								</span>
								<b-button :disabled="!logData" class="ml-auto" icon-left="download" size="is-small"
									@click="downloadLogs">
									{{ $t('Download') }}
								</b-button>
							</div>
							<logs-card ref="logs" :data="logData"></logs-card>
						</template>
					</b-tab-item>
				</b-tabs>
			</div>
		</section>
		<!-- Modal-Card Body End -->
		<b-loading v-model="isLoading" :is-full-page="false"></b-loading>
	</div>
</template>

<script>
import { defineAsyncComponent } from 'vue'
import FileSaver from 'file-saver'
import TerminalCard from '@/components/logsAndTerminal/TerminalCard.vue'
import LogsCard from '@/components/logsAndTerminal/LogsCard.vue'
import { hasLogs } from '@/components/Logs/entry'

// The backend reads -1 as "every line there is".
const WHOLE_LOG = -1

export default {
	name: 'app-terminal-panel',
	components: {
		TerminalCard,
		LogsCard,
		// loaded when shown: its HTTP client would pull the store into every importer of the app panel
		LogStream: defineAsyncComponent(() => import('@/components/Logs/LogStream.vue')),
	},
	data() {
		return {
			isLoading: false,
			activeTab: this.initialTab,
			wsUrl: `${this.$wsProtocol}//${this.$baseURL}/v1/container/${this.appid}/terminal?token=${this.$store.state.access_token}`,
			// null until AppManagement says whether it streams logs
			streamed: null,
			logData: '',
			timer: '',
			lines: 1000,
		}
	},
	props: {
		appid: String,
		appName: String,
		serviceName: String,
		initialTab: { type: String, default: 'terminal' },
	},
	computed: {
		isWholeLog() {
			return this.lines === WHOLE_LOG
		},
	},
	mounted() {
		// Opened straight on the logs of one service: the tab strip already shows the
		// right tab, but the two cards still have to be told which one is on screen.
		if (this.activeTab !== 'terminal')
			this.onInput(this.activeTab)
		hasLogs().then((streamed) => {
			this.streamed = streamed
			// closed before AppManagement answered: no polling left running behind it
			if (!streamed && !this.closed) {
				this.getLogs()
				this.startPolling()
				this.$nextTick(() => this.$refs.logs?.active(this.activeTab === 'logs'))
			}
		})
	},
	methods: {
		getLogs() {
			// Opened on one service, ask the endpoint for that service only: unnamed, it
			// answers for the whole stack, and every service would come back interleaved
			// under this one's title. The app's own console button names the service its
			// editor has open; when it has none the whole stack is what this panel shows,
			// which is what the title and the download filename already fall back to.
			this.$openAPI.appManagement.compose.composeAppLogs(this.appName, this.lines, this.serviceName || undefined).then((res) => {
				if (res.status == 200) {
					this.logData = res.data.data
				}
			}).catch((err) => {
				console.log('$openAPI.appManagement.compose.composeAppLogs', err)
			})
		},
		// Re-fetching the whole log every five seconds is a multi-megabyte round trip on
		// a chatty container, so that choice buys itself out of the polling.
		startPolling() {
			clearInterval(this.timer)
			if (!this.isWholeLog)
				this.timer = setInterval(() => this.getLogs(), 1000 * 5)
		},
		onLinesChange(value) {
			this.lines = Number(value)
			this.getLogs()
			this.startPolling()
		},
		downloadLogs() {
			const blob = new Blob([this.logData], { type: 'text/plain;charset=utf-8' })
			FileSaver.saveAs(blob, `${this.serviceName || this.appName}-logs.txt`)
		},
		onInput(e) {
			this.activeTab = e
			if (e == 'terminal') {
				this.$refs.terminal.active(true)
				this.$refs.logs?.active(false)
			} else {
				this.$refs.terminal.active(false)
				this.$refs.logs?.active(true)
			}
		},
	},
	unmounted() {
		this.closed = true
		clearInterval(this.timer)
	},
}
</script>
