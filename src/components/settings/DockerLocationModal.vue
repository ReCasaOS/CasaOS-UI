<template>
	<div class="modal-card docker-location">
		<header class="modal-card-head">
			<h3 class="title is-header">{{ $t('Docker data') }}</h3>
		</header>

		<!-- while a move runs, nothing else: Docker and the apps are stopped -->
		<section v-if="isMoving" class="modal-card-body has-text-centered py-6">
			<b-icon class="mb-3" icon="database-arrow-right-outline" size="is-large" />
			<p class="title is-5">{{ $t(phaseLabel) }}</p>
			<b-progress :max="100" :value="percent === null ? undefined : percent" class="mt-4" show-value size="is-medium"
				type="is-primary">
				{{ percent === null ? '' : `${percent}%` }}
			</b-progress>
			<p class="is-size-7 _hint mt-3">
				{{ $t('The apps are stopped until the move ends. Do not turn this machine off.') }}
			</p>
		</section>

		<section v-else class="modal-card-body">
			<b-message v-if="state.phase === 'failed' && state.message" size="is-small" type="is-danger">
				{{ state.message }}
			</b-message>
			<b-message v-if="justDone" size="is-small" type="is-success">
				{{ $t('Docker\'s data is now in {place}.', { place: where }) }}
			</b-message>

			<p class="label mb-1">{{ $t('Now in') }}</p>
			<p class="mb-1">{{ where }}</p>
			<p class="is-size-7 _hint mb-4">
				{{ $t('{size} for images, containers and volumes · {count} containers', { size: formatBytes(current.used_bytes), count: current.containers || 0 }) }}
			</p>

			<template v-if="(state.old_copy || []).length">
				<p class="label mb-1">{{ $t('Old copy') }}</p>
				<p class="is-size-7 _hint">{{ state.old_copy.join(', ') }}</p>
				<div class="is-flex is-align-items-center mt-2 mb-4">
					<p class="is-size-7 is-flex-grow-1">{{ $t('What the last move left behind. Delete it once the apps run as they should.') }}</p>
					<b-button :loading="deleting" class="ml-2" size="is-small" type="is-danger" @click="deleteOld">
						{{ $t('Delete') }}
					</b-button>
				</div>
			</template>

			<!-- from a folder, only back: a move to another folder goes through the default place -->
			<p v-if="state.location" class="is-size-7 _hint">
				{{ $t('To put Docker\'s data in another folder, move it back to the default place first.') }}
			</p>
			<b-field v-if="!state.location" :label="$t('Move to')" :message="checkMessage" :type="check && !check.ok ? 'is-danger' : ''">
				<b-input :model-value="target" expanded readonly size="is-small"
					:placeholder="$t('A folder under /DATA or /media')"></b-input>
				<p class="control">
					<b-button size="is-small" @click="pick">{{ $t('Browse…') }}</b-button>
				</p>
			</b-field>
			<p v-if="!state.location" class="is-size-7 _hint">
				{{ $t('Docker stops, its data is copied, and it starts again from the new place with the apps that were running. If anything goes wrong, everything goes back as it was. The old data stays until you delete it.') }}
			</p>
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<template v-if="!isMoving">
				<b-button v-if="state.location" :disabled="busy" class="mr-auto" rounded @click="moveBack">
					{{ $t('Back to the default place') }}
				</b-button>
				<b-button rounded @click="$emit('close')">{{ $t('Close') }}</b-button>
				<b-button v-if="!state.location" :disabled="!check || !check.ok || busy" :loading="busy" rounded type="is-primary" @click="move(target)">
					{{ $t('Move') }}
				</b-button>
			</template>
		</footer>
	</div>
</template>

<script>
import escape from 'lodash/escape'
import { dockerLocationApi } from './dockerLocation'
import { PHASES, copyPercent, locationLabel, moving } from './dockerLocationState'
import PathPicker from '@/components/VirtualMachines/PathPicker.vue'

export default {
	name: 'DockerLocationModal',
	emits: ['close'],
	data() {
		return {
			state: {},
			current: {},
			target: '',
			check: null,
			busy: false,
			deleting: false,
			justDone: false,
			timer: null,
		}
	},
	computed: {
		isMoving() {
			return moving(this.state)
		},
		phaseLabel() {
			return PHASES[this.state.phase] || ''
		},
		percent() {
			return this.state.phase === 'copying' ? copyPercent(this.state) : null
		},
		where() {
			return locationLabel(this.state)
		},
		checkMessage() {
			if (!this.check) {
				return ''
			}
			if (!this.check.ok) {
				return this.check.reason
			}
			return this.$t('{fs} · {free} free, the move needs {need}', {
				fs: this.check.fs_type,
				free: this.formatBytes(this.check.free_bytes),
				need: this.formatBytes(this.check.need_bytes),
			})
		},
	},
	mounted() {
		this.refresh()
		// the size and the number of containers, whatever the answer says
		dockerLocationApi.check(null).then((res) => {
			this.current = res.data.data || {}
		}).catch(() => {})
	},
	beforeUnmount() {
		clearTimeout(this.timer)
	},
	methods: {
		formatBytes(bytes) {
			if (!bytes) {
				return '0 B'
			}
			const units = ['B', 'KB', 'MB', 'GB', 'TB']
			const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
			return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`
		},
		// asks every second while a move runs
		async refresh() {
			clearTimeout(this.timer)
			const wasMoving = this.isMoving
			try {
				const res = await dockerLocationApi.get()
				this.state = res.data.data || {}
			} catch {
				// Docker, or this service, may be restarting: ask again
			}
			if (this.isMoving || (wasMoving && !this.state.phase)) {
				this.timer = setTimeout(this.refresh, 1000)
			} else if (wasMoving) {
				this.justDone = this.state.phase === 'done'
				this.target = ''
				this.check = null
				dockerLocationApi.check(null).then((res) => {
					this.current = res.data.data || {}
				}).catch(() => {})
			}
		},
		pick() {
			const modal = this.$buefy.modal.open({
				component: PathPicker,
				hasModalCard: true,
				trapFocus: true,
				props: { folderOnly: true, start: this.target || '/media' },
				events: {
					select: async (path) => {
						modal.close()
						this.target = path
						this.check = null
						try {
							const res = await dockerLocationApi.check(path)
							this.check = res.data.data
						} catch (e) {
							this.check = { ok: false, reason: e.response?.data?.message || e.message }
						}
					},
				},
			})
		},
		move(path) {
			this.$buefy.dialog.confirm({
				title: this.$t('Move Docker\'s data?'),
				message: this.$t('The apps stop while the data is copied, a few minutes for most, longer for large images. They start again once it is done.'),
				confirmText: this.$t('Move'),
				cancelText: this.$t('Cancel'),
				onConfirm: () => this.start(path),
			})
		},
		moveBack() {
			this.$buefy.dialog.confirm({
				title: this.$t('Move Docker\'s data back?'),
				message: this.$t('It goes back to /var/lib/docker on the system disk. The apps stop while the data is copied.'),
				confirmText: this.$t('Move'),
				cancelText: this.$t('Cancel'),
				onConfirm: () => this.start(null),
			})
		},
		async start(path) {
			this.busy = true
			this.justDone = false
			try {
				const res = await dockerLocationApi.move(path)
				this.state = res.data.data || {}
				this.refresh()
			} catch (e) {
				// a POST that timed out may have started the move all the same:
				// ask, and follow it if it runs
				await this.refresh()
				if (!this.isMoving) {
					this.$buefy.toast.open({ message: escape(e.response?.data?.message || e.message), type: 'is-danger' })
				}
			} finally {
				this.busy = false
			}
		},
		deleteOld() {
			this.$buefy.dialog.confirm({
				title: this.$t('Delete the old copy?'),
				message: this.$t('It is not used any more; deleting it frees its space. This cannot be undone.'),
				confirmText: this.$t('Delete'),
				cancelText: this.$t('Cancel'),
				type: 'is-danger',
				onConfirm: async () => {
					this.deleting = true
					try {
						const res = await dockerLocationApi.deleteOldCopy()
						this.state = res.data.data || {}
					} catch (e) {
						if (!e.response) {
							// no answer in time: the box goes on deleting
							this.$buefy.toast.open({ message: this.$t('The old copy is still being deleted. Reopen this page in a while to see it gone.'), type: 'is-info' })
							await this.refresh()
							return
						}
						this.state = e.response.data?.data || this.state
						this.$buefy.toast.open({ message: escape(e.response.data?.message || e.message), type: 'is-danger' })
					} finally {
						this.deleting = false
					}
				},
			})
		},
	},
}
</script>

<style lang="scss" scoped>
.docker-location {
	max-width: 100%;

	._hint {
		color: var(--casa-text-hint);
	}
}
</style>
