<template>
	<!-- an image from the user's computer, sent as it is to the iso folder -->
	<div class="vm-upload">
		<div :class="{ 'is-dragging': dragging }" class="vm-upload-zone" @dragleave="dragging = false"
			@dragover.prevent="dragging = !uploading" @drop.prevent="onDrop">
			<span class="vm-upload-hint">{{ $t('Drop an ISO or a disk image here, or') }}</span>
			<b-button :disabled="uploading" icon-left="upload" size="is-small" @click="$refs.input.click()">
				{{ $t('Upload an image') }}
			</b-button>
			<input ref="input" :accept="ACCEPT" class="is-hidden" tabindex="-1" type="file" @change="onPick">
		</div>

		<div v-if="file" class="vm-upload-file is-size-7 mt-2">
			<div class="is-flex is-align-items-center">
				<span class="vm-upload-name has-text-weight-semibold">{{ file.name }}</span>
				<span class="vm-upload-dim ml-2">{{ formatBytes(file.size, $i18n.locale) }}</span>
				<b-button v-if="uploading" class="ml-auto" size="is-small" @click="cancel">{{ $t('Cancel') }}</b-button>
				<b-button v-else :title="$t('Remove this file')" :aria-label="$t('Remove this file')" class="ml-auto"
					size="is-small" @click="file = null">✕</b-button>
			</div>

			<template v-if="uploading">
				<progress :aria-label="$t('Upload progress')" :aria-valuenow="percent" :value="percent" aria-valuemax="100"
					aria-valuemin="0" class="progress is-small is-primary mt-2 mb-1" max="100" role="progressbar"></progress>
				<p class="vm-upload-progress vm-upload-dim">{{ progressText }}</p>
			</template>
			<template v-else>
				<b-field :label="$t('SHA-256 (optional)')" class="vm-upload-sha mt-2"
					:message="$t('When given, a file with another checksum is deleted. Download sites list it next to the image.')">
					<b-input v-model="sha" :placeholder="$t('64 hex digits')" size="is-small"></b-input>
				</b-field>
				<div class="is-flex is-justify-content-flex-end">
					<b-button icon-left="upload" size="is-small" type="is-primary" @click="send">{{ $t('Upload') }}</b-button>
				</div>
			</template>
		</div>

		<b-message v-if="error" class="vm-upload-error mt-2" size="is-small" type="is-danger">{{ $t(UPLOAD_ERRORS[error]) }}</b-message>
		<b-message v-if="warning" class="vm-upload-warning mt-2" size="is-small" type="is-warning">
			{{ $t('This file does not look like a bootable ISO, check it.') }}
		</b-message>
		<!-- the start and the end, not every percent -->
		<p aria-live="polite" class="is-sr-only" role="status">{{ announce }}</p>
	</div>
</template>

<script>
import vmApi from './api'
import { UPLOAD_ERRORS, formatBytes, uploadErrorCode, uploadProgress, uploadRefusal } from './vms'

const ACCEPT = '.iso,.qcow2,.img,.raw,.vmdk,.vdi,.xz,.gz,.zip'
// how often the bar and its line are drawn, at most
const DRAW_MS = 500

export default {
	name: 'ImageUpload',
	emits: ['busy', 'uploaded', 'refresh'],
	data() {
		return {
			ACCEPT,
			UPLOAD_ERRORS,
			file: null,
			sha: '',
			dragging: false,
			uploading: false,
			progress: null,
			error: '',
			warning: false,
			announce: '',
			// off the page: nothing it waits for may start an upload
			closed: false,
		}
	},
	computed: {
		percent() {
			return this.progress?.percent ?? 0
		},
		progressText() {
			const p = this.progress
			if (!p) {
				return this.$t('Checking…')
			}
			const locale = this.$i18n.locale
			const parts = [`${p.percent}%`, `${formatBytes(p.loaded, locale)} / ${formatBytes(p.total, locale)}`]
			if (p.speed) {
				parts.push(`${formatBytes(p.speed, locale)}/s`)
			}
			if (p.remaining !== null) {
				parts.push(this.timeLeft(p.remaining))
			}
			return parts.join(' · ')
		},
	},
	watch: {
		uploading(on) {
			this.$emit('busy', on)
			this.listen(on)
		},
	},
	beforeUnmount() {
		this.closed = true
		this.listen(false)
		this.cancel()
	},
	methods: {
		formatBytes,
		listen(on) {
			const method = on ? 'addEventListener' : 'removeEventListener'
			window[method]('beforeunload', this.onBeforeUnload)
			// the browser drops the request anyway; this says so to the service at once
			window[method]('pagehide', this.cancel)
		},
		onBeforeUnload(e) {
			e.preventDefault()
			e.returnValue = ''
		},
		timeLeft(seconds) {
			if (seconds < 60) {
				return this.$t('{n} s left', { n: seconds })
			}
			if (seconds < 3600) {
				return this.$t('{n} min left', { n: Math.ceil(seconds / 60) })
			}
			return this.$t('{h} h {m} min left', { h: Math.floor(seconds / 3600), m: Math.floor(seconds % 3600 / 60) })
		},
		fail(code) {
			this.error = code
			this.announce = this.$t(UPLOAD_ERRORS[code])
		},
		pick(file) {
			this.error = ''
			this.warning = false
			this.announce = ''
			// what the name alone says, at once
			if (uploadRefusal(file) === 'bad_name') {
				this.file = null
				return this.fail('bad_name')
			}
			this.file = file
		},
		onPick(e) {
			const [file] = e.target.files || []
			// the same file can be picked again
			e.target.value = ''
			if (file) {
				this.pick(file)
			}
		},
		onDrop(e) {
			this.dragging = false
			const files = e.dataTransfer?.files || []
			if (this.uploading || !files.length) {
				return
			}
			if (files.length > 1) {
				return this.fail('many')
			}
			this.pick(files[0])
		},
		cancel() {
			this.controller?.abort()
		},
		onProgress(p) {
			const now = Date.now()
			if (now - this.drawnAt < DRAW_MS && p.loaded < p.total) {
				return
			}
			this.drawnAt = now
			this.progress = uploadProgress(p, this.startedAt, now)
		},
		async send() {
			const file = this.file
			const sha256 = this.sha.trim().toLowerCase()
			this.error = ''
			this.warning = false
			this.progress = null
			this.uploading = true
			// Cancel works from the first moment, the checks included
			const controller = new AbortController()
			this.controller = controller
			const canceled = () => {
				if (!this.closed) {
					this.announce = this.$t('Upload canceled.')
				}
			}
			try {
				// a check that cannot be made is left to the service
				const [images, host] = await Promise.all([
					vmApi.images().then(res => res.data.data || [], () => []),
					vmApi.host().then(res => res.data.data || {}, () => ({})),
				])
				if (this.closed || controller.signal.aborted) {
					return canceled()
				}
				const refusal = uploadRefusal(file, { sha256, images, freeBytes: host.storage_free_bytes, storagePath: host.storage_path })
				if (refusal) {
					return this.fail(refusal)
				}

				this.startedAt = Date.now()
				this.drawnAt = this.startedAt
				this.progress = uploadProgress({ loaded: 0, total: file.size }, this.startedAt, this.startedAt)
				this.announce = this.$t('Uploading {name}…', { name: file.name })
				const image = await vmApi.uploadImage(file, { sha256: sha256 || undefined, signal: controller.signal, onProgress: this.onProgress })
				// canceled when the answer was already on its way: the file may be
				// there, but it was not asked for any more
				if (controller.signal.aborted) {
					canceled()
					return this.$emit('refresh')
				}
				this.file = null
				this.sha = ''
				this.warning = image.warning === 'iso_signature_missing'
				this.announce = this.$t('{name} is uploaded and selected.', { name: image.name })
				this.$emit('uploaded', image)
			} catch (e) {
				if (controller.signal.aborted) {
					return canceled()
				}
				const code = uploadErrorCode(e)
				this.fail(code)
				// the file may be there all the same
				if (code === 'network') {
					this.$emit('refresh')
				}
			} finally {
				this.controller = null
				this.uploading = false
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.vm-upload-zone {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: center;
	gap: 0.5rem;
	padding: 0.75rem;
	border: 1px dashed var(--casa-border-strong);
	border-radius: 0.375rem;
	background: var(--casa-surface-sunken);

	&.is-dragging {
		border-style: solid;
		border-color: var(--casa-text-hint);
	}
}

.vm-upload-hint,
.vm-upload-dim {
	font-size: 0.75rem;
	color: var(--casa-text-hint);
}

.vm-upload-name {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

@media (max-width: 600px) {
	.vm-upload .button {
		min-height: 2.25rem;
	}
}
</style>
