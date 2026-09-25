<template>
	<div class="modal-card restore-from-destination">
		<header class="modal-card-head">
			<h3 class="title is-header">{{ $t('Restore from {name}', { name: destination }) }}</h3>
		</header>

		<section class="modal-card-body">
			<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">{{ error }}</b-message>

			<p class="_has-text-gray is-size-7 mb-3">
				{{ $t('What this destination holds. An app this box does not run is installed first, from the compose file its backup kept.') }}
			</p>

			<b-loading v-model="isLoading" :is-full-page="false" />

			<p v-if="!isLoading && !error && !held.length" class="_has-text-gray is-size-7">
				{{ $t('This destination holds no backup.') }}
			</p>

			<div v-for="entry in held" :key="entry.app" class="held mb-3">
				<div class="is-flex is-align-items-center mb-1">
					<span class="has-text-weight-medium is-flex-grow-1">{{ entry.app === 'casaos-system' ? $t('This box') : entry.app }}</span>
					<!-- said before the button: a restore of an app that is not here
						installs it, which is a bigger thing than putting files back -->
					<b-tag v-if="entry.installed" type="is-light">{{ $t('Installed here') }}</b-tag>
					<b-tag v-else type="is-warning">{{ $t('Not installed here') }}</b-tag>
				</div>
				<b-field>
					<b-select v-model="chosen[entry.app]" expanded size="is-small">
						<option v-for="stamp in entry.stamps" :key="stamp" :value="stamp">{{ when(stamp) }}</option>
					</b-select>
					<p class="control">
						<b-button :loading="restoring === entry.app" rounded size="is-small" type="is-danger"
							@click="confirmRestore(entry)">
							{{ $t('Restore') }}
						</b-button>
					</p>
					<p class="control">
						<b-button :aria-label="$t('Delete')" :loading="deleting === entry.app" :title="$t('Delete')"
							icon-left="trash-outline" icon-pack="casa" rounded size="is-small" @click="confirmDelete(entry)" />
					</p>
				</b-field>
			</div>
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button rounded @click="$emit('close')">{{ $t('Close') }}</b-button>
		</footer>
	</div>
</template>

<script>
export default {
	name: 'restore-from-destination-modal',
	props: {
		destination: { type: String, required: true },
	},
	emits: ['close'],
	data() {
		return { held: [], chosen: {}, isLoading: false, error: '', restoring: '', deleting: '' }
	},
	mounted() {
		this.load()
	},
	methods: {
		async load() {
			this.isLoading = true
			this.error = ''
			try {
				const res = await this.$api.backup.getDestinationRuns(this.destination)
				this.held = res.data.data || []
				// newest first is how the server lists them, so the first is the default
				for (const entry of this.held)
					this.chosen[entry.app] = entry.stamps[0]
			} catch (error) {
				const data = error.response && error.response.data
				this.error = this.$t('The backups on {name} could not be listed: {error}', { name: this.destination, error: (data && data.message) || error.message })
			} finally {
				this.isLoading = false
			}
		},

		// A stamp is RFC 3339 with the colons swapped for dashes so it can be a
		// folder name; put back, it is a date the browser can render locally.
		when(stamp) {
			const iso = stamp.replace(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z$/, '$1T$2:$3:$4Z')
			const date = new Date(iso)

			return Number.isNaN(date.getTime()) ? stamp : date.toLocaleString()
		},

		confirmRestore(entry) {
			const stamp = this.chosen[entry.app]
			this.$buefy.dialog.confirm({
				title: this.$t('Restore {app} from this backup?', { app: entry.app }),
				message: entry.installed
					? this.$t('The app will be stopped and its data replaced by the backup taken on {when}. Files added since then are removed. This cannot be undone.', { when: this.when(stamp) })
					: this.$t('{app} is not installed here. It will be installed from the compose file the backup kept, then its data put back from the backup taken on {when}.', { app: entry.app, when: this.when(stamp) }),
				confirmText: this.$t('Restore'),
				cancelText: this.$t('Cancel'),
				type: 'is-danger',
				hasIcon: true,
				onConfirm: () => this.restore(entry, stamp),
			})
		},

		// A backup gone is gone: nothing here can be walked back either.
		confirmDelete(entry) {
			const stamp = this.chosen[entry.app]
			this.$buefy.dialog.confirm({
				title: this.$t('Delete this backup of {app}?', { app: entry.app }),
				message: this.$t('The backup taken on {when} is removed from {name}. This cannot be undone.', { when: this.when(stamp), name: this.destination }),
				confirmText: this.$t('Delete'),
				cancelText: this.$t('Cancel'),
				type: 'is-danger',
				hasIcon: true,
				onConfirm: () => this.remove(entry, stamp),
			})
		},

		async remove(entry, stamp) {
			this.deleting = entry.app
			try {
				await this.$api.backup.deleteRun(this.destination, entry.app, stamp)
				await this.load()
			} catch (error) {
				const data = error.response && error.response.data
				this.$buefy.toast.open({ message: (data && data.message) || error.message, type: 'is-danger', duration: 6000 })
			} finally {
				this.deleting = ''
			}
		},

		async restore(entry, stamp) {
			this.restoring = entry.app
			try {
				await this.$api.backup.restore(this.destination, entry.app, stamp)
				this.$buefy.toast.open({
					message: this.$t('Restore started. Its outcome will appear in the History tab.'),
					type: 'is-success',
					duration: 5000,
				})
			} catch (error) {
				const data = error.response && error.response.data
				this.$buefy.toast.open({ message: (data && data.message) || error.message, type: 'is-danger', duration: 6000 })
			} finally {
				this.restoring = ''
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.restore-from-destination {
  .modal-card-body {
    min-height: 12rem;
  }
}
</style>
