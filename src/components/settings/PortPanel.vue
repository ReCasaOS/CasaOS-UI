<template>
	<div class="modal-card touch-targets">
		<!-- Modal-Card Header Start -->
		<header class="modal-card-head">
			<div class="is-flex-grow-1">
				<h3 class="title is-header">{{ $t('Edit Web UI port') }}</h3>
			</div>
			<b-icon class="close-button" icon="close-outline" pack="casa" @click="$emit('close');" />
		</header>
		<!-- Modal-Card Header End -->
		<!-- Modal-Card Body Start -->
		<section class="modal-card-body ">
			<b-field :message="errors" :type="errorType" class="has-text-light mb-0" expanded>
				<b-input ref="finput" v-model="port" type="number" @keyup.enter="savePort" @update:model-value="checkPort"></b-input>
			</b-field>
			<template v-if="httpsInit !== null">
				<b-field :label="$t('HTTPS port')" :message="httpsErrors || (httpsLockout ? $t('This page was opened over HTTPS and will stop answering on this port. The plain HTTP port stays, and you will be taken to it after saving.') : '')" :type="httpsErrors ? 'is-danger' : httpsLockout ? 'is-warning' : ''" class="has-text-light mt-4 mb-0" expanded>
					<b-input v-model="httpsPort" :disabled="httpsOff" type="number" @keyup.enter="savePort"></b-input>
				</b-field>
				<b-checkbox v-model="httpsOff" class="mt-2">{{ $t('Off') }}</b-checkbox>
			</template>
		</section>
		<!-- Modal-Card Body End -->
		<!-- Modal-Card Footer Start -->
		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button :label="$t('Cancel')" rounded @click="$emit('close')" />
			<b-button :label="$t('Save')" rounded type="is-primary" @click="savePort" />
		</footer>
		<!-- Modal-Card Footer End -->
		<b-loading v-model="isLoading" :is-full-page="false"></b-loading>
	</div>
</template>

<script>
export default {
	name: 'port-panel',
	data() {
		return {
			timer: 0,
			isLoading: false,
			confirmation: '',
			message: '',
			notificationShow: false,
			port: this.initPort,
			errorType: '',
			errors: '',
			// null until the gateway answers GET /gateway/httpsport; an older one answers 404 and the field stays hidden
			httpsInit: null,
			httpsPort: '443',
			httpsOff: false,
			httpsErrors: '',
		}
	},
	props: {
		initPort: {
			type: String,
			default: '0',
		},
	},

	computed: {
		// '0' = off, as the gateway reads it
		httpsWanted() {
			return this.httpsOff ? '0' : String(this.httpsPort)
		},
		httpsChanged() {
			return this.httpsInit !== null && this.httpsWanted !== this.httpsInit
		},
		// this page came over https and its listener is about to move or stop
		httpsLockout() {
			return this.httpsChanged && this.$protocol === 'https:'
		},
	},

	mounted() {
		this.$api.sys.getHttpsPort().then((res) => {
			if (res.data.success == 200) {
				this.httpsInit = res.data.data || '443'
				this.httpsOff = this.httpsInit === '0'
				this.httpsPort = this.httpsOff ? '443' : this.httpsInit
			}
		}).catch(() => {})
		this.$nextTick(() => {
			this.$refs.finput.getElement().select()
		})
	},

	methods: {
		checkPort() {
			if (this.port < 80 || this.port > 65535) {
				this.errorType = 'is-danger'
				this.errors = this.$t('Port range is 80-65535')
				return false
			}
			this.errorType = ''
			this.errors = ''
			return true
		},
		checkHttps() {
			if (this.httpsOff || (this.httpsPort >= 80 && this.httpsPort <= 65535)) {
				this.httpsErrors = ''
				return true
			}
			this.httpsErrors = this.$t('Port range is 80-65535')
			return false
		},
		async savePort() {
			this.isLoading = true
			if (!this.checkPort() || !this.checkHttps()) {
				this.isLoading = false
				return
			}
			const httpChanged = !this.httpsChanged || String(this.port) !== String(this.initPort)
			const steps = []
			if (httpChanged) {
				steps.push(['http', () => {
					this.$messageBus('dashboardsetting_webuiport', this.port.toString())
					// a number input gives a number, and the gateway reads the port as text
					return this.$api.sys.editServerPort({ port: String(this.port) })
				}])
			}
			if (this.httpsChanged) {
				steps.push(['https', () => this.$api.sys.editHttpsPort({ port: this.httpsWanted })])
			}
			// from an https page the https call ends the connection, so the plain port goes first
			if (this.httpsLockout) {
				steps.reverse()
			}
			this.errorType = this.errors = this.httpsErrors = ''
			for (const [field, run] of steps) {
				let message
				try {
					const res = await run()
					if (res.data.success == 200) {
						continue
					}
					message = res.data.message
				} catch (err) {
					message = err.response?.data?.message
				}
				this.isLoading = false
				message ||= this.$t('The setting could not be saved.')
				if (field === 'https') {
					this.httpsErrors = message
				} else {
					this.errorType = 'is-danger'
					this.errors = message
				}
				return
			}
			if (this.httpsLockout) {
				// the page is no longer served here, and fetching the plain port from an https page is blocked as mixed content
				// moving the plain port restarts its listener: give it a moment, as it cannot be probed from here
				this.timer = setTimeout(() => window.open(`http://${this.$baseIp}:${this.port}`, '_self'), httpChanged ? 3000 : 0)
			} else if (httpChanged) {
				this.checkUpdate()
			} else {
				this.$emit('close')
			}
		},
		checkUpdate() {
			this.timer = setInterval(() => {
				const checkUrl = `${this.$protocol}//${this.$baseIp}:${this.port}`
				this.$api.sys.checkUiPort(`${checkUrl}/v1/gateway/port`).then((res) => {
					if (res.data.success == 200) {
						clearInterval(this.timer)
						const url = `${this.$protocol}//${this.$baseIp}:${res.data.data}`
						window.open(url, '_self')
					}
				})
			}, 1000)
		},
	},
	unmounted() {
		clearInterval(this.timer)
	},
}
</script>
