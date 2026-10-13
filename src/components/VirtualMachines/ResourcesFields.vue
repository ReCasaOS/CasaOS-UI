<template>
	<!-- CPU and memory side by side, memory in GB: the same fields on create
		and edit -->
	<div class="columns is-mobile mb-0 resources">
		<b-field :label="$t('CPU cores')" :message="errors.vcpus ? $t(errors.vcpus) : ''"
			:type="errors.vcpus ? 'is-danger' : ''" class="column">
			<b-numberinput :max="host.cpus || vcpus" :min="1" :model-value="vcpus" controls-position="compact" expanded
				size="is-small" @update:model-value="$emit('update:vcpus', $event)"></b-numberinput>
		</b-field>
		<b-field :label="$t('Memory (GB)')" :message="memoryMessage" :type="errors.memory_mib ? 'is-danger' : ''"
			class="column">
			<b-numberinput :max="gb(host.memory_mib)" :min="0.25" :model-value="gb(memoryMib)" :step="0.5"
				controls-position="compact" expanded min-step="0.01" size="is-small"
				@update:model-value="$emit('update:memoryMib', mib($event))"></b-numberinput>
		</b-field>
	</div>
</template>

<script>
import { formatNumber, gbToMib, mibToGB } from './vms'

export default {
	name: 'ResourcesFields',
	props: {
		vcpus: { type: Number, default: 1 },
		memoryMib: { type: Number, default: 1024 },
		host: { type: Object, required: true },
		// i18n keys by field, from validateCreate
		errors: { type: Object, default: () => ({}) },
	},
	emits: ['update:vcpus', 'update:memoryMib'],
	computed: {
		memoryMessage() {
			if (this.errors.memory_mib) {
				return this.$t(this.errors.memory_mib)
			}
			return this.$t('This machine has {gb} GB', { gb: formatNumber(mibToGB(this.host.memory_mib), this.$i18n.locale, 2, 0) })
		},
	},
	methods: {
		gb: mibToGB,
		mib: gbToMib,
	},
}
</script>

<style lang="scss" scoped>
// the columns' own margins would push the fields out of line with the rest
.resources {
	margin-left: -0.75rem;
	margin-right: -0.75rem;
}
</style>
