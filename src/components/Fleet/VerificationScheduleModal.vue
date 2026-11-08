<template>
	<div class="modal-card verification-schedule-modal touch-targets" @keydown.esc.stop="$emit('close')">
		<header class="modal-card-head">
			<h3 class="title is-header">
				{{ $t('Verification schedule') }}
			</h3>
		</header>

		<section class="modal-card-body" @keydown.enter="onEnter">
			<b-field class="mb-3">
				<b-switch v-model="draft.enabled" size="is-small">
					{{ $t(draft.enabled ? 'Enabled' : 'Disabled') }}
				</b-switch>
			</b-field>

			<div class="is-flex is-flex-wrap-wrap is-align-items-center is-gap-1 mb-3">
				<label for="verification-every">{{ $t('Every') }}</label>
				<b-input id="verification-every"
					:model-value="draft.every_days"
					max="30"
					min="1"
					size="is-small"
					type="number"
					@update:model-value="draft.every_days = Number($event)" />
				<span>{{ $t('days') }}</span>
				<label class="ml-3" for="verification-at">{{ $t('Time') }}</label>
				<b-input id="verification-at" v-model="draft.at" size="is-small" type="time" />
			</div>

			<b-message class="mb-3" size="is-small" type="is-warning">
				{{ $t('A verification re-reads data from the destination: it uses bandwidth and quota.') }}
			</b-message>
			<p class="is-size-7 _has-text-gray mb-3">
				{{ $t('A restic destination is checked every week by itself: this schedule leaves it out.') }}
			</p>

			<h4 class="has-text-weight-bold mb-2">
				{{ $t('Boxes') }}
			</h4>
			<ul>
				<li v-for="row in rows" :key="row.key" class="verification-result is-flex is-flex-wrap-wrap is-gap-1">
					<span class="has-text-weight-medium">{{ row.name }}</span>
					<result-cell :result="results[row.key] || null" />
				</li>
			</ul>
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button :label="$t('Close')" class="mr-2" rounded @click="$emit('close')" />
			<b-button :disabled="!valid || saving" :label="$t('Apply')" :loading="saving" rounded type="is-primary" @click="apply" />
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
	},
	emits: ['close'],
	data() {
		const { enabled, every_days, at } = this.current ?? {}
		return {
			draft: { enabled: enabled === true, every_days: every_days ?? 7, at: at ?? '03:00' },
			// box key → { state, message }
			results: {},
			saving: false,
		}
	},
	computed: {
		// the box's bounds: 1 to 30 days, HH:MM
		valid() {
			const { every_days, at } = this.draft
			return Number.isInteger(every_days) && every_days >= 1 && every_days <= 30 && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(at)
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
			const done = await runBulk(this.rows, row => actions.box.setVerificationSchedule(row, this.draft))
			this.results = Object.fromEntries(done)
			this.saving = false
			this.afterApply?.()
		},
	},
}
</script>
