<template>
	<div v-bind="status ? { 'data-status': '' } : { 'data-row': '' }" class="settings-card api-widget-row mb-2">
		<!-- what a recipe says is text, in fields: never markup -->
		<div class="is-flex is-flex-wrap-wrap is-gap-1 is-align-items-flex-end">
			<b-field v-if="shown.list" :label="$t('List (pointer to an array)')" class="row-field">
				<b-input v-model="shown.each" :aria-label="$t('List (pointer to an array)')" data-row-each size="is-small" />
			</b-field>
			<b-field v-if="!status" :label="shown.list ? $t('Label of each row (pointer inside an item)') : $t('Label')" class="row-field">
				<b-input v-model="shown.label" :aria-label="shown.list ? $t('Label of each row (pointer inside an item)') : $t('Label')" :maxlength="shown.list ? undefined : MAX_TEXT"
					:has-counter="false" data-row-label size="is-small" />
			</b-field>
			<b-field :label="shown.list ? $t('Value of each row (pointer inside an item)') : $t('Value (pointer in the answer)')" class="row-field">
				<b-input v-model="shown.value" :aria-label="shown.list ? $t('Value of each row (pointer inside an item)') : $t('Value (pointer in the answer)')" data-row-value size="is-small" />
			</b-field>
			<b-field :label="$t('Format')">
				<b-select v-model="shown.format" :aria-label="$t('Format')" data-row-format size="is-small">
					<option v-for="format in FORMATS" :key="format" :value="format">
						{{ $t(FORMAT_LABELS[format]) }}
					</option>
				</b-select>
			</b-field>
			<!-- the dashboard writes a unit after a text and a number only -->
			<b-field v-if="hasUnit" :label="$t('Unit')" class="row-small">
				<b-input v-model="shown.unit" :aria-label="$t('Unit')" :has-counter="false" data-row-unit maxlength="12" size="is-small" />
			</b-field>
			<b-field v-if="shown.list" :label="$t('Rows at most')" class="row-small">
				<b-input v-model.number="shown.limit" :aria-label="$t('Rows at most')" :max="MAX_LIMIT" data-row-limit min="1" size="is-small" type="number" />
			</b-field>
			<b-switch v-if="!status && hasBar" v-model="shown.bar" data-row-bar size="is-small">
				{{ $t('Bar') }}
			</b-switch>
			<b-button v-if="!status" :aria-label="$t('Remove the row {name}', { name: shown.label })" class="ml-auto" data-row-remove rounded size="is-small" type="is-danger" @click="$emit('remove')">
				{{ $t('Remove') }}
			</b-button>
		</div>

		<div v-for="(rule, index) in shown.rules" :key="index" class="is-flex is-flex-wrap-wrap is-gap-1 is-align-items-center mt-2" data-rule>
			<span class="is-size-7">{{ $t('When the value') }}</span>
			<b-select v-model="rule.op" :aria-label="$t('Comparison')" data-rule-op size="is-small">
				<option v-for="op in OPS" :key="op" :value="op">
					{{ $t(OP_LABELS[op]) }}
				</option>
			</b-select>
			<!-- shown as it was read; read again only when it is typed -->
			<b-input :aria-label="$t('Compared to')" :model-value="String(rule.to ?? '')" class="row-small" data-rule-to size="is-small" @update:model-value="rule.to = ruleTo($event)" />
			<b-select v-model="rule.level" :aria-label="$t('Level')" data-rule-level size="is-small">
				<option v-for="level in LEVELS" :key="level" :value="level">
					{{ $t(LEVEL_LABELS[level]) }}
				</option>
			</b-select>
			<b-input v-model="rule.text" :aria-label="$t('Text shown instead (optional)')" :has-counter="false" :maxlength="MAX_TEXT" :placeholder="$t('Text shown instead (optional)')" class="row-field"
				data-rule-text size="is-small" />
			<b-button :aria-label="$t('Remove this rule')" data-rule-remove rounded size="is-small" @click="shown.rules.splice(index, 1)">
				{{ $t('Remove') }}
			</b-button>
		</div>
		<b-button :disabled="shown.rules.length >= MAX_RULES" class="mt-2" data-rule-add rounded size="is-small" @click="addRule">
			{{ $t('Add a colour rule') }}
		</b-button>
	</div>
</template>

<script>
import { FORMATS, FORMAT_LABELS, LEVELS, LEVEL_LABELS, MAX_LIMIT, MAX_RULES, MAX_TEXT, OPS, OP_LABELS, ruleTo } from './recipe'

/**
 * The settings of one row of an API widget, or of its status chip (`status`: no label, no list, no bar). `row` is the form's own object
 * (recipe.js formOf), edited in place: the editor watches its form.
 */
export default {
	name: 'ApiWidgetRow',
	props: {
		row: { type: Object, required: true },
		status: { type: Boolean, default: false },
	},
	emits: ['remove'],
	data() {
		return { FORMATS, FORMAT_LABELS, OPS, OP_LABELS, LEVELS, LEVEL_LABELS, MAX_LIMIT, MAX_RULES, MAX_TEXT }
	},
	computed: {
		// the same object as the prop, whichever row the list hands to this instance
		shown() {
			return this.row
		},
		hasUnit() {
			return ['text', 'number'].includes(this.shown.format)
		},
		hasBar() {
			return ['percent', 'ratio'].includes(this.shown.format)
		},
	},
	methods: {
		ruleTo,
		addRule() {
			this.shown.rules.push({ op: 'eq', to: '', level: 'ok', text: '' })
		},
	},
}
</script>

<style lang="scss" scoped>
.api-widget-row {
	.row-field {
		flex: 1 1 10rem;
		min-width: 0;
		margin-bottom: 0;
	}

	.row-small {
		flex: 0 1 6rem;
		margin-bottom: 0;
	}

	:deep(.field) {
		margin-bottom: 0;
	}
}
</style>
