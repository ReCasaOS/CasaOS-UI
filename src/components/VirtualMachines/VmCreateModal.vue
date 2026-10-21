<template>
	<div class="modal-card vm-create" @vm-escape="onEscape">
		<header class="modal-card-head b-line">
			<h3 class="title is-5 has-text-black">{{ $t('New virtual machine') }}</h3>
		</header>

		<section class="modal-card-body">
			<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">{{ error }}</b-message>

			<!-- the image first: it names the VM and says what it runs -->
			<b-field :label="$t('Installation image')" :message="$t(errors.image_path || imageHint)"
				:type="errors.image_path ? 'is-danger' : ''">
				<b-autocomplete v-model="form.image_path" :data="suggestions" :placeholder="$t('None: an empty disk')"
					clearable expanded field="path" open-on-focus size="is-small" @select="onSuggestion">
					<template #default="props">
						<div class="is-flex is-align-items-center">
							<b-icon :icon="props.option.kind === 'iso' ? 'disc' : 'harddisk'" class="mr-2" size="is-small" />
							<span class="is-flex-grow-1">{{ props.option.name }}</span>
							<span class="is-size-7 has-text-full-03">{{ formatBytes(props.option.size_bytes, $i18n.locale) }}</span>
						</div>
					</template>
				</b-autocomplete>
				<p class="control">
					<b-button size="is-small" @click="browse">{{ $t('Browse…') }}</b-button>
				</p>
				<p class="control">
					<b-button icon-left="download" size="is-small" :title="$t('Download from a URL')" @click="download" />
				</p>
			</b-field>
			<image-upload ref="upload" class="mt-2" @busy="uploading = $event" @refresh="loadImages" @uploaded="onUploaded" />

			<!-- then the edit form's tabs, in their order, as sections -->
			<p class="section-title">{{ $t('General') }}</p>
			<b-field :label="$t('Name')" :message="$t(errors.title || '')" :type="errors.title ? 'is-danger' : ''">
				<b-input v-model="form.title" :has-counter="false" maxlength="128" size="is-small"></b-input>
			</b-field>
			<os-field v-model="form.os" class="mt-4" @update:model-value="osTouched = true" />
			<resources-fields v-model:memory-mib="form.memory_mib" v-model:vcpus="form.vcpus" :errors="errors" :host="host"
				class="mt-3" />
			<b-field :label="$t('Firmware')">
				<b-select v-model="form.firmware" expanded size="is-small">
					<option :disabled="!host.uefi" value="uefi">UEFI</option>
					<option value="bios">BIOS</option>
				</b-select>
			</b-field>

			<p class="section-title">{{ $t('Storage & CD') }}</p>
			<b-field :label="$t('Disk size (GB)')" :message="diskMessage" :type="errors.disk_gib ? 'is-danger' : ''">
				<b-numberinput v-model="form.disk_gib" :min="1" controls-position="compact" expanded size="is-small"></b-numberinput>
			</b-field>
			<b-field :label="$t('Save in')" :message="folderMessage" :type="folderError ? 'is-danger' : ''" class="mt-3">
				<b-input :model-value="form.storage_path" expanded readonly size="is-small"></b-input>
				<p class="control">
					<b-button size="is-small" @click="pickFolder">{{ $t('Browse…') }}</b-button>
				</p>
			</b-field>

			<p class="section-title">{{ $t('Network') }}</p>
			<network-field v-model="form.network" v-model:address="form.address" :host="host" />

			<b-switch v-model="form.start" class="mt-4" size="is-small">{{ $t('Start it once it is created') }}</b-switch>
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button class="mr-2" rounded @click="requestClose">{{ $t('Cancel') }}</b-button>
			<b-button :disabled="uploading" :loading="busy" rounded type="is-primary" @click="submit">{{ $t('Create') }}</b-button>
		</footer>
	</div>
</template>

<script>
import DownloadModal from './DownloadModal.vue'
import ImageUpload from './ImageUpload.vue'
import NetworkField from './NetworkField.vue'
import OsField from './OsField.vue'
import PathPicker from './PathPicker.vue'
import ResourcesFields from './ResourcesFields.vue'
import vmApi from './api'
import { createDefaults, createRequest, formatBytes, guessOS, imageKind, isUnderData, validateCreate } from './vms'

export default {
	name: 'VmCreateModal',
	components: { ImageUpload, NetworkField, OsField, ResourcesFields },
	props: {
		host: { type: Object, required: true },
	},
	emits: ['close', 'created', 'notStarted'],
	data() {
		return {
			form: createDefaults(this.host),
			images: [],
			// once the OS is picked by hand, the image name no longer changes it
			osTouched: false,
			submitted: false,
			// the chosen folder's free space; the default's comes with the host
			folderFree: this.host.storage_free_bytes,
			folderError: '',
			busy: false,
			error: '',
			// an image is on its way from the browser
			uploading: false,
		}
	},
	computed: {
		errors() {
			return this.submitted ? validateCreate(this.form, this.host) : {}
		},
		suggestions() {
			const q = (this.form.image_path || '').toLowerCase()
			return this.images.filter(img => isUnderData(img.path) && (!q || img.path.toLowerCase().includes(q)))
		},
		imageHint() {
			switch (imageKind(this.form.image_path)) {
				case 'iso':
					return 'Put in the CD-ROM drive of a new, empty disk.'
				case 'disk':
					return 'Copied into the new disk, which grows to the size below if the image is smaller. The file itself is not changed.'
				default:
					return 'An ISO or a disk image under /DATA. Upload one below, or put it in /DATA/VM/iso with Files.'
			}
		},
		diskMessage() {
			return this.errors.disk_gib ? this.$t(this.errors.disk_gib) : ''
		},
		folderMessage() {
			if (this.folderError) {
				return this.folderError
			}
			const free = formatBytes(this.folderFree, this.$i18n.locale)
			return free ? this.$t('{free} free', { free }) : ''
		},
	},
	watch: {
		'form.image_path': function (path, old) {
			// name the VM after the image until the user names it
			const guess = p => (p || '').split('/').pop().replace(/\.(iso|qcow2|img|raw|vmdk|vdi)(\.(xz|gz))?$|\.zip$/i, '')
			if (!this.form.title || this.form.title === guess(old)) {
				this.form.title = guess(path)
			}
			if (!this.osTouched) {
				this.form.os = guessOS(path)
			}
		},
	},
	mounted() {
		this.loadImages()
	},
	methods: {
		formatBytes,
		async loadImages() {
			try {
				const res = await vmApi.images()
				this.images = res.data.data || []
			} catch {
				// suggestions only: the path can still be typed or browsed
				this.images = []
			}
		},
		// in the list at once, and the image of the VM
		onUploaded(image) {
			this.images = [...this.images.filter(img => img.path !== image.path), image]
			this.form.image_path = image.path
		},
		// closing stops an upload: not without asking
		requestClose() {
			if (!this.uploading) {
				return this.$emit('close')
			}
			this.$buefy.dialog.confirm({
				message: this.$t('An image is still uploading. Close and stop the upload?'),
				confirmText: this.$t('Stop the upload'),
				cancelText: this.$t('Keep uploading'),
				type: 'is-danger',
				onConfirm: () => {
					this.$refs.upload?.cancel()
					this.$emit('close')
				},
			})
		},
		// Escape, from the modal stack: the upload keeps the dialog open until asked
		onEscape(e) {
			if (this.uploading) {
				e.preventDefault()
				this.requestClose()
			}
		},
		onSuggestion(option) {
			if (option) {
				this.form.image_path = option.path
			}
		},
		browse() {
			const start = this.form.image_path ? this.form.image_path.slice(0, this.form.image_path.lastIndexOf('/')) : undefined
			const modal = this.$buefy.modal.open({
				component: PathPicker,
				hasModalCard: true,
				trapFocus: true,
				props: { start },
				events: {
					select: (path) => {
						this.form.image_path = path
						modal.close()
					},
				},
			})
		},
		pickFolder() {
			const modal = this.$buefy.modal.open({
				component: PathPicker,
				hasModalCard: true,
				trapFocus: true,
				props: { folderOnly: true, start: this.form.storage_path },
				events: {
					select: (path) => {
						modal.close()
						this.setFolder(path)
					},
				},
			})
		},
		async setFolder(path) {
			this.folderError = ''
			try {
				const res = await vmApi.storageFolder(path)
				this.form.storage_path = res.data.data.path
				this.folderFree = res.data.data.free_bytes
			} catch (e) {
				this.folderError = e.response?.data?.message || e.message
			}
		},
		download() {
			const modal = this.$buefy.modal.open({
				component: DownloadModal,
				hasModalCard: true,
				trapFocus: true,
				canCancel: ['escape'],
				props: { folder: `${this.host.storage_path || '/DATA/VM'}/iso` },
				events: {
					select: (path) => {
						this.form.image_path = path
						this.loadImages()
						modal.close()
					},
				},
			})
		},
		async submit() {
			this.submitted = true
			if (Object.keys(this.errors).length) {
				return
			}

			this.busy = true
			this.error = ''
			try {
				const res = await vmApi.create(createRequest(this.form, this.host))
				this.$emit('created', res.data.data, res.status === 202)
				this.$emit('close')
			} catch (e) {
				const message = e.response?.data?.message || e.message
				if (e.response?.status === 409) {
					// The service made the VM and could not start it. It exists: the dialog
					// closes, or the next Create would make a second VM and a second disk.
					this.$emit('notStarted', this.form.title.trim(), message)
					this.$emit('close')
				} else {
					this.error = message
				}
			} finally {
				this.busy = false
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.vm-create {
	width: 36rem;
	max-width: 100%;

	// the edit form's tabs, as headings
	.section-title {
		margin: 1.5rem 0 0.75rem;
		padding-bottom: 0.25rem;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--casa-text-dim);
		border-bottom: 1px solid var(--casa-border);
	}
}
</style>
