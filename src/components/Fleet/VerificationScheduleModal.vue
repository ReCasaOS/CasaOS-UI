<template>
	<div class="modal-card verification-schedule-modal touch-targets" @keydown.esc.stop="$emit('close')">
		<header class="modal-card-head">
			<h3 class="title is-header">
				{{ $t('Verification schedule') }}
			</h3>
		</header>

		<section class="modal-card-body" @keydown.enter="onEnter">
			<b-message v-if="differ" class="mb-3" size="is-small" type="is-info">
				{{ $t('The selected boxes have different schedules; applying will replace them all.') }}
			</b-message>

			<b-field class="mb-3">
				<b-switch v-model="draft.enabled" size="is-small">
					{{ $t('Verify on a schedule') }}
				</b-switch>
			</b-field>

			<div class="is-flex is-flex-wrap-wrap is-align-items-center is-gap-1 mb-3">
				<label for="verification-every">{{ $t('Interval (days)') }}</label>
				<b-input id="verification-every"
					v-model="everyText"
					:aria-describedby="error ? 'verification-error' : null"
					:aria-invalid="error ? 'true' : null"
					max="30"
					min="1"
					size="is-small"
					type="number" />
				<label class="ml-3" for="verification-at">{{ $t('Time') }}</label>
				<b-input id="verification-at" v-model="draft.at" size="is-small" type="time" />
			</div>
			<p v-if="error" id="verification-error" class="help is-danger mb-3" role="alert">{{ error }}</p>
			<p v-else class="is-size-7 mb-3">{{ everyWords }}</p>
			<p class="is-size-7 mb-3">{{ $t('The time is the local time of each box.') }}</p>

			<b-message class="mb-3" size="is-small" type="is-warning">
				{{ $t('A verification re-reads data from the destination: it uses bandwidth and quota.') }}
			</b-message>
			<p class="is-size-7 _has-text-gray mb-3">
				{{ $t('A restic destination is checked every week by itself: this schedule leaves it out.') }}
			</p>

			<h4 class="has-text-weight-bold mb-2">
				{{ $t('Boxes') }}
			</h4>
			<ul class="verification-results">
				<li v-for="row in rows" :key="row.key" class="verification-result is-flex is-flex-wrap-wrap is-gap-1">
					<span class="has-text-weight-medium">{{ row.name }}</span>
					<result-cell :result="results[row.key] || null" />
				</li>
			</ul>
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button :label="$t('Close')" class="mr-2" rounded @click="$emit('close')" />
			<b-button :aria-describedby="error ? 'verification-error' : null" :disabled="!valid || saving" :label="$t('Apply')" :loading="saving" rounded type="is-primary" @click="apply" />
		</footer>
	</div>
</template>

<script>
import ResultCell from './ResultCell.vue'
import { actions, runBulk } from './bulk'

export default {
	name: 'VerificationScheduleModal',
	components: { ResultCell },
	props: {
		// the boxes to set: { key, id, name }
		rows: { type: Array, required: true },
		// a schedule a box already carries ({ enabled, every_days, at }): where the fields start
		current: { type: Object, default: null },
		// called once the boxes have answered, to read the fleet again
		afterApply: { type: Function, default: null },
		// the boxes carried different schedules: the fields start from the defaults
		differ: { type: Boolean, default: false },
	},
	emits: ['close'],
	data() {
		const { enabled, every_days, at } = this.current ?? {}
		return {
			draft: { enabled: enabled === true, at: at ?? '03:00' },
			// what was typed: an empty or half-typed field stays as it is, and is told
			everyText: String(every_days ?? 7),
			// box key → { state, message }
			results: {},
			saving: false,
		}
	},
	computed: {
		// the box's bounds: a whole number from 1 to 30 days, HH:MM
		days() {
			const text = String(this.everyText).trim()
			const n = /^\d+$/.test(text) ? Number(text) : Number.NaN
			return n >= 1 && n <= 30 ? n : null
		},
		error() {
			if (this.days === null) {
				return this.$t('Enter a whole number of days from 1 to 30')
			}
			return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(this.draft.at) ? '' : this.$t('Enter a time as HH:MM')
		},
		valid() {
			return !this.error
		},
		everyWords() {
			return this.days === 1 ? this.$t('Every day') : this.$t('Every {n} days', { n: this.days })
		},
	},
	methods: {
		// Enter in a field applies; on the switch it stays the switch's
		onEnter(e) {
			if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {
				this.apply()
			}
		},
		async apply() {
			if (!this.valid || this.saving) {
				return
			}
			this.saving = true
			this.results = Object.fromEntries(this.rows.map(r => [r.key, { state: 'running', message: '' }]))
			const done = await runBulk(this.rows, row => actions.box.setVerificationSchedule(row, { ...this.draft, every_days: this.days }))
			this.results = Object.fromEntries(done)
			this.saving = false
			this.afterApply?.()
		},
	},
}
</script>

<style lang="scss" scoped>
// a refusal names an app and a reason: let it wrap
.verification-result :deep(.fleet-result) {
	white-space: normal;
}
</style>
