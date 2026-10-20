<template>
	<div class="stats-dialog-backdrop">
		<div ref="box"
			:aria-labelledby="titleId"
			aria-modal="true"
			class="stats-dialog"
			role="dialog"
			tabindex="-1">
			<h4 :id="titleId" ref="title" class="stats-dialog-title" tabindex="-1">
				{{ $t('Alert settings') }}<span class="stats-dialog-item"> · {{ itemName }}</span>
			</h4>

			<p v-if="itemGone" class="stats-dialog-error" role="status">{{ $t('This item is gone') }}</p>
			<p v-if="state === 'loading'" class="stats-dialog-line">{{ $t('Loading...') }}</p>
			<div v-else-if="state === 'error'" class="stats-dialog-error" role="status">
				<span>{{ $t('The settings could not be read.') }}</span>
				<button class="button is-small is-rounded" type="button" @click="load">{{ $t('Retry') }}</button>
			</div>

			<form v-if="state === 'ok'" @submit.prevent="save">
				<fieldset v-for="(rule, i) in rules" :key="i" class="stats-rule">
					<legend>{{ ruleName(rule) }}</legend>
					<label class="stats-rule-enabled">
						<input v-model="rule.enabled" data-field="enabled" type="checkbox">
						{{ $t('Enabled') }}
					</label>
					<div class="stats-rule-fields">
						<label>
							{{ $t('Threshold (%)') }}
							<input :aria-describedby="invalid(i, 'threshold') ? `${titleId}-t${i}` : null"
								:aria-invalid="invalid(i, 'threshold') ? 'true' : null"
								:value="rule.threshold"
								data-field="threshold"
								max="100"
								min="1"
								step="1"
								type="number"
								@input="edit(i, 'threshold', $event)">
						</label>
						<label>
							{{ $t('Duration (minutes)') }}
							<input :aria-describedby="invalid(i, 'minutes') ? `${titleId}-m${i}` : null"
								:aria-invalid="invalid(i, 'minutes') ? 'true' : null"
								:value="rule.minutes"
								data-field="minutes"
								max="120"
								min="1"
								step="1"
								type="number"
								@input="edit(i, 'minutes', $event)">
						</label>
					</div>
					<p v-if="invalid(i, 'threshold')" :id="`${titleId}-t${i}`" class="stats-rule-bound">{{ $t('From {min} to {max}', { min: 1, max: 100 }) }}</p>
					<p v-if="invalid(i, 'minutes')" :id="`${titleId}-m${i}`" class="stats-rule-bound">{{ $t('From {min} to {max}', { min: 1, max: 120 }) }}</p>
				</fieldset>

				<p v-if="problem" class="stats-dialog-error" role="alert">{{ $t(problem) }}</p>
			</form>

			<div class="stats-dialog-actions">
				<button :disabled="saving" class="button is-small is-rounded" type="button" @click="$emit('close')">{{ $t('Cancel') }}</button>
				<button :disabled="state !== 'ok' || saving || !allValid || itemGone" class="button is-small is-rounded is-primary" type="button" @click="save">{{ $t('Save') }}</button>
			</div>
		</div>
	</div>
</template>

<script>
import { clean } from '@/components/settings/osPlan'
import { statsApi } from '@/service/stats'

const BOUNDS = { threshold: [1, 100], minutes: [1, 120] }
const TABBABLE = 'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"])'
const BAD_RULES = /^bad_rules: rules\[(\d+)\]\.(key|threshold|minutes)$/
const RULE_NAMES = { cpu_high: 'Processor', mem_high: 'Memory' }

let opened = 0

function inBounds(value, field) {
	const [min, max] = BOUNDS[field]
	return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

// What the service says about one rule, as the four fields the page edits
function toRule(raw) {
	return {
		// the key goes back to the service as it came; only its label is cleaned
		key: typeof raw?.key === 'string' ? raw.key : '',
		name: clean(raw?.key, 60),
		enabled: raw?.enabled === true,
		threshold: typeof raw?.threshold === 'number' ? raw.threshold : '',
		minutes: typeof raw?.minutes === 'number' ? raw.minutes : '',
	}
}

export default {
	name: 'AlertSettingsDialog',
	props: {
		source: { type: String, required: true },
		itemId: { type: String, required: true },
		itemName: { type: String, default: '' },
		// the item left the list while the dialog was open: nothing more is saved for it
		itemGone: { type: Boolean, default: false },
	},
	emits: ['close', 'saved'],
	data() {
		return {
			titleId: `stats-dialog-title-${++opened}`,
			state: 'loading',
			rules: [],
			saving: false,
			// the sentence for a refusal, or '' (a language key)
			problem: '',
			// the field of the service's refusal: { row, field }
			refused: null,
		}
	},
	computed: {
		allValid() {
			return this.rules.every(rule => inBounds(rule.threshold, 'threshold') && inBounds(rule.minutes, 'minutes'))
		},
	},
	watch: {
		// whatever is edited, the last refusal is no longer about what is there
		rules: {
			deep: true,
			handler() {
				this.problem = ''
			},
		},
	},
	mounted() {
		window.addEventListener('keyup', this.onEscape, true)
		window.addEventListener('keydown', this.onTab, true)
		this.load()
		this.$refs.title.focus({ preventScroll: true })
	},
	beforeUnmount() {
		window.removeEventListener('keyup', this.onEscape, true)
		window.removeEventListener('keydown', this.onTab, true)
		this.gone = true
	},
	methods: {
		ruleName(rule) {
			return Object.prototype.hasOwnProperty.call(RULE_NAMES, rule.key) ? this.$t(RULE_NAMES[rule.key]) : this.$t('Rule {key}', { key: rule.name })
		},
		invalid(row, field) {
			const rule = this.rules[row]
			return !inBounds(rule[field], field) || (this.refused?.row === row && this.refused.field === field)
		},
		edit(row, field, event) {
			const text = event.target.value
			this.rules[row][field] = text === '' ? '' : Number(text)
			if (this.refused?.row === row && this.refused.field === field) {
				this.refused = null
			}
		},
		async load() {
			const ticket = this.ticket = (this.ticket || 0) + 1
			this.state = 'loading'
			try {
				const raw = await statsApi.alerts(this.source, this.itemId)
				if (ticket !== this.ticket || this.gone) {
					return
				}
				if (!raw || !Array.isArray(raw.rules)) {
					throw new Error('not rules')
				}
				this.rules = raw.rules.slice(0, 50).map(toRule)
				this.state = 'ok'
			} catch {
				if (ticket === this.ticket && !this.gone) {
					this.state = 'error'
				}
			}
		},
		async save() {
			if (this.saving || this.state !== 'ok' || !this.allValid || this.itemGone) {
				return
			}
			this.saving = true
			this.problem = ''
			this.refused = null
			try {
				const returned = await statsApi.setAlerts(this.source, this.itemId, this.rules.map(r => ({ key: r.key, enabled: r.enabled, threshold: r.threshold, minutes: r.minutes })))
				if (this.gone) {
					return
				}
				this.saving = false
				this.$emit('saved', returned)
				this.$emit('close')
			} catch (e) {
				this.saving = false
				if (this.gone) {
					return
				}
				if (e?.response?.status === 400) {
					this.problem = 'These values were refused.'
					this.markRefused(e.response.data?.message)
				} else if (e?.response?.status === 503) {
					// the contract: applied in memory, but the state file could not be written
					this.problem = 'The settings are applied but could not be kept for good.'
					if (Array.isArray(e.response.data?.active)) {
						this.$emit('saved', e.response.data)
					}
				} else {
					this.problem = 'The settings could not be saved. Try again.'
				}
			}
		},
		// The row and field the service names, when it names one this dialog has. Its text is never shown.
		markRefused(message) {
			const found = typeof message === 'string' ? BAD_RULES.exec(message) : null
			const row = found ? Number(found[1]) : -1
			if (!found || !this.rules[row] || !BOUNDS[found[2]]) {
				return
			}
			this.refused = { row, field: found[2] }
			this.$nextTick(() => this.$refs.box.querySelectorAll('.stats-rule')[row]?.querySelector(`[data-field="${found[2]}"]`)?.focus({ preventScroll: true }))
		},

		// Escape closes this dialog and nothing under it: the page closes at the same key.
		onEscape(event) {
			if (event.key !== 'Escape' && event.key !== 'Esc') {
				return
			}
			event.stopPropagation()
			if (!this.saving) {
				this.$emit('close')
			}
		},
		// Tab goes round inside the dialog; the window under it does not hear it.
		onTab(event) {
			if (event.key !== 'Tab') {
				return
			}
			event.stopPropagation()
			const ring = Array.from(this.$refs.box.querySelectorAll(TABBABLE))
			if (!ring.length) {
				event.preventDefault()
				return
			}
			const edge = ring[event.shiftKey ? 0 : ring.length - 1]
			if (ring.includes(event.target) && event.target !== edge) {
				return
			}
			event.preventDefault()
			ring[event.shiftKey ? ring.length - 1 : 0].focus({ preventScroll: true })
		},
	},
}
</script>

<style lang="scss" scoped>
.stats-dialog-backdrop {
	position: absolute;
	inset: 0;
	z-index: 10;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 1rem;
	background: rgba(0, 0, 0, 0.35);
}

.stats-dialog {
	width: 100%;
	max-width: 28rem;
	max-height: 100%;
	overflow-y: auto;
	padding: 1rem;
	border-radius: 0.75rem;
	border: 1px solid var(--casa-border);
	background: var(--casa-surface, #fff);

	&:focus {
		outline: none;
	}
}

.stats-dialog-title {
	margin-bottom: 0.75rem;
	font-size: 1rem;
	font-weight: 600;
	color: var(--casa-text-strong);
	overflow-wrap: anywhere;

	&:focus {
		outline: none;
	}
}

.stats-dialog-item {
	font-weight: 400;
	color: var(--casa-text-hint);
}

.stats-dialog-line,
.stats-dialog-error,
.stats-rule-bound {
	margin: 0.25rem 0;
	font-size: 0.8125rem;
	color: var(--casa-text-hint);
}

.stats-rule {
	margin-bottom: 0.75rem;
	padding: 0.5rem 0.75rem;
	border-radius: 0.5rem;
	border: 1px solid var(--casa-border);

	legend {
		padding: 0 0.25rem;
		font-size: 0.8125rem;
		font-weight: 600;
	}
}

.stats-rule-fields {
	display: flex;
	flex-wrap: wrap;
	gap: 0.75rem;
	margin-top: 0.5rem;

	label {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		font-size: 0.75rem;
	}

	input {
		width: 7rem;
		padding: 0.25rem 0.5rem;
		border-radius: 0.375rem;
		border: 1px solid var(--casa-border);

		&[aria-invalid='true'] {
			border-color: #e5484d;
		}
	}
}

.stats-dialog-actions {
	display: flex;
	justify-content: flex-end;
	gap: 0.5rem;
	margin-top: 0.75rem;
}
</style>
