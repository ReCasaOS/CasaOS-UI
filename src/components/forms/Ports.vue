<template>
	<div class="mb-5">
		<div class="field is-flex is-align-items-center mb-2">
			<label class="label mb-0 is-flex-grow-1">{{ $t('Ports') }}</label>
			<b-button icon-left="plus-outline" icon-pack="casa" rounded size="is-small" @click="addItem">{{ $t('Add') }}</b-button>
		</div>
		<div v-if="items.length == 0" class="is-flex is-align-items-center mb-5 info">
			<b-icon icon="warning-solid" size="is-small" pack="casa" class="mr-2 "></b-icon>
			<span>
				{{ $t('No ports now, click “+” to add one.') }}
			</span>

		</div>
		<div v-for="(item, index) in items" :key="`port${index}${item.protocol}`" class="port-item mr-4">
			<b-icon class="is-clickable" icon="close-outline" pack="casa" size="is-small" @click="removeItem(index)"></b-icon>
			<b-field grouped>
				<VeeField v-if="showHostPost" v-slot="{ errors, meta }"
					:model-value="item.host_ip ? `${item.host_ip}:${item.published}` : item.published" :name="`host-${index}`"
					:rules="`yaml_port|not_in_ports:${invalidPortsInUse(item.published, item.protocol)}`">
					<!-- Only show title when the first item. -->
					<b-field :label="index < 1 ? $t('Host') : ''" :message="errors"
						:type="{ 'is-danger': errors[0], 'is-success': meta.valid }" expanded>
						<b-input :placeholder="$t('Host')"
							:model-value="item.host_ip ? `${item.host_ip}:${item.published}` : item.published" expanded
							@blur="(event, val) => assignPortsItem(event.target.value, item)"></b-input>
					</b-field>
				</VeeField>

				<VeeField v-slot="{ errors, meta }" :model-value="item.target" :name="`container-${index}`" rules="yaml_port">
					<!-- Only show title when the first item. -->
					<b-field :label="index < 1 ? $t('Container') : ''" :message="errors"
						:type="{ 'is-danger': errors[0], 'is-success': meta.valid }" expanded>
						<b-input v-model.number="item.target" :placeholder="$t('Container')" expanded></b-input>
					</b-field>
				</VeeField>

				<!-- Only show title when the first item. -->
				<b-field :label="index < 1 ? $t('Protocol') : ''" expanded>
					<b-select v-model="item.protocol" :placeholder="$t('Protocol')" expanded>
						<option value="tcp">TCP</option>
						<option value="udp">UDP</option>
						<option value="">TCP + UDP</option>
					</b-select>
				</b-field>
			</b-field>
		</div>
	</div>
</template>

<script>
import { Field as VeeField } from 'vee-validate'

export default {
	name: 'ports-form',
	components: {
		VeeField,
	},
	data() {
		return {
			isLoading: false,
			min: 0,
		}
	},
	emits: ['update:modelValue'],
	props: {
		modelValue: Array,
		showHostPost: Boolean,
		ports_in_use: {
			default: () => {
				return { tcp: [], udp: [] }
			},
			type: Object,
		},
	},
	computed: {
		items() {
			this.modelValue.forEach((item) => {
				if (!item?.protocol) {
					console.log(item, 'item')
					item.protocol = ''
				}
			})
			return this.modelValue
		},
	},
	methods: {
		addItem() {
			const itemObj = {
				target: '',
				published: '',
				host_ip: '',
				protocol: 'tcp',
			}
			this.items.push(itemObj)
		},

		removeItem(index) {
			this.items.splice(index, 1)
		},

		assignPortsItem(val, item) {
			const reg = /((^(\d{1,3}\.){3}\d{1,3}):)?(\d{1,5}$)/
			const partList = val.match(reg)
			console.log(partList?.[2], partList?.[4], val, '------')
			item.host_ip = partList?.[2] || ''
			item.published = partList?.[4] || val
		},

		/*
		* type : tcp/udp
		* */
		invalidPortsInUse(port, type) {
			// The host's port input is String Type.
			// port = port - 0;
			if (type === 'both') {
				return (this.ports_in_use?.udp || []).includes(port) || (this.ports_in_use?.tcp || []).includes(port)
			}
			if (type) {
				return (this.ports_in_use?.[type] || this.ports_in_use?.[type.toUpperCase()] || []).includes(`${port}`)
			}
			return false
		},
	},
}
</script>

<style lang="scss">
.info {
	font-size: 0.875rem;
	color: var(--casa-text-hint);
}

.port-item {
	position: relative;

	.icon {
		position: absolute;
		right: -1.25rem;
		bottom: 0.825rem;
	}

	&:not(:last-child) {
		margin-bottom: 0.5rem;
	}

	.field.is-expanded {
		.label {
			text-align: center;
			font-weight: normal;
		}
	}
}
</style>
