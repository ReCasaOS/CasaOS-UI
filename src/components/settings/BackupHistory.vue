<template>
	<div>
		<div class="is-flex is-align-items-center mb-2">
			<p class="_has-text-gray is-size-7 is-flex-grow-1">
				{{ $t('The last few hundred runs, newest first. Failures are kept too — a record that only showed successes would hide a box backing nothing up.') }}
			</p>
			<b-button :loading="isLoading" rounded size="is-small" @click="load">{{ $t('Refresh') }}</b-button>
		</div>

		<b-message v-if="error" class="mb-0" size="is-small" type="is-danger">{{ error }}</b-message>

		<b-table v-else :data="runs" :loading="isLoading" :mobile-cards="false" class="is-size-7">
			<b-table-column v-slot="{ row }" :label="$t('App')" field="app">
				{{ row.app === 'casaos-system' ? $t('This box') : row.app }}
			</b-table-column>

			<b-table-column v-slot="{ row }" :label="$t('Destination')" field="destination">
				{{ row.destination }}
			</b-table-column>

			<b-table-column v-slot="{ row }" :label="$t('When')" field="started_at">
				{{ new Date(row.started_at).toLocaleString() }}
			</b-table-column>

			<b-table-column v-slot="{ row }" :label="$t('Result')" field="error">
				<b-tag v-if="row.restore" class="mr-1" type="is-info">{{ $t('Restore') }}</b-tag>
				<b-tag v-if="!row.error" type="is-success">{{ $t('Done') }}</b-tag>
				<b-tooltip v-else :label="row.error" multilined position="is-left" type="is-dark">
					<b-tag type="is-danger">{{ $t('Failed') }}</b-tag>
				</b-tooltip>
			</b-table-column>

			<b-table-column v-slot="{ row }" :label="$t('Copied')" field="copied" numeric>
				{{ row.copied }}
			</b-table-column>

			<b-table-column v-slot="{ row }" :label="$t('Stopped')" field="containers_stopped">
				<!-- a copy taken from a running app may not restore, which is worth
					knowing about a backup before trying to restore it -->
				<span v-if="row.containers_stopped">{{ $t('Yes') }}</span>
				<span v-else class="has-text-warning-on-scheme">{{ $t('No') }}</span>
			</b-table-column>

			<b-table-column v-slot="{ row }" label="" field="stamp">
				<!-- only a backup that finished can be put back: a restore is not a
					thing to restore from, and a failed run left nothing to restore -->
				<b-button v-if="!row.error && !row.restore" :loading="restoring === row.stamp" rounded
					size="is-small" @click="confirmRestore(row)">
					{{ $t('Restore') }}
				</b-button>
			</b-table-column>

			<template #empty>
				<p class="has-text-centered _has-text-gray is-size-7 py-4">
					{{ $t('No backup has run yet.') }}
				</p>
			</template>
		</b-table>
	</div>
</template>

<script>
export default {
	name: 'backup-history',
	data() {
		return { runs: [], isLoading: false, error: '', restoring: '' }
	},
	mounted() {
		this.load()
	},
	methods: {
		// Said in full before anything is touched: the app goes down for the copy,
		// what it has now is replaced, and files added since the backup go with
		// it. Nothing here can be walked back.
		confirmRestore(row) {
			this.$buefy.dialog.confirm({
				title: this.$t('Restore {app} from this backup?', { app: row.app }),
				message: this.$t('The app will be stopped and its data replaced by the backup taken on {when}. Files added since then are removed. This cannot be undone.', {
					when: new Date(row.started_at).toLocaleString(),
				}),
				confirmText: this.$t('Restore'),
				cancelText: this.$t('Cancel'),
				type: 'is-danger',
				hasIcon: true,
				onConfirm: () => this.restore(row),
			})
		},

		async restore(row) {
			this.restoring = row.stamp
			try {
				await this.$api.backup.restore(row.destination, row.app, row.stamp)
				this.$buefy.toast.open({
					message: this.$t('Restore started. Its outcome will appear in this list.'),
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

		async load() {
			this.isLoading = true
			this.error = ''
			try {
				const res = await this.$api.backup.getRuns()
				this.runs = res.data.data || []
			} catch (error) {
				const data = error.response && error.response.data
				this.error = this.$t('History could not be loaded: {error}', { error: (data && data.message) || error.message })
			} finally {
				this.isLoading = false
			}
		},
	},
}
</script>
