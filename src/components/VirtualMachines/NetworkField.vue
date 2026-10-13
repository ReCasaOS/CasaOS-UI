<template>
	<!-- where the VM's card goes and, on the CasaOS network, how it gets its
		address: the same fields on create and edit -->
	<div>
		<b-field :label="$t('Network')">
			<b-select :disabled="disabled" :model-value="modelValue" expanded size="is-small"
				@update:model-value="$emit('update:modelValue', $event)">
				<option v-for="option in choices" :key="option.value" :disabled="!option.value" :value="option.value">
					{{ option.label }}
				</option>
			</b-select>
		</b-field>
		<p class="is-size-7 has-text-full-03">
			{{ $t(networkHint(modelValue), { subnet: host.network_subnet || '', gateway: host.network_gateway || '' }) }}
		</p>

		<template v-if="modelValue === 'casaos'">
			<p class="label mt-4 mb-1">{{ $t('IP address') }}</p>
			<div class="is-flex is-align-items-center">
				<b-radio :disabled="disabled" :model-value="address.mode" native-value="fixed" size="is-small"
					@update:model-value="setMode">{{ $t('Fixed (.2-.99)') }}</b-radio>
				<b-radio :disabled="disabled" :model-value="address.mode" class="ml-4" native-value="dhcp" size="is-small"
					@update:model-value="setMode">{{ $t('DHCP (.100 and up)') }}</b-radio>
			</div>
			<b-field v-if="address.mode === 'fixed'" :message="error ? $t(error) : ''" :type="error ? 'is-danger' : ''"
				class="mt-2">
				<b-input :disabled="disabled" :model-value="address.ip" :placeholder="$t('any free address')" expanded
					size="is-small" @update:model-value="$emit('update:address', { ...address, ip: $event })"></b-input>
			</b-field>
			<p v-else class="is-size-7 has-text-full-03 mt-2">{{ $t('Port forwards need a fixed address.') }}</p>
		</template>
	</div>
</template>

<script>
import { networkHint, networkOptions, validateAddress } from './vms'

export default {
	name: 'NetworkField',
	props: {
		// a networkOptions value: casaos, bridge:<name>, macvtap:<name>
		modelValue: { type: String, default: 'casaos' },
		// { mode: fixed|dhcp, ip }
		address: { type: Object, default: () => ({ mode: 'fixed', ip: '' }) },
		host: { type: Object, required: true },
		// what the host offers is the default; the edit form adds the VM's own
		options: { type: Array, default: null },
		disabled: { type: Boolean, default: false },
	},
	emits: ['update:modelValue', 'update:address'],
	computed: {
		choices() {
			return this.options || networkOptions(this.host)
		},
		error() {
			return this.address.mode === 'fixed' ? validateAddress(this.address.ip, this.host) : ''
		},
	},
	methods: {
		networkHint,
		setMode(mode) {
			this.$emit('update:address', { ...this.address, mode })
		},
	},
}
</script>
