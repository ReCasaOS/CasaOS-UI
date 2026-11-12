<template>
	<div class="modal-card samba-users-modal">
		<header class="modal-card-head">
			<h3 class="title is-header">
				{{ $t('Share accounts') }}
			</h3>
		</header>

		<section class="modal-card-body">
			<p class="has-text-full-03 is-size-7 mb-4">
				{{ $t('These accounts exist only for network shares. They are separate from your CasaOS login and cannot be used to sign in.') }}
			</p>

			<b-message v-if="error" class="mb-4" size="is-small" type="is-danger">
				{{ error }}
			</b-message>

			<b-loading v-model="isLoading" :is-full-page="false" />

			<div v-if="!isLoading && users.length === 0" class="has-text-full-03 is-size-7 mb-4">
				{{ $t('No share account yet.') }}
			</div>

			<div v-for="user in users" :key="user" class="samba-users-modal__row is-flex is-align-items-center">
				<div class="is-flex-grow-1">
					{{ user }}
					<span class="has-text-full-03 is-size-7 ml-2">
						{{ folderCount(user) === 1 ? $t('1 folder') : $t('{count} folders', { count: folderCount(user) }) }}
					</span>
				</div>
				<b-button class="mr-2" rounded size="is-small" @click="editFolders(user)">
					{{ $t('Folders') }}
				</b-button>
				<b-button class="mr-2" rounded size="is-small" @click="changePassword(user)">
					{{ $t('Change password') }}
				</b-button>
				<b-button rounded size="is-small" type="is-danger" @click="remove(user)">
					{{ $t('Delete') }}
				</b-button>
			</div>

			<hr>

			<p class="is-size-7 mb-2">
				{{ $t('Add an account') }}
			</p>

			<b-field :message="usernameError" :type="{ 'is-danger': usernameError }">
				<b-input v-model="newUsername" :placeholder="$t('Account name')" />
			</b-field>

			<b-field>
				<b-input v-model="newPassword" :placeholder="$t('Password')" password-reveal type="password" />
			</b-field>

			<b-button :disabled="!canCreate" :loading="isSaving" rounded type="is-primary" @click="create">
				{{ $t('Add') }}
			</b-button>
		</section>

		<footer class="modal-card-foot is-flex is-align-items-center">
			<div class="is-flex-grow-1"></div>
			<b-button :label="$t('Close')" rounded @click="$emit('close')" />
		</footer>
	</div>
</template>

<script>
// Mirrors the pattern the backend validates against, so a bad name is refused
// here with an explanation rather than by the API with a generic error.
import escape from 'lodash/escape'
import MemberFoldersModal from './MemberFoldersModal.vue'
import { shareMembers } from './shareMembers'

const USERNAME_PATTERN = /^[a-z_][a-z0-9_-]{0,30}$/

export default {
	name: 'SambaUsersModal',
	data() {
		return {
			users: [],
			shares: [],
			isLoading: true,
			isSaving: false,
			newUsername: '',
			newPassword: '',
			error: '',
		}
	},
	computed: {
		usernameError() {
			if (this.newUsername === '') {
				return ''
			}

			if (!USERNAME_PATTERN.test(this.newUsername)) {
				return this.$t('Use 1 to 31 characters: lowercase letters, digits, underscores and hyphens, starting with a letter or underscore.')
			}

			if (this.users.includes(this.newUsername)) {
				return this.$t('An account with that name already exists.')
			}

			return ''
		},
		canCreate() {
			return this.newUsername !== '' && this.newPassword !== '' && this.usernameError === '' && !this.isSaving
		},
	},
	mounted() {
		this.load()
	},
	methods: {
		async load() {
			this.isLoading = true
			try {
				const [users, shares] = await Promise.all([this.$api.samba.getUsers(), this.$api.samba.getShares()])
				this.users = users.data.data || []
				this.shares = shares.data.data || []
			} catch (e) {
				this.error = this.messageOf(e)
			} finally {
				this.isLoading = false
			}
		},

		folderCount(username) {
			// a guest share opens for this account too, as Folders shows it
			return this.shares.filter((s) => {
				const members = shareMembers(s)
				return members.length === 0 || members.some(m => m.username === username)
			}).length
		},

		// which folders an account opens, and how
		editFolders(username) {
			this.$buefy.modal.open({
				component: MemberFoldersModal,
				hasModalCard: true,
				trapFocus: true,
				canCancel: ['escape'],
				scroll: 'keep',
				animation: 'zoom-in',
				props: { username },
				events: { saved: () => this.load() },
			})
		},

		messageOf(e) {
			return (e && e.response && e.response.data && e.response.data.message) || this.$t('Something went wrong.')
		},

		async create() {
			if (!this.canCreate) {
				return
			}

			this.isSaving = true
			this.error = ''

			try {
				await this.$api.samba.createUser({ username: this.newUsername, password: this.newPassword })
				this.newUsername = ''
				this.newPassword = ''
				await this.load()
			} catch (e) {
				this.error = this.messageOf(e)
			} finally {
				this.isSaving = false
			}
		},

		changePassword(username) {
			this.$buefy.dialog.prompt({
				message: escape(this.$t('New password for {name}', { name: username })),
				inputAttrs: { type: 'password', required: true },
				confirmText: this.$t('Save'),
				cancelText: this.$t('Cancel'),
				trapFocus: true,
				onConfirm: async (password) => {
					try {
						await this.$api.samba.setUserPassword(username, password)
						this.$buefy.toast.open({ message: this.$t('Password changed.'), type: 'is-success' })
					} catch (e) {
						this.$buefy.toast.open({ message: escape(this.messageOf(e)), type: 'is-danger' })
					}
				},
			})
		},

		remove(username) {
			this.$buefy.dialog.confirm({
				// The API takes the account out of its shares, and refuses while it is
				// the only one a share lets in, so this only warns about the account.
				message: escape(this.$t('Delete the account {name}? Anyone using it will lose access.', { name: username })),
				confirmText: this.$t('Delete'),
				cancelText: this.$t('Cancel'),
				type: 'is-danger',
				onConfirm: async () => {
					try {
						await this.$api.samba.deleteUser(username)
						await this.load()
					} catch (e) {
						this.$buefy.toast.open({ message: escape(this.messageOf(e)), type: 'is-danger' })
					}
				},
			})
		},
	},
}
</script>

<style lang="scss" scoped>
.samba-users-modal {
  &__row {
    padding: 0.375rem 0;
  }

  .modal-card-body {
    position: relative;
    min-height: 10rem;
  }
}
</style>
