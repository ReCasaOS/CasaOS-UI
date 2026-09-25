<template>
	<div class="modal-card system-package-update-modal">
		<header class="modal-card-head">
			<div class="is-flex-grow-1">
				<h3 class="title is-header">{{ $t('System packages') }}</h3>
			</div>
			<b-icon class="close-button" icon="close-outline" pack="casa" @click="$emit('close')" />
		</header>

		<section class="modal-card-body">
			<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">
				{{ error.message }}
				<span v-if="error.detail" class="is-block is-size-7 mt-1">{{ error.detail }}</span>
			</b-message>

			<div v-if="isChecking" class="package-loading is-flex is-align-items-center is-justify-content-center _has-text-gray">
				<b-icon class="mr-2" custom-class="mdi-spin" custom-size="is-size-5" icon="loading" size="is-20" />
				<span>{{ $t('Checking for system package updates...') }}</span>
			</div>

			<div v-if="!isChecking && info.supported === false" class="package-empty">
				<p>{{ $t('System package updates are not supported on this host.') }}</p>
				<p v-if="info.reason" class="is-size-7 _has-text-gray mt-1">{{ info.reason }}</p>
			</div>

			<template v-if="!isChecking && info.supported !== false">
				<b-message v-if="status.reboot_required" class="mb-3" size="is-small" type="is-warning">
					{{ $t('A reboot is required to finish applying these updates. Use the existing Restart action when convenient.') }}
				</b-message>

				<div v-if="info.count === 0 && !isRunning && status.state === 'idle' && !error" class="package-empty">
					{{ $t('No system package updates are available.') }}
				</div>

				<div v-else-if="info.count > 0" class="package-summary">
					<p class="mb-3">
						<strong>{{ info.count }}</strong> {{ $t('updates available') }}
					</p>
					<div class="package-list">
						<table class="table is-fullwidth is-hoverable">
							<thead>
								<tr>
									<th>{{ $t('Name') }}</th>
									<th>{{ $t('Current version') }}</th>
									<th>{{ $t('New version') }}</th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="item in info.updates" :key="item.name">
									<td>{{ item.name }}</td>
									<td>{{ item.current_version || '—' }}</td>
									<td>{{ item.candidate_version }}</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>

				<div v-if="isRunning" class="mt-4">
					<p class="has-text-info-on-scheme">
						{{ $t(isReconciliationPending ? 'Finishing system package update...' : 'Applying system package updates...') }}
					</p>
				</div>
				<div v-else-if="status.state === 'succeeded'" class="mt-4 has-text-success-on-scheme">
					{{ $t('System package update completed.') }}
				</div>
				<div v-else-if="status.state === 'failed'" class="mt-4 has-text-danger-on-scheme">
					{{ $t('System package update failed.') }}
				</div>
				<p v-if="status.error && !isReconciliationPending" class="mt-1 is-size-7 _has-text-gray">
					{{ status.error }}
				</p>

				<div v-if="status.log" class="package-log mt-4">
					<pre>{{ status.log }}</pre>
				</div>
			</template>
		</section>

		<!-- empty while apt runs or on a host without it: × and Escape still close -->
		<footer v-if="!isRunning && info.supported !== false" class="modal-card-foot is-justify-content-flex-end">
			<b-button :loading="isChecking" rounded @click="checkPackages">
				{{ $t('Check for updates') }}
			</b-button>
			<b-button v-if="hasUpdates && status.state !== 'succeeded'" rounded type="is-primary" @click="confirmUpdate">
				{{ $t('Update packages') }}
			</b-button>
		</footer>
	</div>
</template>

<script>
function emptyInfo() {
	return {
		supported: null,
		manager: '',
		reason: '',
		updates: [],
		count: 0,
	}
}

function emptyStatus() {
	return {
		supported: null,
		manager: '',
		state: 'idle',
		log: '',
		error: '',
		reboot_required: false,
	}
}

export default {
	name: 'SystemPackageUpdateModal',
	data() {
		return {
			info: emptyInfo(),
			status: emptyStatus(),
			isChecking: false,
			isStarting: false,
			error: null,
			pollTimer: null,
		}
	},
	computed: {
		isRunning() {
			return this.isStarting || this.status.state === 'running' || this.isReconciliationPending
		},
		isReconciliationPending() {
			return this.status.state === 'finalizing' || (
				this.status.state === 'failed'
				&& this.status.error === 'The package update stopped before it reported a result.'
				&& !this.status.exit_code
				&& !this.status.completed_at
			)
		},
		hasUpdates() {
			return Array.isArray(this.info.updates) && this.info.updates.length > 0
		},
	},
	mounted() {
		this.loadInitialState()
	},
	beforeUnmount() {
		this.stopPolling()
	},
	methods: {
		async loadInitialState() {
			try {
				const response = await this.$api.sys.getSystemPackageUpdateStatus()
				const status = response.data.data
				if (status) {
					this.status = status
					if (this.isRunning) {
						this.startPolling()
						return
					}
				}
			} catch {
				// The package check below provides the useful error message.
			}
			this.checkPackages(true)
		},
		async checkPackages(preserveStatus = false) {
			this.stopPolling()
			this.isChecking = true
			this.error = null
			if (preserveStatus !== true) {
				this.status = emptyStatus()
			}
			try {
				const response = await this.$api.sys.getSystemPackages()
				this.info = response.data.data || emptyInfo()
			} catch (error) {
				this.info = emptyInfo()
				this.fail('Could not check for system package updates.', error)
			} finally {
				this.isChecking = false
			}
		},
		confirmUpdate() {
			this.$buefy.dialog.confirm({
				title: this.$t('Update system packages'),
				message: `${this.$t('Are you sure you want to update all available system packages?')}<br><br>${this.$t('The package list may change before the update starts.')}`,
				type: 'is-warning',
				hasIcon: true,
				confirmText: this.$t('Update packages'),
				cancelText: this.$t('Cancel'),
				onConfirm: () => this.startUpdate(),
			})
		},
		async startUpdate() {
			this.isStarting = true
			this.error = null
			try {
				const response = await this.$api.sys.startSystemPackageUpdate()
				this.status = response.data.data || emptyStatus()
				this.startPolling()
			} catch (error) {
				if (error?.response?.data?.data) {
					this.status = error.response.data.data
					if (this.status.state === 'running' || this.isReconciliationPending) {
						this.startPolling()
					}
				}
				this.fail('Could not start the system package update.', error)
			} finally {
				this.isStarting = false
			}
		},
		startPolling() {
			this.stopPolling()
			this.fetchStatus()
			this.pollTimer = setInterval(() => this.fetchStatus(), 1000)
		},
		stopPolling() {
			if (this.pollTimer) {
				clearInterval(this.pollTimer)
				this.pollTimer = null
			}
		},
		async fetchStatus() {
			try {
				const response = await this.$api.sys.getSystemPackageUpdateStatus()
				this.status = response.data.data || emptyStatus()
				if (!this.isRunning) {
					this.stopPolling()
				}
			} catch (error) {
				this.fail('Could not load the system package update status.', error)
				this.stopPolling()
			}
		},
		// A translated sentence first; the core's own words, when it sent some, as the detail.
		// axios's "Request failed with status code 500" is never shown.
		fail(message, error) {
			const detail = error?.response?.data?.message || error?.response?.data?.data
			this.error = { message: this.$t(message), detail: typeof detail === 'string' ? detail : '' }
		},
	},
}
</script>

<style lang="scss" scoped>
.package-loading {
	min-height: 8rem;
}

.package-empty {
	padding: 2rem 1rem;
	text-align: center;
}

.package-list {
	max-height: 18rem;
	overflow-y: auto;
	font-size: 0.75rem;

	table {
		margin-bottom: 0;
	}

	th,
	td {
		padding: 0.35rem 0.5rem;
		line-height: 1.35;
	}
}

.package-log {
	max-height: 14rem;
	overflow: auto;

	pre {
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
		font-size: 0.75rem;
	}
}
</style>
