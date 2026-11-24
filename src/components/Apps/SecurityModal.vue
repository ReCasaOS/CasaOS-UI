<template>
	<div class="modal-card security-modal touch-targets">
		<header class="modal-card-head">
			<h3 class="title is-header">
				{{ $t('Security') }} · {{ app }}
			</h3>
		</header>

		<section class="modal-card-body">
			<b-message v-if="error" class="mb-3" data-error size="is-small" type="is-danger">
				{{ $t('The vulnerability scans cannot be read for now.') }}
			</b-message>

			<p v-else-if="!detail">
				{{ $t('Loading…') }}
			</p>

			<template v-else>
				<div class="settings-card">
					<p class="has-text-weight-bold mb-2" data-advice>
						{{ $t(advice) }}
					</p>
					<p class="is-size-7 has-text-full-03" data-dates>
						<template v-if="status && status.last_run">
							{{ $t('Last scan: {date}', { date: new Date(status.last_run).toLocaleString() }) }}
						</template>
						<template v-if="status && status.db_updated_at">
							· {{ $t('Vulnerability database of {date}', { date: new Date(status.db_updated_at).toLocaleDateString() }) }}
						</template>
					</p>
					<p v-if="status && status.last_error" class="is-size-7 has-text-danger mt-2" data-last-error>
						{{ $t('The last scan stopped early: {reason}', { reason: status.last_error }) }}
					</p>
				</div>

				<div v-for="image in detail.images" :key="image.image_id" class="settings-card">
					<p class="is-size-7 has-text-full-03 security-modal__mono mb-2">
						{{ image.image_id }}
					</p>
					<p v-if="noteOf(image)" class="is-size-7 mb-2" data-note>
						{{ $t(noteOf(image)) }}
					</p>

					<table v-if="image.findings.length" class="table is-fullwidth is-size-7 security-modal__table">
						<thead>
							<tr>
								<th>{{ $t('Vulnerability') }}</th>
								<th>{{ $t('Package') }}</th>
								<th>{{ $t('Installed') }}</th>
								<th>{{ $t('Fixed in') }}</th>
								<th>{{ $t('Severity') }}</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="finding in image.findings" :key="`${finding.id} ${finding.package}`" data-finding>
								<td :title="finding.title">
									<a v-if="isHttps(finding.url)" :href="finding.url" rel="noopener noreferrer" target="_blank">{{ finding.id }}</a>
									<template v-else>
										{{ finding.id }}
									</template>
								</td>
								<td>{{ finding.package }}</td>
								<td class="security-modal__mono">
									{{ finding.installed }}
								</td>
								<td class="security-modal__mono">
									{{ finding.fixed }}
								</td>
								<td>
									<b-tag :type="finding.severity === 'CRITICAL' ? 'is-danger' : 'is-warning'">
										{{ $t(finding.severity === 'CRITICAL' ? 'Critical' : 'High') }}
									</b-tag>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</template>
		</section>

		<footer class="modal-card-foot is-flex is-align-items-center">
			<div class="is-flex-grow-1"></div>
			<b-button :disabled="scanning" :loading="scanning" data-action="scan" rounded type="is-primary" @click="scan">
				{{ $t('Scan now') }}
			</b-button>
			<b-button rounded @click="$emit('close')">
				{{ $t('Close') }}
			</b-button>
		</footer>
	</div>
</template>

<script>
import scanRun from '@/components/Security/scanRun'
import { vulnScan, vulnScanApi } from '@/service/vulnScan'

const NOTES = {
	'not enough room': 'This image was not scanned: there is not enough room on the disk.',
	'scan failed': 'This image was not scanned: the scan failed.',
}

export default {
	name: 'SecurityModal',

	mixins: [scanRun],

	props: {
		// the app's name, which is its compose project
		app: { type: String, required: true },
	},

	emits: ['close'],

	data() {
		return {
			detail: null,
		}
	},

	computed: {
		summary() {
			return vulnScan.apps[this.app] || null
		},
		// what to do about what was found: the one sentence the window is for
		advice() {
			const found = this.detail.images.some(image => image.findings.length)
			if (!found) {
				return 'No critical or high vulnerability with a fix was found.'
			}
			if (this.summary?.actionable) {
				return 'An update of this app is offered: install it to fix the critical ones.'
			}
			return 'No update of this app is offered yet. Its publisher has to release an image with the fixes.'
		},
	},

	created() {
		this.load()
	},

	methods: {
		isHttps(url) {
			return typeof url === 'string' && url.startsWith('https://')
		},

		// why an image shows no finding that is not "none was found"
		noteOf(image) {
			if (image.skipped) {
				return NOTES[image.skipped] || NOTES['scan failed']
			}
			return image.os_only ? 'The Java libraries of this image were not checked.' : ''
		},

		async load() {
			try {
				const [detail, status] = await Promise.all([vulnScanApi.app(this.app), vulnScanApi.status()])
				this.detail = detail.data.data
				this.status = status.data.data
				this.error = false
				if (this.status?.running) {
					this.wait()
				}
			} catch {
				this.error = true
			}
		},
	},
}
</script>

<style lang="scss">
.security-modal {
  &__mono {
    font-family: monospace;
    word-break: break-all;
  }

  &__table td {
    vertical-align: middle;
  }
}
</style>
