<template>
	<div class="modal-card backup-app">
		<header class="modal-card-head">
			<h3 class="title is-header">{{ $t('Backup of {name}', { name: appName }) }}</h3>
		</header>

		<section class="modal-card-body">
			<b-message v-if="error" class="mb-2" size="is-small" type="is-danger">
				{{ error }}
			</b-message>

			<p v-if="!isLoading && !error && !destinations.length" class="_has-text-gray is-size-7">
				{{ $t('No destination is configured. Add one under Settings, then come back.') }}
			</p>

			<template v-else-if="hasForm">
				<b-field :label="$t('Destination')" label-position="on-border">
					<b-select v-model="destination" :loading="isLoading" expanded size="is-small">
						<option v-for="name in destinations" :key="name" :value="name">{{ name }}</option>
					</b-select>
				</b-field>

				<b-switch v-model="holdStill" class="mt-2" size="is-small">
					{{ $t('Stop the app while it is copied') }}
				</b-switch>

				<p class="_has-text-gray is-size-7 mt-2">
					{{ holdStill
						? $t('The app will be unavailable until the copy finishes, and comes back on its own afterwards.')
						: $t('The app keeps running. Anything writing while it is copied — a database above all — may not restore.') }}
				</p>

				<b-field :label="$t('Backups to keep here')" class="mt-4" label-position="on-border">
					<b-input v-model="keep" :placeholder="$t('every one')" min="1" size="is-small" type="number"></b-input>
				</b-field>
				<p class="_has-text-gray is-size-7">
					{{ $t('Once this one has landed, older backups of this app at this destination beyond this number are deleted. Empty keeps everything.') }}
				</p>
			</template>
		</section>

		<!-- with no destination to send to there is nothing to cancel: one Close -->
		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button rounded @click="$emit('close')">{{ hasForm ? $t('Cancel') : $t('Close') }}</b-button>
			<b-button v-if="hasForm" :disabled="!destination" :loading="busy" rounded type="is-primary" @click="start">
				{{ $t('Back up') }}
			</b-button>
		</footer>
	</div>
</template>

<script>
export default {
	name: 'backup-app-modal',
	props: {
		appId: { type: String, required: true },
		appName: { type: String, default: '' },
	},
	emits: ['close'],
	data() {
		return {
			destinations: [],
			destination: '',
			// Copying a database while it is writing produces a backup that looks
			// fine and does not restore, so this starts on.
			holdStill: true,
			// Empty keeps everything; the manual backups used to pile up for ever,
			// with only the scheduled ones under a retention.
			keep: '',
			// true from the start: the first render is already waiting for the list,
			// and must not flash "no destination" first
			isLoading: true,
			busy: false,
			error: '',
		}
	},
	computed: {
		// the form is shown while the list loads and once there is somewhere to
		// send the copy; a load that failed says so and offers nothing to fill in
		hasForm() {
			return this.isLoading || this.destinations.length > 0
		},
	},
	mounted() {
		this.load()
	},
	methods: {
		async load() {
			this.isLoading = true
			try {
				const res = await this.$api.backup.getDestinations()
				this.destinations = res.data.data || []
				this.destination = this.destinations[0] || ''
			} catch (error) {
				this.error = this.$t('Destinations could not be loaded: {error}', { error: this.messageOf(error) })
			} finally {
				this.isLoading = false
			}
		},

		async start() {
			this.busy = true
			try {
				const res = await this.$api.backup.backupApp(this.appId, this.destination, this.holdStill, Number(this.keep) || 0)
				this.$buefy.toast.open({ message: res.data.message, type: 'is-success', duration: 5000 })
				this.$emit('close')
			} catch (error) {
				this.error = this.messageOf(error)
			} finally {
				this.busy = false
			}
		},

		messageOf(error) {
			const data = error.response && error.response.data

			return (data && data.message) || error.message || String(error)
		},
	},
}
</script>
