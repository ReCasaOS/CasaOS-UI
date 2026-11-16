<template>
	<div class="modal-card accounts-modal touch-targets">
		<header class="modal-card-head">
			<h3 class="title is-header">
				{{ $t('Accounts') }}
			</h3>
		</header>

		<section class="modal-card-body">
			<b-loading :is-full-page="false" :model-value="waitingForRole" :can-cancel="false" />
			<b-message v-if="roleUnconfirmed" size="is-small" type="is-warning">
				{{ $t('Your account could not be confirmed with the box. Reload the page to try again.') }}
			</b-message>
			<template v-if="isAdmin">
				<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">
					{{ error }}
				</b-message>

				<!-- a row is drawn again after a save of its rights: a box the server did not keep is unticked even when the
					answer says the same as before. The others keep their place and the keyboard's. -->
				<div v-for="a in accounts" :key="`${a.id}:${rowVersion[a.id] || 0}`" class="_row _box mb-2">
					<div class="is-flex is-align-items-center">
						<div class="is-flex-grow-1 ml-2">
							{{ a.username }}
							<span class="is-size-7 _has-text-gray ml-1">{{ a.role === 'admin' ? $t('Owner') : $t('Account') }}</span>
						</div>
						<b-button v-if="a.role !== 'admin'" class="delete-account" rounded size="is-small" type="is-danger is-light" @click="remove(a)">
							{{ $t('Delete {name}', { name: a.username }) }}
						</b-button>
					</div>
					<!-- what the account may read besides its apps: the owner reads everything -->
					<div v-if="a.role !== 'admin'" class="ml-2 mt-1 rights">
						<div v-for="m in modules" :key="m.name" class="mb-1">
							<b-checkbox :disabled="!!savingRights[a.id]" :model-value="hasRight(a, m.name)"
								:native-value="m.name" :name="`right-${a.id}-${m.name}`" class="is-size-7 mb-0"
								@update:model-value="setRight(a, m.name, $event)">
								{{ $t(m.label) }}
							</b-checkbox>
							<p class="right-help is-size-7 _has-text-gray ml-5">{{ $t(m.help) }}</p>
						</div>
					</div>
				</div>

				<!-- an uninstalled app keeps its entry, so what it left stays hidden; the owner removes the ones no longer wanted -->
				<div v-if="orphans.length" class="mt-4 orphans">
					<p class="has-text-weight-semibold">{{ $t('Apps no longer installed that stay hidden') }}</p>
					<p class="is-size-7 _has-text-gray mb-2">{{ $t('Their logs, statistics and backups stay hidden from the same accounts until the entry is removed.') }}</p>
					<div v-for="app in orphans" :key="app" class="_row _box mb-2 is-flex is-align-items-center">
						<span class="is-flex-grow-1 ml-2">{{ app }}</span>
						<b-button class="remove-orphan" rounded size="is-small" type="is-danger is-light" @click="removeOrphan(app)">
							{{ $t('Remove {name}', { name: app }) }}
						</b-button>
					</div>
				</div>

				<form class="mt-4" @submit.prevent="create">
					<b-field :label="$t('Username')">
						<b-input v-model="username" autocomplete="off" name="new-account-name" />
					</b-field>
					<b-field :label="$t('Password')">
						<b-input v-model="password" autocomplete="new-password" name="new-account-password" password-reveal type="password" />
					</b-field>
					<b-button class="create-account" :disabled="!username.trim() || !password" :loading="saving" native-type="submit" rounded type="is-primary">
						{{ $t('Create') }}
					</b-button>
				</form>
			</template>
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button :label="$t('Close')" rounded @click="$emit('close')" />
		</footer>
	</div>
</template>

<script>
import escape from 'lodash/escape'
import { createAccount, deleteAccount, listAccounts, setRights } from '@/service/accounts'
import { forgetApp, listOrphans } from '@/service/visibility'

// the box's own minimum for a password
const MIN_PASSWORD = 6

// the rights the box knows (UserService's list), in the order of the screen;
// help: what the box opens, as the dashboard shows it to such an account
const MODULES = [
	{ name: 'storage', label: 'Storage', help: 'The disks and their health, RAID, SnapRAID and ZFS, on the new dashboard.' },
	{ name: 'vm', label: 'Virtual Machines', help: 'The virtual machines and their state, on their card and on the new dashboard, and their statistics. No console, no change.' },
	{ name: 'backups', label: 'Backups', help: 'The last backup of each app, on its card, and the backups card of the new dashboard. No restore, no keys.' },
	{ name: 'fleet', label: 'Fleet', help: 'The boxes of the fleet and whether they are online, on the new dashboard. No access to the boxes.' },
	{ name: 'system', label: 'System', help: 'The load, memory, network and disk space of this box, on the widgets and on the new dashboard, and its statistics.' },
]

export default {
	name: 'AccountsModal',
	emits: ['close'],
	data() {
		return { accounts: [], orphans: [], username: '', password: '', error: '', saving: false, savingRights: {}, modules: MODULES, rowVersion: {} }
	},
	computed: {
		// the stored role opens the screen only once the server has confirmed it
		// the stored role says owner, the server has not confirmed it yet
		waitingForRole() {
			return this.$store.getters.isAdmin && this.$store.state.roleConfirmed === false && !this.$store.state.roleFailed
		},
		// asked twice, no answer: no spinner for ever
		roleUnconfirmed() {
			return this.$store.getters.isAdmin && this.$store.state.roleConfirmed === false && !!this.$store.state.roleFailed
		},
		isAdmin() {
			return this.$store.getters.isAdmin && this.$store.state.roleConfirmed !== false
		},
	},
	watch: {
		isAdmin(is) {
			if (is) {
				this.refresh()
			}
		},
	},
	mounted() {
		// the entry is the admin's only; the server refuses anyone else anyway
		if (this.isAdmin) {
			return this.refresh()
		}
	},
	methods: {
		// the server's message, in the language of the screen when it has the sentence; a plain sentence when the box could not be reached
		reason(e, fallback) {
			const m = e?.response?.data?.message
			if (typeof m !== 'string' || !m) {
				return fallback
			}
			return this.$te?.(m) ? this.$t(m) : m
		},
		// the answers come back in the order they were asked: a slower, older one is dropped
		async refresh() {
			this.readOrphans()
			const ticket = (this.refreshTicket = (this.refreshTicket || 0) + 1)
			try {
				const accounts = (await listAccounts()).data.data || []
				if (ticket === this.refreshTicket) {
					this.accounts = accounts
				}
			} catch (e) {
				if (ticket === this.refreshTicket) {
					this.error = this.reason(e, this.$t('The accounts could not be read'))
				}
			}
		},
		// a list that cannot be read is no list: the screen is the accounts' first
		async readOrphans() {
			const ticket = (this.orphansTicket = (this.orphansTicket || 0) + 1)
			try {
				const orphans = (await listOrphans()).data.data
				if (ticket === this.orphansTicket) {
					this.orphans = Array.isArray(orphans) ? orphans : []
				}
			} catch {
				if (ticket === this.orphansTicket) {
					this.orphans = []
				}
			}
		},
		removeOrphan(app) {
			this.$buefy.dialog.confirm({
				message: this.$t('Remove the entry of {name}? What the app left becomes visible to every account.', { name: escape(app) }),
				type: 'is-danger',
				confirmText: this.$t('Remove'),
				cancelText: this.$t('Cancel'),
				onConfirm: async () => {
					this.error = ''
					try {
						await forgetApp(app)
					} catch (e) {
						this.error = this.reason(e, this.$t('The entry could not be removed'))
					}
					await this.readOrphans()
				},
			})
		},
		hasRight(account, name) {
			return Array.isArray(account.rights) && account.rights.includes(name)
		},
		// the whole list is sent, in the screen's order; the list is read again after, so the boxes show what the server kept
		async setRight(account, name, on) {
			if (this.savingRights[account.id]) {
				return
			}
			const rights = MODULES.map(m => m.name).filter(n => (n === name ? on : this.hasRight(account, n)))
			this.savingRights[account.id] = true
			this.error = ''
			try {
				const saved = (await setRights(account.id, rights)).data?.data
				// what the server kept, shown at once: the list read again below may not come
				account.rights = Array.isArray(saved) ? saved : rights
			} catch (e) {
				this.error = this.reason(e, this.$t('The rights could not be saved'))
			} finally {
				this.savingRights[account.id] = false
			}
			this.rowVersion[account.id] = (this.rowVersion[account.id] || 0) + 1
			// the row was drawn again: the keyboard goes back to the box it was on
			await this.$nextTick()
			this.$el.querySelector?.(`input[name="right-${account.id}-${name}"]`)?.focus()
			await this.refresh()
		},
		async create() {
			if (this.saving) {
				return
			}
			const username = this.username.trim()
			if (!username) {
				return
			}
			if (this.password.length < MIN_PASSWORD) {
				this.error = this.$t('The password must have at least 6 characters.')
				return
			}
			this.saving = true
			this.error = ''
			try {
				await createAccount(username, this.password)
				this.username = ''
				this.password = ''
			} catch (e) {
				this.error = this.reason(e, this.$t('The account could not be created'))
			} finally {
				this.saving = false
			}
			await this.refresh()
		},
		remove(account) {
			this.$buefy.dialog.confirm({
				message: this.$t('Delete the account {name}? Its apps and files stay.', { name: escape(account.username) }),
				type: 'is-danger',
				confirmText: this.$t('Delete'),
				cancelText: this.$t('Cancel'),
				onConfirm: async () => {
					this.error = ''
					try {
						await deleteAccount(account.id)
					} catch (e) {
						this.error = this.reason(e, this.$t('The account could not be deleted'))
					}
					await this.refresh()
				},
			})
		},
	},
}
</script>

<style lang="scss">
// the settings menu gives its rows one fixed height (TopBar ._box); an account row also holds its rights
.accounts-modal ._box {
	height: auto;
	min-height: 2.5rem;
}
</style>
