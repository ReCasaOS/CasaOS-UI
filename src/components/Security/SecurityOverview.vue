<template>
	<div class="modal-card security-modal touch-targets">
		<header class="modal-card-head">
			<h3 class="title is-header">
				{{ $t('Security') }}
			</h3>
		</header>

		<section class="modal-card-body">
			<b-message v-if="error" class="mb-3" data-error size="is-small" type="is-danger">
				{{ $t('The vulnerability scans cannot be read for now.') }}
			</b-message>

			<p v-else-if="!status">
				{{ $t('Loading…') }}
			</p>

			<template v-else>
				<div class="settings-card">
					<p class="has-text-weight-bold mb-2" data-state>
						{{ $t(state) }}
					</p>
					<p class="is-size-7 has-text-full-03">
						{{ $t('The images of your apps are checked for known vulnerabilities every night. An app is flagged when an update of it fixes a critical one.') }}
					</p>
					<p v-if="status.last_run" class="is-size-7 has-text-full-03 mt-2" data-dates>
						{{ $t('Last scan: {date}', { date: new Date(status.last_run).toLocaleString() }) }}
						<template v-if="status.db_updated_at">
							· {{ $t('Vulnerability database of {date}', { date: new Date(status.db_updated_at).toLocaleDateString() }) }}
						</template>
					</p>
					<p v-if="status.last_error" class="is-size-7 has-text-danger mt-2" data-last-error>
						{{ $t('The last scan stopped early: {reason}', { reason: status.last_error }) }}
					</p>
				</div>

				<div v-if="apps.length" class="settings-card">
					<button v-for="item in apps" :key="item.app" class="security-overview__app" data-app type="button" @click="open(item.app)">
						<span class="security-overview__name">{{ item.app }}</span>
						<b-tag v-if="item.actionable" type="is-danger">
							{{ $t('{count} critical · update', { count: item.critical }) }}
						</b-tag>
						<b-tag v-else-if="item.critical" type="is-danger is-light">
							{{ $t('{count} critical', { count: item.critical }) }}
						</b-tag>
						<b-tag v-if="item.high" type="is-warning is-light">
							{{ $t('{count} high', { count: item.high }) }}
						</b-tag>
						<span v-if="!item.critical && !item.high" class="is-size-7 has-text-full-03">{{ $t('Nothing found') }}</span>
						<b-icon class="ml-2" icon="chevron-right" size="is-small"></b-icon>
					</button>
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
import scanRun from './scanRun'
import SecurityModal from '@/components/Apps/SecurityModal.vue'
import { refresh, vulnScan, vulnScanApi } from '@/service/vulnScan'

export default {
	name: 'SecurityOverview',

	mixins: [scanRun],

	emits: ['close'],

	computed: {
		// the apps to act on first, then the most critical ones, then by name
		apps() {
			return Object.values(vulnScan.apps).sort((a, b) =>
				Number(b.actionable === true) - Number(a.actionable === true) || (b.critical || 0) - (a.critical || 0) || a.app.localeCompare(b.app))
		},
		// the one sentence that says where things stand
		state() {
			if (this.scanning) {
				return this.status.last_run ? 'A scan is running.' : 'The first scan is running. It can take several minutes.'
			}
			if (!this.status.last_run) {
				return 'No scan has run yet.'
			}
			return this.apps.some(item => item.actionable) ? 'Some apps have a critical vulnerability that an update fixes.' : 'No app needs an update for a critical vulnerability.'
		},
	},

	created() {
		this.load()
	},

	methods: {
		async load() {
			try {
				const [status] = await Promise.all([vulnScanApi.status(), refresh({ force: true })])
				this.status = status.data.data
				this.error = false
				if (this.status?.running) {
					this.wait()
				}
			} catch {
				this.error = true
			}
		},

		open(app) {
			this.$buefy.modal.open({
				component: SecurityModal,
				hasModalCard: true,
				trapFocus: true,
				customClass: 'security-modal',
				props: { app },
			})
		},
	},
}
</script>

<style lang="scss">
.security-overview {
  &__app {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0;
    border: 0;
    border-bottom: 1px solid var(--line-1, rgba(128, 128, 128, 0.2));
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;

    &:last-child {
      border-bottom: 0;
    }
  }

  &__name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
