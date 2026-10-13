<template>
	<!-- an image from a URL the user gives, into the iso folder; the list of
		downloads under it, with their progress -->
	<div class="modal-card vm-download">
		<header class="modal-card-head b-line">
			<h3 class="title is-5 has-text-black">{{ $t('Download an image') }}</h3>
		</header>

		<section class="modal-card-body">
			<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">{{ error }}</b-message>

			<b-field :label="$t('Address of the ISO or disk image')">
				<b-input v-model="url" expanded placeholder="https://…/ubuntu-24.04-live-server-amd64.iso" size="is-small"
					@keyup.enter="start"></b-input>
			</b-field>
			<b-field :label="$t('SHA-256 (optional)')" class="mt-3"
				:message="$t('When given, a file with another checksum is deleted. Download sites list it next to the image.')">
				<b-input v-model="sha" :placeholder="$t('64 hex digits')" size="is-small"></b-input>
			</b-field>
			<p class="is-size-7 has-text-full-03 mt-2">
				{{ $t('The image goes to {folder}. This machine contacts only the address you give.', { folder }) }}
			</p>
			<div class="is-flex is-justify-content-flex-end mt-3">
				<b-button :disabled="!url.trim()" :loading="starting" icon-left="download" size="is-small" type="is-primary"
					@click="start">{{ $t('Download') }}</b-button>
			</div>

			<template v-if="downloads.length">
				<p class="label mt-4 mb-1">{{ $t('Downloads') }}</p>
				<div v-for="d in newestFirst" :key="d.id" class="download-row is-size-7">
					<div class="is-flex is-align-items-center">
						<div class="is-flex-grow-1 download-info" :title="d.url">
							<span class="has-text-weight-semibold">{{ d.name }}</span>
							<span class="has-text-full-03"> · {{ progressText(d) }}</span>
						</div>
						<b-button v-if="d.state === 'done' && selectable(d)" class="ml-1" size="is-small" type="is-primary"
							@click="$emit('select', d.path)">{{ $t('Use') }}</b-button>
						<b-button v-if="running(d)" class="ml-1" size="is-small" @click="remove(d)">{{ $t('Cancel') }}</b-button>
						<b-button v-else class="ml-1" size="is-small" :title="$t('Remove from the list; the file stays')"
							@click="remove(d)">✕</b-button>
					</div>
					<b-progress v-if="running(d)" :max="d.total_bytes || undefined" :value="d.total_bytes ? d.done_bytes : undefined"
						class="mt-1" size="is-small" type="is-primary" />
					<p v-if="d.error" class="has-text-danger mt-1">{{ d.error }}</p>
				</div>
			</template>
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button rounded @click="$emit('close')">{{ $t('Close') }}</b-button>
		</footer>
	</div>
</template>

<script>
import vmApi from './api'
import { downloadProgress, formatBytes, imageKind } from './vms'

export default {
	name: 'DownloadModal',
	props: {
		// the CD-ROM takes ISOs only
		isoOnly: { type: Boolean, default: false },
		folder: { type: String, default: '/DATA/VM/iso' },
	},
	emits: ['close', 'select'],
	data() {
		return {
			url: '',
			sha: '',
			downloads: [],
			starting: false,
			error: '',
			timer: null,
			// the dialog is gone: nothing it waits for may start the polling again
			closed: false,
		}
	},
	computed: {
		newestFirst() {
			return [...this.downloads].reverse()
		},
	},
	mounted() {
		this.refresh()
	},
	beforeUnmount() {
		this.closed = true
		clearTimeout(this.timer)
	},
	methods: {
		running(d) {
			return d.state === 'downloading' || d.state === 'verifying'
		},
		selectable(d) {
			return !this.isoOnly || imageKind(d.name) === 'iso'
		},
		progressText(d) {
			const p = downloadProgress(d)
			switch (d.state) {
				case 'downloading':
					return p.percent === null
						? formatBytes(d.done_bytes, this.$i18n.locale)
						: `${p.percent}% · ${formatBytes(d.done_bytes, this.$i18n.locale)} / ${formatBytes(d.total_bytes, this.$i18n.locale)}`
				case 'verifying':
					return this.$t('checking the SHA-256…')
				case 'done':
					return `${this.$t('done')} · ${formatBytes(d.done_bytes, this.$i18n.locale)}`
				case 'canceled':
					return this.$t('canceled')
				default:
					return this.$t('failed')
			}
		},
		// asks again every second while something downloads
		async refresh() {
			if (this.closed) {
				return
			}
			clearTimeout(this.timer)
			try {
				const res = await vmApi.downloads()
				this.downloads = res.data.data || []
			} catch (e) {
				this.error = e.response?.data?.message || e.message
			}
			// closed while the request was on its way: no timer to arm
			if (!this.closed && this.downloads.some(this.running)) {
				this.timer = setTimeout(this.refresh, 1000)
			}
		},
		async start() {
			if (!this.url.trim()) {
				return
			}
			this.starting = true
			this.error = ''
			try {
				await vmApi.startDownload(this.url.trim(), this.sha.trim())
				this.url = ''
				this.sha = ''
			} catch (e) {
				this.error = e.response?.data?.message || e.message
			} finally {
				this.starting = false
				this.refresh()
			}
		},
		async remove(d) {
			try {
				await vmApi.deleteDownload(d.id)
			} catch (e) {
				this.error = e.response?.data?.message || e.message
			}
			this.refresh()
		},
	},
}
</script>

<style lang="scss" scoped>
.vm-download {
	width: 34rem;
	max-width: 100%;

	.download-row {
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--casa-border);
	}

	.download-info {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
}
</style>
