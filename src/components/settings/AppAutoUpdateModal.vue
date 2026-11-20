<template>
	<div class="modal-card app-auto-update touch-targets">
		<header class="modal-card-head">
			<h3 class="title is-header">
				{{ $t('Automatic app updates') }}
			</h3>
		</header>

		<section class="modal-card-body">
			<p class="settings-intro mb-3">
				{{ $t('Every night at three, the box updates the apps turned on here, one after another, when they have an update. An app that does not start again is put back on the version it ran, and you get an alert.') }}
			</p>

			<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">
				{{ error }}
			</b-message>

			<p v-if="isLoading && !view" class="is-size-7 _has-text-gray">
				{{ $t('Loading…') }}
			</p>

			<template v-if="view">
				<p v-if="view.next" class="is-size-7 mb-3" data-next>
					{{ $t('Next night: {date}', { date: whenOf(view.next) }) }}
				</p>

				<div class="settings-card" data-row="apps">
					<p v-if="!apps.length" class="is-size-7 _has-text-gray">
						{{ $t('No app can update by itself: apps built from a repository deploy by themselves already.') }}
					</p>
					<div v-for="app in apps" :key="app.name" class="app-auto-update__app is-flex is-align-items-center" :data-app="app.name">
						<img v-if="app.icon" :src="app.icon" alt="" class="app-auto-update__icon mr-2">
						<span class="is-flex-grow-1">{{ app.title }}</span>
						<b-switch :disabled="saving === app.name" :model-value="isOn(app.name)" size="is-small" @update:model-value="set(app.name, $event)">
							<span class="is-sr-only">{{ $t('Update {app} automatically', { app: app.title }) }}</span>
						</b-switch>
					</div>
				</div>

				<div class="settings-card is-size-7" data-row="runs">
					<div class="has-text-weight-semibold">
						{{ $t('Last nights') }}
					</div>
					<div v-if="!view.runs.length" class="_has-text-gray">
						{{ $t('No night has run yet.') }}
					</div>
					<div v-for="(run, index) in lastRuns" :key="index" class="mt-1" data-run>
						<div class="_has-text-gray">
							{{ whenOf(run.at) }}
						</div>
						<div v-for="entry in run.apps" :key="entry.id" :class="entry.state === 'failed' ? 'has-text-danger' : ''">
							{{ titleOf(entry.id) }} · {{ $t(stateOf(entry)) }}<template v-if="entry.state === 'failed' && entry.message"> — {{ entry.message }}</template>
						</div>
						<div v-if="!run.apps.length" class="_has-text-gray">
							{{ $t('Nothing to do.') }}
						</div>
					</div>
				</div>
			</template>
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button rounded @click="$emit('close')">
				{{ $t('Close') }}
			</b-button>
		</footer>
	</div>
</template>

<script>
import { ice_i18n } from '@/mixins/base/common-i18n'

// what became of an app, in the words of the "Update every app" window
const STATES = {
	updated: 'Updated',
	current: 'Up to date',
	failed: 'Failed, put back',
}

export default {
	name: 'AppAutoUpdateModal',
	emits: ['close'],
	data() {
		return {
			// GET /auto-update: { apps, next, runs }
			view: null,
			// the compose apps the night can update: not the ones built from a repository
			apps: [],
			isLoading: false,
			// the app whose switch is being saved
			saving: '',
			error: '',
		}
	},
	computed: {
		lastRuns() {
			return this.view.runs.slice(0, 5)
		},
	},
	mounted() {
		this.load()
	},
	methods: {
		whenOf(when) {
			return new Date(when).toLocaleString()
		},

		isOn(name) {
			return this.view.apps.includes(name)
		},

		titleOf(name) {
			const app = this.apps.find(candidate => candidate.name === name)
			return app ? app.title : name
		},

		stateOf(entry) {
			return STATES[entry.state] || entry.state
		},

		messageOf(error) {
			const data = error.response && error.response.data
			return (data && data.message) || error.message
		},

		async load() {
			this.isLoading = true
			this.error = ''
			try {
				const [view, grid] = await Promise.all([
					this.$api.updates.autoUpdate(),
					this.$openAPI.appGrid.getAppGrid(),
				])
				this.view = view.data.data
				this.apps = (grid.data.data || [])
					.filter(item => item.app_type === 'v2app' && !item.git)
					.map(item => ({ name: item.name, title: (item.title && ice_i18n(item.title)) || item.name, icon: item.icon || '' }))
					.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
			} catch (error) {
				this.error = this.messageOf(error)
			} finally {
				this.isLoading = false
			}
		},

		// The answer is the new view: the switch says what the box holds, not what was clicked.
		async set(name, on) {
			this.saving = name
			this.error = ''
			try {
				this.view = (await this.$api.updates.setAutoUpdate(name, on)).data.data
			} catch (error) {
				this.error = this.messageOf(error)
			} finally {
				this.saving = ''
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.app-auto-update {
  &__app {
    padding: 0.25rem 0;
  }

  &__icon {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 0.375rem;
  }
}
</style>
