<template>
	<div class="modal-card update-all">
		<header class="modal-card-head">
			<h3 class="title is-header">{{ $t('App updates') }}</h3>
		</header>

		<section class="modal-card-body">
			<b-message v-if="error" class="mb-2" size="is-small" type="is-danger">
				{{ error }}
				<p v-if="detail" class="is-size-7">{{ detail }}</p>
			</b-message>

			<p v-if="isPlanning" class="_has-text-gray is-size-7">
				<b-icon custom-class="mdi-spin" icon="loading" size="is-small"></b-icon>
				{{ $t('Asking every image’s registry what its tag points at now…') }}
			</p>

			<!-- the run: what became of each app, as it goes -->
			<template v-else-if="run">
				<p class="is-size-7 _has-text-gray mb-3">{{ $t(summary.message, summary.params) }}</p>
				<div v-for="app in run.apps" :key="app.id" class="is-flex is-align-items-flex-start mb-2">
					<b-icon :class="stateClass(app.state)" :custom-class="app.state === 'updating' ? 'mdi-spin' : ''" :icon="stateIcon(app.state)" class="mr-2 mt-1" size="is-small"></b-icon>
					<div class="is-flex-grow-1">
						<p class="is-size-7">
							<span class="has-text-weight-bold">{{ titleOf(app.id) }}</span>
							<span class="_has-text-gray"> · {{ $t(stateLabels[app.state] || app.state) }}</span>
						</p>
						<p v-if="app.message" class="is-size-7 _has-text-gray">{{ app.message }}</p>
					</div>
				</div>
			</template>

			<!-- the plan: what an update would do, to confirm as a list and not a word -->
			<template v-else>
				<p v-if="!plan.length && !error" class="_has-text-gray is-size-7">
					{{ $t('Every app is current, as far as the catalogue and the registries say.') }}
				</p>
				<template v-else-if="plan.length">
					<p class="is-size-7 _has-text-gray mb-3">
						{{ $t('Each app is pulled and restarted with what is listed, one after another, on this box: closing this page does not stop it.') }}
					</p>
					<div v-for="app in plan" :key="app.id" class="is-flex is-align-items-flex-start mb-3">
						<b-checkbox v-model="selected" :native-value="app.id" class="mr-1 mt-1" size="is-small"></b-checkbox>
						<img :src="app.icon || defaultIcon" alt="" class="app-icon mr-2" />
						<div class="is-flex-grow-1">
							<p class="is-size-7 has-text-weight-bold">{{ app.title }}</p>
							<p v-for="service in app.services" :key="service.name" class="is-size-7 _has-text-gray service-line">
								{{ $t(describe(app, service).message, describe(app, service).params) }}
							</p>
						</div>
					</div>
				</template>
			</template>
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button rounded @click="$emit('close')">{{ run || !plan.length ? $t('Close') : $t('Cancel') }}</b-button>
			<b-button v-if="!run && plan.length" :disabled="!selected.length || busy" :loading="busy" rounded type="is-primary" @click="start">
				{{ confirmLabel }}
			</b-button>
		</footer>
	</div>
</template>

<script>
import { STATE_LABELS, describeService, runSummary } from './updateAll'
import events from '@/events/events'

// Every app at once, planned first. The menu item is the first click; this list,
// image by image, is the second: a person confirms what will change, not a word.
// The run is the box's own, so closing this dialog changes nothing; reopened, it
// finds the run where it is.
export default {
	name: 'update-all-modal',
	emits: ['close'],
	data() {
		return {
			plan: [],
			selected: [],
			run: null,
			isPlanning: false,
			busy: false,
			error: '',
			detail: '',
			timer: null,
			defaultIcon: require('@/assets/img/app/default.svg'),
			stateLabels: STATE_LABELS,
		}
	},
	computed: {
		summary() {
			return runSummary(this.run)
		},
		confirmLabel() {
			return this.selected.length === 1
				? this.$t('Update one app')
				: this.$t('Update {n} apps', { n: this.selected.length })
		},
	},
	mounted() {
		this.load()
	},
	beforeUnmount() {
		clearTimeout(this.timer)
	},
	methods: {
		// A run in progress is shown as it is; otherwise the plan, freshly checked.
		async load() {
			try {
				const res = await this.$api.updates.run()
				const run = res.data.data
				if (run && !run.finished_at) {
					this.run = run
					this.poll()
					return
				}
			} catch {
				// none since the service started, which is the usual case
			}

			this.isPlanning = true
			try {
				const res = await this.$api.updates.plan()
				this.plan = (res.data.data && res.data.data.apps) || []
				this.selected = this.plan.map(app => app.id)
			} catch (error) {
				this.fail('Could not load what an update would do.', error)
			} finally {
				this.isPlanning = false
			}
		},

		async start() {
			this.busy = true
			try {
				const res = await this.$api.updates.start(this.selected)
				this.run = res.data.data
				this.poll()
			} catch (error) {
				this.fail('The update could not be started.', error)
			} finally {
				this.busy = false
			}
		},

		poll() {
			clearTimeout(this.timer)
			this.timer = setTimeout(async () => {
				try {
					const res = await this.$api.updates.run()
					this.run = res.data.data
				} catch (error) {
					this.fail('The progress of the update could not be loaded.', error)
				}
				if (this.run && this.run.finished_at) {
					this.$EventBus.$emit(events.RELOAD_APP_LIST)
					return
				}
				this.poll()
			}, 2000)
		},

		describe(app, service) {
			return describeService(app, service)
		},

		titleOf(id) {
			const known = this.plan.find(app => app.id === id)

			return known ? known.title : id
		},

		stateIcon(state) {
			return { queued: 'clock-outline', updating: 'loading', updated: 'check', current: 'check', failed: 'alert-circle-outline' }[state] || 'help-circle-outline'
		},

		stateClass(state) {
			return { updated: 'has-text-success-on-scheme', current: '_has-text-gray', failed: 'has-text-danger-on-scheme' }[state] || '_has-text-gray'
		},

		// A translated sentence says what failed; what the box answered goes under it.
		fail(message, error) {
			this.error = this.$t(message)
			this.detail = this.messageOf(error)
		},

		messageOf(error) {
			const data = error && error.response && error.response.data

			return (data && data.message) || (error && error.message) || String(error)
		},
	},
}
</script>

<style lang="scss" scoped>
.modal-card {
	max-width: 34rem;
}

.app-icon {
	width: 2rem;
	height: 2rem;
	border-radius: 0.5rem;
	flex: none;
}

.service-line {
	word-break: break-all;
}
</style>
