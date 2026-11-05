<template>
	<div class="modal-card member-folders-modal">
		<header class="modal-card-head">
			<h3 class="title is-header">
				{{ $t('Folders of {name}', { name: username }) }}
			</h3>
		</header>

		<section class="modal-card-body">
			<p class="has-text-full-03 is-size-7 mb-4">
				{{ $t('The folders this account can open:') }}
			</p>

			<b-message v-if="error" class="mb-4" size="is-small" type="is-danger">
				{{ error }}
			</b-message>

			<b-loading v-model="isLoading" :is-full-page="false" />

			<!-- The top-level folders of /DATA, the mounted disks and whatever is
			already shared. Ticking one that is not shared yet shares it with this
			account on Save. A guest share is open to everyone, so it is shown
			ticked and fixed. -->
			<div v-for="row in rows" :key="row.path"
				class="member-folders-modal__row is-flex is-align-items-center">
				<b-checkbox v-model="selected[row.path]" :disabled="row.guest" class="mr-2" />
				<b-icon :icon="row.disk ? 'harddisk' : 'folder-outline'" class="mr-2" size="is-small" />
				<span :class="{ 'has-text-full-03': !selected[row.path] }" :title="row.path"
					class="member-folders-modal__name is-flex-grow-1">
					{{ row.name }}
				</span>
				<span v-if="row.guest" class="has-text-full-03 is-size-7">{{ $t('Everyone') }}</span>
				<b-select v-else v-model="access[row.path]" :disabled="!selected[row.path]" size="is-small">
					<option value="rw">{{ $t('Read and write') }}</option>
					<option value="ro">{{ $t('Read only') }}</option>
				</b-select>
			</div>

			<b-button class="mt-3" icon-left="plus" rounded size="is-small" @click="addFolder">
				{{ $t('Add folder') }}
			</b-button>
		</section>

		<footer class="modal-card-foot is-flex is-align-items-center">
			<div class="is-flex-grow-1"></div>
			<b-button :label="$t('Cancel')" rounded @click="$emit('close')" />
			<b-button :disabled="!canSave" :label="$t('Save')" :loading="isSaving" rounded type="is-primary"
				@click="save" />
		</footer>
	</div>
</template>

<script>
import { shareMembers } from './shareMembers'
import PathPicker from '@/components/VirtualMachines/PathPicker.vue'

export default {
	name: 'MemberFoldersModal',
	props: {
		// the share account whose folders these are
		username: { type: String, required: true },
	},
	emits: ['close', 'saved'],
	data() {
		return {
			shares: [],
			folders: [],
			extra: [],
			selected: {},
			access: {},
			initial: '',
			isLoading: true,
			isSaving: false,
			error: '',
		}
	},
	computed: {
		// One row per folder: the shared ones, the top-level folders and disks,
		// and any picked with Add folder, by path.
		rows() {
			const byPath = {}

			const add = (path, disk, name) => {
				if (!byPath[path]) {
					byPath[path] = { path, name: name || path.split('/').pop(), disk, share: null, guest: false }
				}
				return byPath[path]
			}

			this.folders.forEach(f => add(f.path, f.disk, f.name))
			this.extra.forEach(path => add(path, false))
			this.shares.forEach((share) => {
				const row = add(share.path, false)
				row.share = share
				row.guest = shareMembers(share).length === 0
			})

			return Object.values(byPath).sort((a, b) => a.path.localeCompare(b.path))
		},

		// what is ticked, as a comparable string
		choice() {
			return this.rows
				.filter(r => !r.guest && this.selected[r.path])
				.map(r => `${r.path}:${this.access[r.path] || 'rw'}`)
				.join(' ')
		},

		canSave() {
			return !this.isLoading && !this.isSaving && this.choice !== this.initial
		},
	},
	async mounted() {
		await Promise.all([this.loadShares(), this.loadFolders()])
		this.initial = this.choice
		this.isLoading = false
	},
	methods: {
		messageOf(e) {
			return (e && e.response && e.response.data && e.response.data.message) || this.$t('Something went wrong.')
		},

		// tick the shares this account is in, and every guest share
		async loadShares() {
			try {
				const res = await this.$api.samba.getShares()
				this.shares = res.data.data || []
			} catch (e) {
				this.error = this.messageOf(e)
				this.shares = []
			}

			this.shares.forEach((share) => {
				const members = shareMembers(share)
				const me = members.find(m => m.username === this.username)
				this.selected[share.path] = members.length === 0 || !!me
				this.access[share.path] = me && me.read_only ? 'ro' : 'rw'
			})
		},

		// The top-level folders of /DATA, and the disks actually mounted: /media
		// on a desktop also holds each user's own folder, which only looks like
		// a disk.
		async loadFolders() {
			const folders = []

			try {
				const res = await this.$api.folder.getList('/DATA')
				const content = res.data.data?.content || []
				content
					.filter(e => e.is_dir && !e.name.startsWith('.'))
					.forEach(e => folders.push({ path: e.path, disk: false }))
			} catch {
				// a box whose /DATA cannot be read
			}

			try {
				const disks = await this.$api.storage.list({ system: 'show' }).then(v => v.data.data || [])
				disks
					.filter(d => d.disk_name !== 'System')
					.forEach(d => (d.children || [])
						.filter(part => part.mount_point && part.mount_point !== '/')
						.forEach(part => folders.push({ path: part.mount_point, disk: true, name: part.label })))
			} catch {
				// no storage service: no disks to offer
			}

			folders.forEach((f) => {
				if (!this.access[f.path]) {
					this.access[f.path] = 'rw'
				}
			})
			this.folders = folders
		},

		// A folder deeper down joins the list, ticked; it is shared on Save.
		addFolder() {
			const picker = this.$buefy.modal.open({
				component: PathPicker,
				hasModalCard: true,
				trapFocus: true,
				props: { start: '/DATA', folderOnly: true },
				events: {
					select: (path) => {
						picker.close()
						if (!this.extra.includes(path)) {
							this.extra.push(path)
						}
						this.selected[path] = true
						this.access[path] = this.access[path] || 'rw'
					},
				},
			})
		},

		async save() {
			if (!this.canSave) {
				return
			}

			this.isSaving = true
			this.error = ''

			try {
				// Folders not shared yet become shares of this account alone.
				const fresh = this.rows.filter(r => !r.share && this.selected[r.path])
				if (fresh.length > 0) {
					await this.$api.samba.createShare(fresh.map(r => ({
						path: r.path,
						anonymous: false,
						members: [{ username: this.username, read_only: this.access[r.path] === 'ro' }],
						time_machine: false,
					})))
					const res = await this.$api.samba.getShares()
					this.shares = res.data.data || []
				}

				const wanted = this.shares
					.filter(s => shareMembers(s).length > 0 && this.selected[s.path])
					.map(s => ({ id: s.id, read_only: this.access[s.path] === 'ro' }))
				await this.$api.samba.setUserShares(this.username, wanted)

				this.$emit('saved')
				this.$emit('close')
			} catch (e) {
				this.error = this.messageOf(e)
			} finally {
				this.isSaving = false
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.member-folders-modal {
  .modal-card-body {
    position: relative;
    min-height: 10rem;
    max-height: 60vh;
    overflow-y: auto;
  }

  &__row {
    min-height: 2.5rem;
  }

  &__name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
