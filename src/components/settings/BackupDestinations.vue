<template>
	<div class="modal-card backup-destinations">
		<header class="modal-card-head b-line">
			<h3 class="title is-5 has-text-black">{{ $t('Backups') }}</h3>
		</header>
		<section class="modal-card-body">
			<b-tabs v-model="tab" size="is-small" type="is-boxed">
				<b-tab-item :label="$t('Destinations')">
					<div class="is-flex is-align-items-center mb-2">
						<p class="has-text-full-03 is-size-7 is-flex-grow-1">
							{{ $t('Where backups are sent. Credentials are kept by rclone, alongside the cloud drives this box already mounts.') }}
						</p>
						<b-button :loading="isLoading" rounded size="is-small" @click="load">
							{{ $t('Refresh') }}
						</b-button>
					</div>

					<b-message v-if="error" class="mb-2" size="is-small" type="is-danger">
						{{ error }}
					</b-message>

					<p v-if="!isLoading && !destinations.length" class="has-text-full-03 is-size-7 mb-4">
						{{ $t('No destination yet. Add one below.') }}
					</p>

					<div v-for="name in destinations" :key="name" class="destination is-flex is-align-items-center mb-2">
						<span class="is-flex-grow-1 has-text-weight-medium">{{ name }}</span>

						<span v-if="checked[name]" class="has-text-full-03 is-size-7 mr-3">{{ checked[name] }}</span>

						<b-button :loading="busy === `check:${name}`" class="mr-1" rounded size="is-small"
							@click="check(name)">
							{{ $t('Check') }}
						</b-button>
						<b-button class="mr-1" rounded size="is-small" @click="browse(name)">
							{{ $t('Restore\u2026') }}
						</b-button>
						<b-button :loading="busy === `delete:${name}`" rounded size="is-small" type="is-danger"
							@click="confirmForget(name)">
							{{ $t('Forget') }}
						</b-button>
					</div>

					<hr>

					<b-field :label="$t('Name')" label-position="on-border">
						<b-input v-model="draft.name" placeholder="offsite" expanded size="is-small" />
					</b-field>

					<b-field :label="$t('Backend')" label-position="on-border">
						<b-select v-model="draft.backend" expanded size="is-small" @update:model-value="fillSuggestions">
							<option v-for="backend in backends" :key="backend.id" :value="backend.id">
								{{ backend.label }}
							</option>
						</b-select>
					</b-field>

					<p class="has-text-full-03 is-size-7 mb-2">
						{{ $t('These are rclone\'s own option names. Leave blank what you do not need; add a row for anything not listed.') }}
					</p>

					<div v-for="(row, index) in draft.rows" :key="index" class="is-flex mb-1">
						<b-input v-model="row.key" :placeholder="$t('Option')" class="mr-1" expanded size="is-small" />
						<b-input v-model="row.value" :placeholder="$t('Value')" :type="isSecret(row.key) ? 'password' : 'text'"
							expanded password-reveal size="is-small" />
						<b-button class="ml-1" icon-left="close-outline" icon-pack="casa" rounded size="is-small"
							@click="draft.rows.splice(index, 1)" />
					</div>

					<b-field class="mt-3">
						<b-checkbox v-model="draft.encrypt" size="is-small">{{ $t('Encrypt this destination') }}</b-checkbox>
					</b-field>
					<template v-if="draft.encrypt">
						<b-field :label="$t('Encryption password')" label-position="on-border">
							<b-input v-model="draft.password" expanded password-reveal size="is-small" type="password" />
						</b-field>
						<!-- said here rather than in a dialog later: the password is kept by
							rclone and never comes back, and a destination without it is a
							bucket of ciphertext -->
						<p class="has-text-full-03 is-size-7 mb-2">
							{{ $t('Names and contents are encrypted before they leave this box. Keep the password somewhere else: it cannot be read back, and without it every backup at this destination is lost.') }}
						</p>
					</template>

					<div class="is-flex is-align-items-center mt-2">
						<b-button class="mr-2" rounded size="is-small" @click="draft.rows.push({ key: '', value: '' })">
							{{ $t('Add') }}
						</b-button>
						<div class="is-flex-grow-1"></div>
						<b-button :disabled="!draft.name || !draft.backend || (draft.encrypt && !draft.password)" :loading="busy === 'save'"
							rounded size="is-small" type="is-primary" @click="save">
							{{ $t('Save destination') }}
						</b-button>
					</div>
				</b-tab-item>

				<b-tab-item :label="$t('Schedules')">
					<BackupSchedules v-if="tab === 1" />
				</b-tab-item>

				<b-tab-item :label="$t('History')">
					<BackupHistory v-if="tab === 2" />
				</b-tab-item>
			</b-tabs>
		</section>
		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button rounded @click="$emit('close')">{{ $t('Close') }}</b-button>
		</footer>
	</div>
</template>

<script>
import BackupHistory from './BackupHistory.vue'
import RestoreFromDestinationModal from './RestoreFromDestinationModal.vue'
import BackupSchedules from './BackupSchedules.vue'
import { BACKUP_BACKENDS, parametersFrom, suggestedFields } from './backupBackends'
import { renderSize } from '@/mixins/file_utils'

export default {
	name: 'backup-destinations',
	components: { BackupSchedules, BackupHistory },
	emits: ['close'],
	data() {
		return {
			tab: 0,
			destinations: [],
			// name -> what the last check said about it
			checked: {},
			isLoading: false,
			error: '',
			busy: '',
			backends: BACKUP_BACKENDS,
			draft: { name: '', backend: 's3', rows: suggestedFields('s3'), encrypt: false, password: '' },
		}
	},
	mounted() {
		this.load()
	},
	methods: {
		// For a box whose own run log is empty: what the destination holds, and a
		// way back from it.
		browse(name) {
			this.$buefy.modal.open({
				component: RestoreFromDestinationModal,
				hasModalCard: true,
				trapFocus: true,
				canCancel: ['escape'],
				scroll: 'keep',
				animation: 'zoom-in',
				customClass: 'backup-modal',
				props: { destination: name },
			})
		},

		// A value that looks like a credential is not shown while it is typed. The
		// field names are rclone's, and its secrets are consistently named.
		isSecret(key) {
			return /pass|secret|key|token/i.test(key || '') && !/key_file|public/i.test(key || '')
		},

		fillSuggestions(backend) {
			this.draft.rows = suggestedFields(backend)
		},

		async load() {
			this.isLoading = true
			this.error = ''
			try {
				const res = await this.$api.backup.getDestinations()
				this.destinations = res.data.data || []
			} catch (error) {
				this.error = this.messageOf(error)
			} finally {
				this.isLoading = false
			}
		},

		async save() {
			this.busy = 'save'
			this.error = ''
			try {
				await this.$api.backup.saveDestination(
					this.draft.name.trim(),
					this.draft.backend,
					parametersFrom(this.draft.rows),
					this.draft.encrypt,
					this.draft.password,
				)

				const saved = this.draft.name.trim()
				this.draft = { name: '', backend: this.draft.backend, rows: suggestedFields(this.draft.backend), encrypt: false, password: '' }
				await this.load()
				// Checked straight away: a destination that cannot be reached is worth
				// knowing about now rather than the first time a backup needs it.
				await this.check(saved)
			} catch (error) {
				this.error = this.messageOf(error)
			} finally {
				this.busy = ''
			}
		},

		async check(name) {
			this.busy = `check:${name}`
			try {
				const res = await this.$api.backup.checkDestination(name)
				this.checked = { ...this.checked, [name]: this.spaceText(res.data.data) }
			} catch (error) {
				this.checked = { ...this.checked, [name]: this.messageOf(error) }
			} finally {
				this.busy = ''
			}
		},

		// Forgetting a destination is not undoable from here, and the word "delete"
		// next to a backup reads as though it removes the backups.
		confirmForget(name) {
			this.$buefy.dialog.confirm({
				title: this.$t('Forget this destination?'),
				message: this.$t('{name} will be removed from this box, along with the credentials for it. Backups already sent there are not touched.', { name }),
				confirmText: this.$t('Forget'),
				cancelText: this.$t('Cancel'),
				type: 'is-danger',
				onConfirm: () => this.forget(name),
			})
		},

		async forget(name) {
			this.busy = `delete:${name}`
			try {
				await this.$api.backup.deleteDestination(name)
				await this.load()
			} catch (error) {
				this.error = this.messageOf(error)
			} finally {
				this.busy = ''
			}
		},

		// Most object stores have no answer to how much room is left, and inventing a
		// zero would read as a destination that is full. Reachable is the whole of
		// what a check can honestly say about those.
		spaceText(space) {
			if (space && space.free != null)
				return this.$t('Reachable, {free} free', { free: renderSize(space.free) })

			return this.$t('Reachable')
		},

		messageOf(error) {
			const data = error.response && error.response.data

			return (data && data.message) || error.message || String(error)
		},
	},
}
</script>

<style lang="scss">
// Not scoped, and for the same reason as the container panel: `account-modal`
// styles nothing, so this fell back to Buefy's ~640px. A schedule row holds two
// selects, a frequency, a weekday, a time, a retention and two switches, which at
// that width wrapped into something unreadable.
@media screen and (min-width: 769px) {
  .backup-modal {
    .animation-content {
      max-width: 94% !important;
    }

    .modal-card {
      width: min(94vw, 60rem) !important;
    }
  }
}
</style>

<style lang="scss" scoped>
.backup-destinations {
  .destination {
    min-height: 2rem;
  }
}
</style>
