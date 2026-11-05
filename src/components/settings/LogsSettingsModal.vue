<template>
	<div class="modal-card logs-settings-modal">
		<header class="modal-card-head">
			<h3 class="title is-header">
				{{ $t('Logs') }}
			</h3>
		</header>

		<section class="modal-card-body">
			<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">
				{{ error }}
			</b-message>

			<template v-if="view">
				<b-message v-if="capText" class="mb-3" size="is-small" type="is-warning">
					{{ capText }}
				</b-message>
				<b-field :label="$t('Retention (days)')">
					<b-numberinput v-model="draft.retention_days" :max="3650" :min="1" controls-position="compact" size="is-small" />
				</b-field>
				<b-field :label="$t('Size cap (MB)')">
					<b-numberinput v-model="draft.max_size_mb" :max="1048576" :min="64" :step="64" controls-position="compact" size="is-small" />
				</b-field>
				<b-field class="mb-1">
					<b-checkbox v-model="draft.include_others" size="is-small">
						{{ $t('Other containers') }}
					</b-checkbox>
				</b-field>
				<p class="is-size-7 _has-text-gray mb-3">
					{{ $t('Also follows containers started outside ReCasaOS; their logs are kept on /DATA and readable by the fleet\'s master') }}
				</p>
				<dl class="logs-facts is-size-7">
					<dt>{{ $t('Used (MB)') }}</dt>
					<dd>{{ view.used_mb }}</dd>
					<dt>{{ $t('Oldest line') }}</dt>
					<dd>{{ view.oldest_at ? new Date(view.oldest_at).toLocaleString() : '—' }}</dd>
					<dt>{{ $t('Path') }}</dt>
					<dd>{{ view.path }}</dd>
				</dl>
			</template>
			<b-loading :is-full-page="false" :model-value="!view && !error" />
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button :label="$t('Close')" class="mr-2" rounded @click="$emit('close')" />
			<b-button :disabled="!view || !valid" :label="$t('Save')" :loading="saving" rounded type="is-primary" @click="save" />
		</footer>
	</div>
</template>

<script>
import { logsApi } from '@/service/logs'

const DAY_MS = 86400000

// the server's bounds
const inRange = (v, min, max) => Number.isInteger(v) && v >= min && v <= max

export default {
	name: 'LogsSettingsModal',
	emits: ['close'],
	data() {
		return {
			// GET /logs/settings: { retention_days, max_size_mb, include_others, used_mb, oldest_at, path }
			view: null,
			draft: { retention_days: 7, max_size_mb: 2048, include_others: false },
			error: '',
			saving: false,
		}
	},
	computed: {
		valid() {
			return inRange(this.draft.retention_days, 1, 3650) && inRange(this.draft.max_size_mb, 64, 1048576)
		},
		capText() {
			const v = this.view
			if (!v?.oldest_at || !(v.used_mb >= v.max_size_mb)) {
				return ''
			}
			return this.$t('Logs go back {n} days, cap reached', { n: Math.max(1, Math.round((Date.now() - Date.parse(v.oldest_at)) / DAY_MS)) })
		},
	},
	async mounted() {
		const res = await logsApi.settings()
		if (!res.ok) {
			this.error = res.error
			return
		}
		this.view = res.data
		const { retention_days, max_size_mb, include_others } = res.data
		this.draft = { retention_days, max_size_mb, include_others: !!include_others }
	},
	methods: {
		async save() {
			this.saving = true
			const res = await logsApi.setSettings({ ...this.draft })
			this.saving = false
			if (!res.ok) {
				this.$buefy.toast.open({ message: res.error, type: 'is-danger' })
				return
			}
			this.$buefy.toast.open({ message: this.$t('Saved'), type: 'is-success' })
			this.$emit('close')
		},
	},
}
</script>

<style lang="scss" scoped>
.logs-facts {
	display: grid;
	grid-template-columns: max-content 1fr;
	gap: 0.25rem 0.75rem;

	dd {
		margin: 0;
		word-break: break-all;
	}
}
</style>
