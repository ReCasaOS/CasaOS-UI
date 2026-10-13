<template>
	<!-- what the VM runs, for its icon: the same field on create and edit -->
	<b-field :label="$t('Operating system')">
		<p class="control os-field-icon"><os-icon :os="modelValue" /></p>
		<b-select :model-value="modelValue" expanded size="is-small" @update:model-value="$emit('update:modelValue', $event)">
			<option v-for="o in osList" :key="o.value" :value="o.value">{{ $t(o.label) }}</option>
		</b-select>
	</b-field>
</template>

<script>
import OsIcon from './OsIcon.vue'
import { OS_LIST } from './vms'

export default {
	name: 'OsField',
	components: { OsIcon },
	props: {
		modelValue: { type: String, default: '' },
	},
	emits: ['update:modelValue'],
	data() {
		return { osList: OS_LIST }
	},
}
</script>

<style lang="scss" scoped>
.os-field-icon {
	margin-right: 0.5rem;
}
</style>
