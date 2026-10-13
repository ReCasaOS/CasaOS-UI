<template>
	<!-- where new VMs keep their disks, and the images and downloads -->
	<div class="modal-card vm-storage-settings">
		<header class="modal-card-head b-line">
			<h3 class="title is-5 has-text-black">{{ $t('Virtual machine settings') }}</h3>
		</header>

		<section class="modal-card-body">
			<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">{{ error }}</b-message>

			<b-field :label="$t('Default folder')" :message="message">
				<b-input :model-value="path" expanded readonly size="is-small"></b-input>
				<p class="control">
					<b-button size="is-small" @click="pick">{{ $t('Browse…') }}</b-button>
				</p>
			</b-field>
			<p class="is-size-7 has-text-full-03">
				{{ $t('New virtual machines keep their disks here unless you choose another folder, and its iso folder holds the images and downloads. Virtual machines already made keep their disks where they are.') }}
			</p>
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button rounded @click="$emit('close')">{{ $t('Cancel') }}</b-button>
			<b-button :disabled="path === host.storage_path" :loading="saving" rounded type="is-primary" @click="save">
				{{ $t('Save') }}
			</b-button>
		</footer>
	</div>
</template>

<script>
import PathPicker from './PathPicker.vue'
import vmApi from './api'
import { formatBytes } from './vms'

export default {
	name: 'StorageSettingsModal',
	props: {
		host: { type: Object, required: true },
	},
	emits: ['close', 'saved'],
	data() {
		return {
			path: this.host.storage_path || '',
			free: this.host.storage_free_bytes,
			saving: false,
			error: '',
		}
	},
	computed: {
		message() {
			const free = formatBytes(this.free, this.$i18n.locale)
			return free ? this.$t('{free} free', { free }) : ''
		},
	},
	methods: {
		pick() {
			const modal = this.$buefy.modal.open({
				component: PathPicker,
				hasModalCard: true,
				trapFocus: true,
				props: { folderOnly: true, start: this.path },
				events: {
					select: async (path) => {
						modal.close()
						this.error = ''
						try {
							const res = await vmApi.storageFolder(path)
							this.path = res.data.data.path
							this.free = res.data.data.free_bytes
						} catch (e) {
							this.error = e.response?.data?.message || e.message
						}
					},
				},
			})
		},
		async save() {
			this.saving = true
			this.error = ''
			try {
				const res = await vmApi.setStorage(this.path)
				this.$emit('saved', res.data.data)
				this.$emit('close')
			} catch (e) {
				this.error = e.response?.data?.message || e.message
			} finally {
				this.saving = false
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.vm-storage-settings {
	width: 32rem;
	max-width: 100%;
}
</style>
