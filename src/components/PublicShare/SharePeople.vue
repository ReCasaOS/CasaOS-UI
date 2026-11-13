<template>
	<div class="share-people">
		<p class="has-text-weight-medium mb-2">{{ $t('People with an access code') }}</p>
		<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">{{ error }}</b-message>

		<p v-if="!people.length" class="is-size-7 mb-2">{{ $t('No one has a code yet.') }}</p>
		<ul v-else>
			<li v-for="p in page" :key="p.id" class="mb-2 person">
				<span class="has-text-weight-medium">{{ p.name }}</span>
				<span class="is-size-7 ml-1">{{ p.apps.length ? p.apps.map(label).join(', ') : $t('No app') }}</span>
				<span class="is-size-7 ml-1 has-text-grey">{{ p.last_used_at ? $t('Last used {date}', { date: day(p.last_used_at) }) : $t('Never used') }}</span>
				<b-button class="ml-1 edit" size="is-small" type="is-text" :disabled="busy" @click="startEdit(p)">{{ $t('Edit') }}</b-button>
				<b-button class="new-code" size="is-small" type="is-text" :disabled="busy" @click="confirmCode(p)">{{ $t('New code') }}</b-button>
				<b-button class="delete-person" size="is-small" type="is-text" :disabled="busy" @click="confirmDelete(p)">{{ $t('Delete') }}</b-button>
			</li>
		</ul>
		<b-pagination v-if="people.length > PER" v-model="current" :per-page="PER" :total="people.length" size="is-small" />

		<form v-if="form" class="person-form mt-2" @submit.prevent="save">
			<input v-model="form.name" class="input is-small mb-2" name="person-name" maxlength="40" :aria-label="$t('Name')" :placeholder="$t('Name')">
			<p v-if="!choices.length" class="is-size-7 mb-2 no-code-app">{{ $t('Protect an app with a code first, then give people access to it.') }}</p>
			<div v-else class="mb-2">
				<label v-for="a in choices" :key="a" class="checkbox mr-3 is-size-7">
					<input v-model="form.apps" class="mr-1" type="checkbox" name="person-app" :value="a">{{ label(a) }}
				</label>
			</div>
			<b-button native-type="submit" rounded size="is-small" type="is-primary" :disabled="busy || !form.name.trim() || (!form.id && !form.apps.length)">{{ $t('Save') }}</b-button>
			<b-button class="ml-1" rounded size="is-small" :disabled="busy" @click="form = null">{{ $t('Cancel') }}</b-button>
		</form>
		<b-button v-else class="mt-1 add-person" outlined rounded size="is-small" :disabled="busy" @click="form = { id: null, name: '', apps: [] }">{{ $t('Add a person') }}</b-button>
	</div>
</template>

<script>
import { guardErrorText } from './guardWords'
import { appEntry } from './shareWords'
import { publicShare } from '@/service/publicShare'
import { refreshGuard, shareGuard, shareGuardApi, touchGuard } from '@/service/shareGuard'

const PER = 25

export default {
	name: 'SharePeople',
	// the code of an add or a new code goes up to the section and is kept nowhere here
	emits: ['code'],
	data() {
		return { shareGuard, publicShare, PER, current: 1, form: null, busy: false, error: '' }
	},
	computed: {
		people() {
			return shareGuard.view?.people || []
		},
		page() {
			return this.people.slice((this.current - 1) * PER, this.current * PER)
		},
		// an edited person keeps the apps they already have, even if those are no longer protected by code
		choices() {
			const apps = shareGuard.view?.apps || {}
			const own = this.form?.id ? this.people.find(p => p.id === this.form.id)?.apps || [] : []
			return [...new Set([...Object.keys(apps).filter(a => apps[a].access === 'code'), ...own.filter(a => apps[a])])]
		},
	},
	watch: {
		// a delete can leave the page empty
		people(list) {
			this.current = Math.max(1, Math.min(this.current, Math.ceil(list.length / PER)))
		},
	},
	methods: {
		label(name) {
			return appEntry(publicShare.status, name)?.label || name
		},
		day(time) {
			const d = new Date(time)
			return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(this.$i18n.locale.replace('_', '-'))
		},
		startEdit(p) {
			this.form = { id: p.id, name: p.name, apps: [...p.apps] }
		},
		// runs a write, then reads the people again; `fn` answers the code to show, if any
		async run(fn) {
			this.busy = true
			this.error = ''
			try {
				const shown = await fn()
				touchGuard()
				if (shown) {
					this.$emit('code', shown)
				}
				this.form = null
				await refreshGuard({ force: true })
			} catch (e) {
				this.error = guardErrorText(e, this.$t)
				// the core may have saved it all the same
				await refreshGuard({ force: true })
			} finally {
				this.busy = false
			}
		},
		save() {
			const { id, name, apps } = this.form
			const n = name.trim()
			return this.run(async () => {
				if (id) {
					await shareGuardApi.updatePerson(id, n, apps)
					return null
				}
				return { name: n, code: (await shareGuardApi.addPerson(n, apps)).data.data.code }
			})
		},
		confirmCode(p) {
			this.$buefy.dialog.confirm({
				title: this.$t('New code for {name}?', { name: p.name }),
				message: this.$t('The old code stops working. The new one is shown once.'),
				type: 'is-warning',
				hasIcon: true,
				confirmText: this.$t('New code'),
				cancelText: this.$t('Cancel'),
				focusOn: 'cancel',
				onConfirm: () => this.run(async () => ({ name: p.name, code: (await shareGuardApi.newCode(p.id)).data.data.code })),
			})
		},
		confirmDelete(p) {
			this.$buefy.dialog.confirm({
				title: this.$t('Delete {name}?', { name: p.name }),
				message: this.$t('Their code stops working at once.'),
				type: 'is-danger',
				hasIcon: true,
				confirmText: this.$t('Delete'),
				cancelText: this.$t('Cancel'),
				focusOn: 'cancel',
				onConfirm: () => this.run(async () => {
					await shareGuardApi.deletePerson(p.id)
					return null
				}),
			})
		},
	},
}
</script>

<style lang="scss" scoped>
.person {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0 0.25rem;
	overflow-wrap: anywhere;
}
</style>
