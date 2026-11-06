<template>
	<div class="modal-card logs-page">
		<header class="modal-card-head">
			<div class="is-flex is-align-items-center is-flex-grow-1">
				<button :aria-expanded="String(drawer)" :aria-label="$t('Show the apps')" class="logs-drawer-toggle mr-2" type="button" @click="drawer = !drawer">
					<b-icon icon="menu" />
				</button>
				<h3 class="title is-header mb-0 mr-2" tabindex="-1">{{ $t('Logs') }}</h3>
			</div>
			<button :aria-label="$t('Close')" class="close-button ml-2" type="button" @click="$emit('close')">
				<b-icon icon="close-outline" pack="casa" />
			</button>
		</header>

		<section class="modal-card-body">
			<div :class="{ 'is-drawer-open': drawer }" class="logs-split">
				<aside class="logs-side">
					<p v-if="appsState === 'outdated'" class="logs-note" role="status">{{ $t('Update this box to read its logs') }}</p>
					<ul class="logs-apps">
						<li v-for="app in apps" :key="app.app">
							<div class="logs-app">
								<b-checkbox :model-value="selectedApps.includes(app.app)" size="is-small" @update:model-value="toggleApp(app.app, $event)">
									<span class="logs-app-label">
										<img v-if="app.icon" :src="app.icon" alt="" class="logs-app-icon">
										<span :class="{ 'is-running': isRunning(app) }" class="logs-dot" aria-hidden="true"></span>
										<span class="logs-app-name">{{ titleOf(app) }}</span>
									</span>
								</b-checkbox>
								<b-tag v-if="app.uninstalled" size="is-small">{{ $t('Uninstalled') }}</b-tag>
								<button v-if="app.services?.length"
									:aria-expanded="String(!!open[app.app])"
									:aria-label="$t('Show the services')"
									class="logs-expand"
									type="button"
									@click="open = { ...open, [app.app]: !open[app.app] }">
									<b-icon :icon="open[app.app] ? 'chevron-up' : 'chevron-down'" size="is-small" />
								</button>
							</div>
							<ul v-if="open[app.app]" class="logs-services">
								<li v-for="s in app.services" :key="s.container">
									<b-checkbox :model-value="selectedServices.includes(`${app.app}/${s.service}`)" size="is-small" @update:model-value="toggleService(app.app, s.service, $event)">
										{{ s.service }}
									</b-checkbox>
								</li>
							</ul>
						</li>
					</ul>
				</aside>

				<div class="logs-main">
					<p v-if="capText" class="logs-cap" role="status">{{ capText }}</p>
					<div class="logs-toolbar">
						<b-input v-model="qInput" :aria-label="$t('Search the logs')" :placeholder="$t('Search the logs')" icon="magnify" size="is-small" type="search" />
						<b-checkbox v-model="regex" size="is-small">{{ $t('Regex') }}</b-checkbox>
						<b-select v-model="stream" size="is-small">
							<option value="">{{ $t('All streams') }}</option>
							<option value="o">stdout</option>
							<option value="e">stderr</option>
						</b-select>
						<b-select v-model="level" size="is-small">
							<option value="">{{ $t('All levels') }}</option>
							<option value="warn">{{ $t('Warnings and errors') }}</option>
							<option value="error">{{ $t('Errors only') }}</option>
						</b-select>
						<b-select v-model="rangeId" size="is-small">
							<option v-for="r in ranges" :key="r.id" :value="r.id">{{ $t(r.label) }}</option>
						</b-select>
						<template v-if="rangeId === 'custom'">
							<b-datetimepicker v-model="custom.since" :placeholder="$t('Range start')" size="is-small" />
							<b-datetimepicker v-model="custom.until" :placeholder="$t('Range end')" size="is-small" />
						</template>
						<b-select v-if="boxes.length" v-model="box" :aria-label="$t('Box')" class="logs-box" size="is-small">
							<option :value="null">{{ $t('This box') }}</option>
							<option v-for="b in boxes" :key="b.id" :disabled="b.online !== true" :value="b.id">{{ b.name }}</option>
						</b-select>
						<div class="logs-actions">
							<b-button rounded size="is-small" @click="togglePause">{{ status.paused ? $t('Resume') : $t('Pause') }}</b-button>
							<b-button rounded size="is-small" @click="$refs.stream.jumpToNow()">{{ $t('Jump to now') }}</b-button>
							<b-button rounded size="is-small" @click="$refs.stream.download()">{{ $t('Download') }}</b-button>
							<b-button rounded size="is-small" @click="$refs.stream.clear()">{{ $t('Clear') }}</b-button>
							<template v-if="controlled">
								<b-button :loading="acting === 'restart'" rounded size="is-small" @click="setStatus('restart')">{{ $t('Restart') }}</b-button>
								<b-button :loading="acting === 'stop'" rounded size="is-small" type="is-danger" @click="setStatus('stop')">{{ $t('Stop') }}</b-button>
							</template>
						</div>
					</div>
					<log-stream ref="stream"
						:apps="selectedApps"
						:box="box"
						:filter="filter"
						:focus-at="focusAt"
						:range="range"
						:services="selectedServices.length ? selectedServices : null"
						@event="shownEvent = $event"
						@status="status = $event" />
				</div>
			</div>
		</section>

		<b-modal :model-value="!!shownEvent" width="28rem" @update:model-value="shownEvent = null">
			<div v-if="shownEvent" class="box">
				<dl class="logs-event">
					<template v-for="(value, key) in shownEvent" :key="key">
						<dt>{{ key }}</dt>
						<dd>{{ value }}</dd>
					</template>
				</dl>
			</div>
		</b-modal>
	</div>
</template>

<script>
import LogStream from './LogStream.vue'
import { rangeBounds } from './logsModel'
import { listBoxes } from '@/components/Fleet/fleetLoader'
import { fleetApi } from '@/service/fleet'
import { logsApi } from '@/service/logs'

const RANGES = [
	{ id: 'live', label: 'Live' },
	{ id: '1h', label: 'Last hour' },
	{ id: '24h', label: 'Last 24 hours' },
	{ id: '7d', label: 'Last 7 days' },
	{ id: 'custom', label: 'Custom range' },
]

const DAY_MS = 86400000

export default {
	name: 'LogsPage',
	components: { LogStream },
	props: {
		initialApp: { type: String, default: '' },
		initialAt: { type: String, default: '' },
		initialBox: { type: String, default: '' },
	},
	emits: ['close'],
	data() {
		return {
			ranges: RANGES,
			boxes: [],
			box: this.initialBox || null,
			apps: [],
			appsState: 'loading',
			open: {},
			selectedApps: this.initialApp ? [this.initialApp] : [],
			selectedServices: [],
			qInput: '',
			q: '',
			regex: false,
			stream: '',
			level: '',
			rangeId: 'live',
			custom: { since: null, until: null },
			focusAt: this.initialAt || null,
			settings: null,
			status: { connected: false, lines: 0, paused: false },
			shownEvent: null,
			acting: '',
			drawer: false,
		}
	},
	computed: {
		filter() {
			return { stream: this.stream, level: this.level, q: this.q, regex: this.regex }
		},
		range() {
			return this.rangeId === 'live' ? null : rangeBounds(this.rangeId, new Date(), this.custom)
		},
		selectedApp() {
			return this.selectedApps.length === 1 ? this.apps.find(a => a.app === this.selectedApps[0]) : null
		},
		// Restart and Stop are compose routes: a v1 app, whose one service the server names "main", has none
		controlled() {
			const app = this.selectedApp
			const v1 = app?.services?.length === 1 && app.services[0].service === 'main'
			return !!app && !app.uninstalled && app.app !== '_other' && !v1
		},
		capText() {
			const s = this.settings
			if (this.box || !s || !(s.used_mb >= s.max_size_mb) || !s.oldest_at) {
				return ''
			}
			const n = Math.max(1, Math.round((Date.now() - Date.parse(s.oldest_at)) / DAY_MS))
			return this.$t('Logs go back {n} days, cap reached', { n })
		},
	},
	watch: {
		box() {
			if (this.keepSelection) {
				this.keepSelection = false
			} else {
				this.selectedApps = []
				this.selectedServices = []
				this.focusAt = null
			}
			this.loadApps()
		},
		// the search is asked of the server: one query per pause in the typing, not per key
		qInput(value) {
			clearTimeout(this.qTimer)
			this.qTimer = setTimeout(() => {
				this.q = value.trim()
			}, 300)
		},
	},
	mounted() {
		listBoxes().catch(() => []).then((boxes) => {
			this.boxes = boxes
			// a box of the URL this master does not know (an unknown list proves nothing): this box, with the app and the moment kept
			if (this.box && boxes.length && !boxes.some(b => b.id === this.box)) {
				this.keepSelection = true
				this.box = null
			}
		})
		this.loadApps()
		logsApi.settings().then((res) => {
			this.settings = res.ok ? res.data : null
		})
	},
	beforeUnmount() {
		clearTimeout(this.qTimer)
	},
	methods: {
		async loadApps() {
			const box = this.box
			this.appsState = 'loading'
			const res = await logsApi.apps(box)
			if (box !== this.box) {
				return
			}
			if (res.ok) {
				this.apps = res.data ?? []
				this.appsState = 'open'
				return
			}
			this.apps = []
			this.appsState = res.status === 404 ? 'outdated' : 'error'
			if (res.status !== 404) {
				this.$buefy.toast.open({ message: res.error, type: 'is-danger' })
			}
		},
		titleOf(app) {
			if (app.app === '_other') {
				return this.$t('Other containers')
			}
			return app.title?.[this.$i18n.locale] || app.title?.en_us || app.app
		},
		isRunning(app) {
			return (app.services ?? []).some(s => s.running)
		},
		toggleApp(name, on) {
			this.selectedApps = on ? [...this.selectedApps, name] : this.selectedApps.filter(a => a !== name)
			if (!on) {
				this.selectedServices = this.selectedServices.filter(s => !s.startsWith(`${name}/`))
			}
		},
		// a service is "app/service": two apps may both have a "web"
		toggleService(app, service, on) {
			const key = `${app}/${service}`
			this.selectedServices = on ? [...this.selectedServices, key] : this.selectedServices.filter(s => s !== key)
			if (on && !this.selectedApps.includes(app)) {
				this.selectedApps = [...this.selectedApps, app]
			}
		},
		togglePause() {
			if (this.status.paused) {
				this.$refs.stream.resume()
			} else {
				this.$refs.stream.pause()
			}
		},
		// the same route as the app's own card; on a fleet box through the relay, which allows it
		async setStatus(status) {
			const id = this.selectedApp.app
			this.acting = status
			try {
				if (this.box) {
					await fleetApi.relay(this.box, 'put', `/v2/app_management/compose/${encodeURIComponent(id)}/status`, { data: JSON.stringify(status) })
				} else {
					await this.$openAPI.appManagement.compose.setComposeAppStatus(id, status)
				}
				this.$buefy.toast.open({ message: this.$t(status === 'restart' ? '{app} is restarting' : '{app} is stopping', { app: this.titleOf(this.selectedApp) }), type: 'is-success' })
			} catch (e) {
				this.$buefy.toast.open({ message: e?.response?.data?.message || e?.message || this.$t('Error'), type: 'is-danger' })
			} finally {
				this.acting = ''
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.logs-page {
	position: relative;
	container-type: inline-size;

	.modal-card-body {
		position: relative;
		display: flex;
		height: min(80vh, 52rem);
		padding: 0.75rem;
	}

	button.close-button,
	.logs-drawer-toggle {
		padding: 0;
		border: 0;
		color: inherit;
		background-color: transparent;
		cursor: pointer;

		&:hover {
			background-color: var(--casa-hover-tint);
		}
	}

	.logs-drawer-toggle {
		display: none;
	}

	@media (max-width: 768px) {
		.logs-drawer-toggle {
			display: inline-flex;
		}
	}
}

.logs-split {
	position: relative;
	display: grid;
	grid-template-columns: 15rem minmax(0, 1fr);
	gap: 0.75rem;
	width: 100%;
	min-height: 0;
}

.logs-side {
	overflow-y: auto;
	padding: 0.5rem;
	border-radius: 0.75rem;
	background: var(--casa-surface-sunken);
	border: 1px solid var(--casa-border);
}

// under 768 px the apps are a drawer over the stream
@media (max-width: 768px) {
	.logs-split {
		grid-template-columns: minmax(0, 1fr);
	}

	.logs-side {
		position: absolute;
		inset: 0 auto 0 0;
		z-index: 3;
		display: none;
		width: min(18rem, 85%);
		background: var(--casa-surface, #fff);
		box-shadow: 0 4px 16px rgb(0 0 0 / 25%);
	}

	.is-drawer-open .logs-side {
		display: block;
	}
}

.logs-apps,
.logs-services {
	list-style: none;
	margin: 0;
}

.logs-services {
	padding-left: 1.75rem;
}

.logs-app {
	display: flex;
	align-items: center;
	gap: 0.25rem;
	padding: 0.25rem 0;
}

.logs-app-label {
	display: inline-flex;
	align-items: center;
	gap: 0.375rem;
	min-width: 0;
}

.logs-app-icon {
	width: 1.25rem;
	height: 1.25rem;
	border-radius: 0.25rem;
}

.logs-app-name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.logs-dot {
	flex-shrink: 0;
	width: 0.5rem;
	height: 0.5rem;
	border-radius: 50%;
	background: #8a8f98;

	&.is-running {
		background: #3dd26b;
	}
}

.logs-expand {
	margin-left: auto;
	padding: 0;
	border: 0;
	color: inherit;
	background: transparent;
	cursor: pointer;
}

.logs-main {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	min-width: 0;
	min-height: 0;
}

.logs-toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.5rem;
}

.logs-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 0.25rem;
	margin-left: auto;
}

.logs-cap,
.logs-note {
	font-size: 0.75rem;
	color: var(--casa-text-warning, #b26a00);
}

.logs-event {
	display: grid;
	grid-template-columns: max-content 1fr;
	gap: 0.25rem 0.75rem;
	font-size: 0.875rem;

	dt {
		color: var(--casa-text-hint);
	}

	dd {
		margin: 0;
		word-break: break-word;
	}
}
</style>

<style lang="scss">
// The modal the page opens in: as wide as the window allows, since a log line needs the room (Buefy's default is 640px).
.logs-modal {
	.animation-content {
		width: 100rem;
		max-width: calc(100vw - 2rem) !important;
	}

	.modal-card.logs-page {
		width: 100%;
		height: calc(100vh - 3rem);
		max-height: calc(100vh - 3rem);
	}
}
</style>
