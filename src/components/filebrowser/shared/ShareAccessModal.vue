<template>
	<div class="modal-card share-access-modal">
		<header class="modal-card-head">
			<h3 class="title is-header">
				{{ isNew ? $t('Share this folder') : $t('Who can open this folder') }}
			</h3>
		</header>

		<section class="modal-card-body">
			<p class="has-text-full-03 is-size-7 mb-4">
				{{ share.path }}
			</p>

			<b-message v-if="error" class="mb-4" size="is-small" type="is-danger">
				{{ error }}
			</b-message>

			<b-switch v-model="requireAccount">
				{{ $t('Require an account') }}
			</b-switch>

			<p v-if="!requireAccount" class="has-text-full-03 is-size-7 mt-2">
				{{ $t('Anyone on the network can read and write this folder.') }}
			</p>

			<template v-else>
				<p v-if="users.length === 0" class="has-text-full-03 is-size-7 mt-3">
					{{ $t('No share account yet.') }}
				</p>

				<div v-for="user in users" :key="user" class="share-member">
					<b-checkbox v-model="selected[user]" class="mr-0" />
					<span class="share-member-name">{{ user }}</span>
					<b-select v-model="access[user]" :disabled="!selected[user]" class="plain-select">
						<option value="rw">{{ $t('Read and write') }}</option>
						<option value="ro">{{ $t('Read only') }}</option>
					</b-select>
				</div>

				<p class="has-text-full-03 is-size-7 mt-2">
					<a href="#" @click.prevent="manageUsers">{{ $t('Manage accounts') }}</a>
				</p>
			</template>

			<b-switch v-model="timeMachine" class="mt-4">
				{{ $t('Use as a Time Machine destination') }}
			</b-switch>

			<p v-if="timeMachine" class="has-text-full-03 is-size-7 mt-1">
				{{ $t('Macs on the network will offer this folder as a Time Machine backup disk.') }}
			</p>

			<p class="has-text-full-03 is-size-7 mt-4">
				{{ $t('Files already in the folder keep their current permissions.') }}
			</p>
		</section>

		<footer class="modal-card-foot is-flex is-align-items-center">
			<div class="is-flex-grow-1"></div>
			<div>
				<b-button :label="$t('Cancel')" rounded @click="$emit('close')" />
				<b-button :disabled="!canSave" :label="isNew ? $t('Share') : $t('Save')" :loading="isSaving" rounded
					type="is-primary" @click="save" />
			</div>
		</footer>
	</div>
</template>

<script>
import SambaUsersModal from './SambaUsersModal.vue'
import { shareMembers } from './shareMembers'

export default {
	name: 'ShareAccessModal',
	props: {
		share: {
			type: Object,
			required: true,
		},
	},
	data() {
		const members = shareMembers(this.share)
		const selected = {}
		const access = {}

		members.forEach((m) => {
			selected[m.username] = true
			access[m.username] = m.read_only ? 'ro' : 'rw'
		})

		return {
			requireAccount: members.length > 0,
			selected,
			access,
			timeMachine: !!this.share.time_machine,
			users: [],
			isSaving: false,
			error: '',
		}
	},
	computed: {
		// The same dialog creates a share and edits one. A folder that has no id
		// yet is being shared for the first time, which is the case the context
		// menu used to skip entirely -- it posted a guest share and never asked.
		isNew() {
			return !this.share.id
		},

		// Who may open the folder once saved, in the order the accounts are listed.
		members() {
			if (!this.requireAccount) {
				return []
			}

			return this.users
				.filter(u => this.selected[u])
				.map(u => ({ username: u, read_only: this.access[u] === 'ro' }))
		},

		canSave() {
			if (this.isSaving || (this.requireAccount && this.members.length === 0)) {
				return false
			}

			if (this.isNew) {
				return true
			}

			const key = list => list.map(m => `${m.username}:${m.read_only ? 'ro' : 'rw'}`).sort().join(' ')
			return key(this.members) !== key(shareMembers(this.share)) || this.timeMachine !== !!this.share.time_machine
		},
	},
	created() {
		this.loadUsers()
	},
	methods: {
		async loadUsers() {
			try {
				const response = await this.$api.samba.getUsers()
				this.users = response.data.data || []
				this.users.forEach((u) => {
					if (!this.access[u]) {
						this.access[u] = 'rw'
					}
				})
			} catch {
				this.users = []
			}
		},

		manageUsers() {
			this.$buefy.modal.open({
				component: SambaUsersModal,
				hasModalCard: true,
				trapFocus: true,
				canCancel: ['escape'],
				scroll: 'keep',
				animation: 'zoom-in',
				events: { close: () => this.loadUsers() },
			})
		},

		async save() {
			if (!this.canSave) {
				return
			}

			this.isSaving = true
			this.error = ''

			const members = this.members

			try {
				if (this.isNew) {
					await this.$api.samba.createShare([{
						path: this.share.path,
						anonymous: members.length === 0,
						members,
						time_machine: this.timeMachine,
					}])
				} else {
					await this.$api.samba.updateShare(this.share.id, {
						members,
						time_machine: this.timeMachine,
					})
				}

				// The caller shows the share's paths next; it should also say who can
				// open them, and it cannot read that back from a file item.
				this.$emit('reload', { members })
				this.$emit('close')
			} catch (e) {
				this.error = (e && e.response && e.response.data && e.response.data.message) || this.$t('Something went wrong.')
			} finally {
				this.isSaving = false
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.share-member {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	min-height: 2.75rem;

	& + .share-member {
		border-top: 1px solid var(--casa-border-faint);
	}

	.share-member-name {
		flex-grow: 1;
		line-height: 2rem;
	}
}

// a select that reads as text with a small chevron
.plain-select :deep(.select) {
	height: 2rem;

	select {
		height: 2rem;
		padding: 0 1.75rem 0 0.5rem !important;
		border: none;
		background: transparent;
		box-shadow: none;
		line-height: 2rem;
		font-size: 0.8125rem;
	}

	&:not(.is-multiple):not(.is-loading)::after {
		top: 50%;
		right: 0.625rem;
		width: 0.5em;
		height: 0.5em;
		margin-top: -0.375em;
		border-width: 2px;
	}
}
</style>
