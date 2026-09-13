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
				<b-field class="mt-3">
					<b-select v-model="username" :placeholder="$t('Choose an account')" expanded>
						<option v-for="user in users" :key="user" :value="user">
							{{ user }}
						</option>
					</b-select>
				</b-field>

				<p class="has-text-full-03 is-size-7">
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

export default {
	name: 'ShareAccessModal',
	props: {
		share: {
			type: Object,
			required: true,
		},
	},
	data() {
		return {
			requireAccount: !!this.share.username,
			username: this.share.username || '',
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

		canSave() {
			if (this.isSaving || (this.requireAccount && !this.username)) {
				return false
			}

			if (this.isNew) {
				return true
			}

			const next = this.requireAccount ? this.username : ''
			return next !== (this.share.username || '') || this.timeMachine !== !!this.share.time_machine
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

			const username = this.requireAccount ? this.username : ''

			try {
				if (this.isNew) {
					await this.$api.samba.createShare([{
						path: this.share.path,
						anonymous: username === '',
						username,
						time_machine: this.timeMachine,
					}])
				} else {
					await this.$api.samba.updateShare(this.share.id, {
						username,
						time_machine: this.timeMachine,
					})
				}

				// The caller shows the share's paths next; it should also say who can
				// open them, and it cannot read that back from a file item.
				this.$emit('reload', { username })
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
.share-access-modal {
  .modal-card-body {
    min-height: 12rem;
  }
}
</style>
