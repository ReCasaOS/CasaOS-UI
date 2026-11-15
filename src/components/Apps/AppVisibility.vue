<template>
	<section v-if="isAdmin" class="modal-card-body app-visibility">
		<h4 class="title is-6 mb-3">
			{{ $t('Visibility') }}
		</h4>
		<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">
			{{ error }}
			<b-button v-if="!loaded" class="retry-visibility ml-2" rounded size="is-small" @click="load">
				{{ $t('Try again') }}
			</b-button>
		</b-message>

		<p v-if="loaded && !users.length" class="no-user-account is-size-7 _has-text-gray">
			{{ $t('Create an account to hide this app from it.') }}
		</p>
		<template v-else-if="loaded">
			<p v-if="!hidden.length" class="visible-to-all is-size-7 _has-text-gray mb-3">
				{{ $t('The app is visible to every account.') }}
			</p>
			<div v-for="u in users" :key="u.id" class="_row _box mb-2">
				<b-checkbox v-model="hidden" :native-value="u.id">
					{{ $t('Hidden for {name}', { name: u.username }) }}
				</b-checkbox>
			</div>
		</template>
		<!-- with no user account left, ids the server still holds can be cleared -->
		<b-button v-if="loaded && (users.length || hidden.length)" class="save-visibility mt-2" :loading="saving" rounded type="is-primary" @click="save">
			{{ $t('Save') }}
		</b-button>
	</section>
</template>

<script>
import { listAccounts } from '@/service/accounts'
import { getVisibility, setVisibility } from '@/service/visibility'

const sameIds = (a, b) => a.length === b.length && a.every(id => b.includes(id))

export default {
	name: 'AppVisibility',
	props: { appId: { type: String, required: true } },
	emits: ['state'],
	data() {
		// `saved`: the ids the server holds, to tell an unsaved tick from a saved one
		return { users: [], hidden: [], saved: [], loaded: false, saving: false, error: '' }
	},
	computed: {
		isAdmin() {
			return this.$store.getters.isAdmin && this.$store.state.roleConfirmed !== false
		},
		isDirty() {
			return this.loaded && !sameIds(this.hidden, this.saved)
		},
	},
	watch: {
		isDirty: {
			handler(isDirty) {
				this.$emit('state', { canApply: false, isApplying: false, isDirty })
			},
			immediate: true,
		},
		isAdmin(is) {
			if (is && !this.loaded) {
				this.load()
			}
		},
	},
	mounted() {
		// the tab is the admin's only; the server refuses anyone else anyway
		if (this.isAdmin) {
			return this.load()
		}
	},
	methods: {
		async load() {
			this.error = ''
			try {
				const [accounts, visibility] = await Promise.all([listAccounts(), getVisibility(this.appId)])
				this.users = (accounts.data.data || []).filter(a => a.role === 'user')
				this.saved = visibility.data.data?.hidden_for || []
				this.hidden = [...this.saved]
				this.loaded = true
			} catch {
				this.error = this.$t('The visibility could not be read')
			}
		},
		async save() {
			if (this.saving) {
				return
			}
			this.saving = true
			this.error = ''
			const asked = [...this.hidden]
			const sent = asked.filter(id => this.users.some(u => u.id === id)).sort((a, b) => a - b)
			try {
				const answer = (await setVisibility(this.appId, sent)).data.data?.hidden_for || []
				this.saved = answer
				// ticks changed while the save was on its way stay as they are
				if (sameIds(this.hidden, asked)) {
					this.hidden = [...answer]
				}
			} catch {
				this.error = this.$t('The visibility could not be saved')
			} finally {
				this.saving = false
			}
		},
	},
}
</script>
