<template>
	<div class="modal-card app-launch-modal">
		<header class="modal-card-head">
			<h3 class="title is-header">
				{{ $t('App launching') }}
			</h3>
		</header>

		<section class="modal-card-body">
			<b-field>
				<b-switch v-model="inIframe">
					{{ $t('Open apps inside CasaOS') }}
				</b-switch>
			</b-field>

			<p class="has-text-full-03 is-size-7 mb-4">
				{{ $t('When this is off, every app opens in a new browser tab.') }}
			</p>

			<template v-if="inIframe">
				<p class="is-size-7 mb-2">
					{{ $t('Always open these apps in a new tab:') }}
				</p>

				<!-- the dashboard's own apps first: they are always there -->
				<div v-for="app in builtins" :key="app.id" class="app-launch-modal__row">
					<b-checkbox :model-value="isExcepted(app.id)" @update:model-value="toggleException(app.id)">
						{{ app.title }}
					</b-checkbox>
				</div>

				<b-message v-if="loadError" size="is-small" type="is-warning">
					{{ loadError }}
				</b-message>

				<b-loading v-model="isLoading" :is-full-page="false" />

				<div v-if="!isLoading && !loadError && apps.length === 0" class="has-text-full-03 is-size-7">
					{{ $t('No app is installed yet.') }}
				</div>

				<div v-for="app in apps" :key="app.id" class="app-launch-modal__row">
					<b-checkbox :model-value="isExcepted(app.id)" @update:model-value="toggleException(app.id)">
						{{ app.title }}
					</b-checkbox>
				</div>
			</template>
		</section>

		<footer class="modal-card-foot is-flex is-align-items-center">
			<div class="is-flex-grow-1"></div>
			<div>
				<b-button :label="$t('Cancel')" rounded @click="$emit('close')" />
				<b-button :label="$t('Save')" rounded type="is-primary" @click="save" />
			</div>
		</footer>
	</div>
</template>

<script>
import { FILES_LAUNCH_ID } from '@/mixins/app/appLaunchPreference'

export default {
	name: 'AppLaunchModal',
	data() {
		return {
			inIframe: this.$store.state.appLaunchInIframe,
			exceptions: [...(this.$store.state.appLaunchExceptions || [])],
			apps: [],
			isLoading: true,
			loadError: '',
		}
	},
	computed: {
		builtins() {
			return [{ id: FILES_LAUNCH_ID, title: this.$t('Files') }]
		},
	},
	async mounted() {
		try {
			const response = await this.$openAPI.appManagement.compose.myComposeAppList()
			const list = (response && response.data && response.data.data) || {}

			// The endpoint returns a map keyed by app id. Fall back to the key when
			// an entry carries no readable title, so nothing shows up nameless.
			this.apps = Object.keys(list)
				.map(id => ({ id, title: this.titleOf(list[id]) || id }))
				.sort((a, b) => a.title.localeCompare(b.title))
		} catch {
			// The setting itself still works without the list; only the per-app
			// exceptions need it.
			this.loadError = this.$t('The list of installed apps could not be loaded.')
		} finally {
			this.isLoading = false
		}
	},
	methods: {
		titleOf(entry) {
			const title = entry && entry.store_info && entry.store_info.title
			if (!title) {
				return ''
			}

			return title[this.$i18n.locale] || title.en_us || Object.values(title)[0] || ''
		},

		isExcepted(id) {
			return this.exceptions.includes(id)
		},

		toggleException(id) {
			this.exceptions = this.isExcepted(id)
				? this.exceptions.filter(entry => entry !== id)
				: [...this.exceptions, id]
		},

		save() {
			this.$store.commit('SET_APP_LAUNCH_IN_IFRAME', this.inIframe)
			this.$store.commit('SET_APP_LAUNCH_EXCEPTIONS', this.exceptions)
			this.$emit('close')
		},
	},
}
</script>

<style lang="scss" scoped>
.app-launch-modal {
  &__row {
    padding: 0.25rem 0;
  }

  .modal-card-body {
    position: relative;
    min-height: 8rem;
  }
}
</style>
