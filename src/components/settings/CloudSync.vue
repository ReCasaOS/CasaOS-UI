<template>
	<div class="modal-card cloud-sync touch-targets">
		<header class="modal-card-head">
			<h3 class="title is-header">{{ $t('Folder sync') }}</h3>
		</header>
		<section class="modal-card-body">
			<div class="is-flex is-align-items-center mb-2">
				<p class="settings-intro is-flex-grow-1 mr-2">
					{{ $t('Folders kept in step with a cloud drive, on a schedule.') }}
				</p>
				<b-button :loading="isLoading" rounded size="is-small" @click="load()">
					{{ $t('Refresh') }}
				</b-button>
			</div>

			<b-message v-if="error" class="mb-2" size="is-small" type="is-danger">
				{{ error }}
			</b-message>

			<p v-if="!isLoading && !error && !tasks.length" class="_has-text-gray is-size-7 mb-4">
				{{ $t('No sync task yet') }}
			</p>

			<section v-for="task in tasks" :key="task.id" class="task settings-card">
				<span class="_tile"><b-icon icon="cloud-upload-outline" /></span>
				<div class="_text">
					<p class="_name">{{ task.name }}</p>
					<p class="_has-text-gray is-size-7">{{ routeOf(task) }}</p>
					<p class="_has-text-gray is-size-7">{{ ruleOf(task, $t, locale) }}</p>
					<p class="_has-text-gray is-size-7">{{ lastOf(task, $t) }}</p>
					<div v-if="noticeOf(task, $t)" class="is-flex is-align-items-center is-flex-wrap-wrap is-gap-1 mt-1">
						<span class="is-size-7">{{ noticeOf(task, $t).text }}</span>
						<b-button v-if="noticeOf(task, $t).kind === 'first-pass'" rounded size="is-small" @click="confirmFirstPass(task)">
							{{ $t('Run the first pass again') }}
						</b-button>
						<b-button v-if="noticeOf(task, $t).kind === 'deletes'" rounded size="is-small" @click="confirmDeletes(task)">
							{{ $t('Confirm the deletions') }}
						</b-button>
					</div>
				</div>
				<div class="is-flex is-align-items-center is-flex-wrap-wrap is-gap-1 ml-auto">
					<b-switch :disabled="saving" :model-value="task.enabled" size="is-small" @update:model-value="toggle(task, $event)">
						{{ $t('Enabled') }}
					</b-switch>
					<b-button v-if="!task.needs_first_pass && !task.needs_delete_confirm" :loading="busy === `run:${task.id}`" rounded size="is-small" @click="runNow(task)">
						{{ $t('Run now') }}
					</b-button>
					<b-button :disabled="notLoaded" rounded size="is-small" @click="edit(task)">
						{{ $t('Edit') }}
					</b-button>
					<b-button :disabled="saving" rounded size="is-small" @click="confirmDelete(task)">
						{{ $t('Delete') }}
					</b-button>
				</div>
			</section>
		</section>
		<footer class="modal-card-foot">
			<b-button :disabled="notLoaded" rounded size="is-small" type="is-primary" @click="edit(null)">
				{{ $t('New task') }}
			</b-button>
			<b-button rounded @click="$emit('close')">
				{{ $t('Close') }}
			</b-button>
		</footer>
	</div>
</template>

<script>
import escape from 'lodash/escape'
import CloudSyncTaskModal from './CloudSyncTaskModal.vue'
import { lastOf, noticeOf, routeOf, ruleOf } from './cloudSyncText.js'

// how often the list is read while the window is open
const POLL_MS = 15000

export default {
	name: 'cloud-sync',
	emits: ['close'],
	data() {
		return {
			tasks: [],
			isLoading: false,
			error: '',
			busy: '',
			// one save at a time: the list shown is the one the box was last told
			saving: false,
			timer: 0,
		}
	},
	computed: {
		// the app's language, as Intl wants it
		locale() {
			return this.$i18n.locale.replace('_', '-')
		},
		// the dialog saves the whole list: never from one that was not read
		notLoaded() {
			return this.isLoading || !!this.error || this.saving
		},
	},
	mounted() {
		this.load()
		this.timer = setInterval(() => this.load(true), POLL_MS)
	},
	beforeUnmount() {
		clearInterval(this.timer)
	},
	methods: {
		routeOf,
		ruleOf,
		lastOf,
		noticeOf,

		// quiet: the periodic read neither flashes the spinner nor wipes a list on a passing failure
		async load(quiet = false) {
			if (quiet && this.saving) {
				return
			}
			if (!quiet) {
				this.isLoading = true
			}
			try {
				const tasks = (await this.$api.sync.getTasks()).data.data || []
				// an answer that lands while a save is out would show the list from before it
				if (!this.saving) {
					this.tasks = tasks
				}
				this.error = ''
			} catch (error) {
				if (!quiet || !this.tasks.length) {
					this.error = this.$t('Sync tasks could not be loaded: {error}', { error: this.messageOf(error) })
				}
			} finally {
				this.isLoading = false
			}
		},

		async save(tasks) {
			// the switch keeps its own state: show the new list at once, put the old one back on a refusal
			const before = this.tasks
			this.tasks = tasks
			this.saving = true
			try {
				await this.$api.sync.saveTasks(tasks)
			} catch (error) {
				this.tasks = before
				this.toastError(error)
			} finally {
				this.saving = false
			}
		},

		toggle(task, enabled) {
			return this.save(this.tasks.map(each => (each.id === task.id ? { ...each, enabled } : each)))
		},

		async act(task, call, key) {
			this.busy = `${key}:${task.id}`
			try {
				await this.$api.sync[call](task.id)
				await this.load(true)
			} catch (error) {
				this.toastError(error)
			} finally {
				this.busy = ''
			}
		},

		runNow(task) {
			return this.act(task, 'run', 'run')
		},

		confirmFirstPass(task) {
			this.$buefy.dialog.confirm({
				title: this.$t('Run the first pass again?'),
				message: escape(this.$t('{name} will copy both ways once, from the cloud and from the box, and delete nothing. Files deleted on one side since the last pass will come back.', { name: task.name })),
				confirmText: this.$t('Run the first pass'),
				cancelText: this.$t('Cancel'),
				onConfirm: () => this.act(task, 'firstPass', 'first'),
			})
		},

		confirmDeletes(task) {
			this.$buefy.dialog.confirm({
				title: this.$t('Confirm the deletions?'),
				message: escape(this.$t('{name} will delete, on one side, the files that are gone from the other. Check that this is what you want: deleted files cannot be brought back unless copies are kept.', { name: task.name })),
				confirmText: this.$t('Delete the files'),
				cancelText: this.$t('Cancel'),
				type: 'is-danger',
				onConfirm: () => this.act(task, 'confirmDeletes', 'deletes'),
			})
		},

		confirmDelete(task) {
			this.$buefy.dialog.confirm({
				title: this.$t('Delete this sync task?'),
				message: escape(this.$t('{name} stops syncing. The files on the box and in the cloud are not touched.', { name: task.name })),
				confirmText: this.$t('Delete'),
				cancelText: this.$t('Cancel'),
				type: 'is-danger',
				onConfirm: () => this.save(this.tasks.filter(each => each.id !== task.id)),
			})
		},

		edit(task) {
			if (this.notLoaded) {
				return
			}
			this.$buefy.modal.open({
				component: CloudSyncTaskModal,
				hasModalCard: true,
				customClass: 'backup-modal',
				trapFocus: true,
				canCancel: ['escape'],
				scroll: 'keep',
				animation: 'zoom-in',
				props: { task, tasks: this.tasks },
				events: { saved: (list) => { this.tasks = list } },
			})
		},

		messageOf(error) {
			return error.response?.data?.message || error.message || String(error)
		},

		toastError(error) {
			this.$buefy.toast.open({ message: escape(this.messageOf(error)), type: 'is-danger', duration: 6000 })
		},
	},
}
</script>

<style lang="scss" scoped>
.cloud-sync {
  .task {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }

  ._tile {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.75rem;
    background: rgba($primary, 0.12);
    color: $primary;
  }

  ._text {
    flex: 1 1 14rem;
    min-width: 0;
  }

  ._name {
    font-weight: 600;
    color: var(--casa-text-strong);
  }
}
</style>
