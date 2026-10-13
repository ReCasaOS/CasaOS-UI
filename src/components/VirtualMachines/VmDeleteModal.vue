<template>
	<div class="modal-card vm-delete">
		<header class="modal-card-head b-line">
			<h3 class="title is-5 has-text-black">{{ $t('Delete {name}?', { name: vm.title }) }}</h3>
		</header>

		<section class="modal-card-body">
			<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">{{ error }}</b-message>

			<p v-if="running" class="mb-3">{{ $t('The virtual machine is running: it will be switched off first, without shutting down its system.') }}</p>

			<template v-if="managedDisks.length">
				<b-checkbox v-model="deleteDisks" size="is-small">{{ $t('Also delete its disk') }}</b-checkbox>
				<ul class="is-size-7 has-text-full-03 mt-1 ml-5">
					<li v-for="disk in managedDisks" :key="disk.path">{{ disk.path }}</li>
				</ul>
				<p class="is-size-7 mt-2">
					{{ deleteDisks
						? $t('The disk and everything on it are deleted. This cannot be undone.')
						: $t('The disk stays in place: you can keep it or delete it later with Files.') }}
				</p>
			</template>
			<p v-else-if="(vm.disks || []).length" class="is-size-7 has-text-full-03">
				{{ $t('Its disks were not created by CasaOS and are left in place.') }}
			</p>
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button class="mr-2" rounded @click="$emit('close')">{{ $t('Cancel') }}</b-button>
			<b-button :loading="busy" rounded type="is-danger" @click="remove">{{ $t('Delete') }}</b-button>
		</footer>
	</div>
</template>

<script>
import vmApi from './api'

export default {
	name: 'VmDeleteModal',
	props: {
		vm: { type: Object, required: true },
	},
	emits: ['close', 'deleted'],
	data() {
		return {
			// off by default: a disk is the one thing here that cannot be recreated
			deleteDisks: false,
			busy: false,
			error: '',
		}
	},
	computed: {
		running() {
			return this.vm.state !== 'shut-off' && this.vm.state !== 'crashed'
		},
		managedDisks() {
			return (this.vm.disks || []).filter(d => d.managed)
		},
	},
	methods: {
		async remove() {
			this.busy = true
			this.error = ''
			try {
				if (this.running) {
					await vmApi.action(this.vm.id, 'force-off')
				}
				const res = await vmApi.remove(this.vm.id, this.deleteDisks)
				this.$emit('deleted', this.vm, res.data.data)
				this.$emit('close')
			} catch (e) {
				this.error = e.response?.data?.message || e.message
			} finally {
				this.busy = false
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.vm-delete {
	width: 30rem;
	max-width: 100%;
}
</style>
