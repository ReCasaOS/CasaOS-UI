<template>
	<div :class="{ 'is-titled': title }" class="guard-journal">
		<b-tabs v-model="tab" :animated="false" size="is-small">
			<b-tab-item>
				<template #header>
					{{ $t('Events') }}<span v-if="counted.events" class="_count">{{ events.length }}</span>
				</template>
			</b-tab-item>
			<b-tab-item>
				<template #header>
					{{ $t('Active bans') }}<span v-if="counted.bans" :class="{ 'is-bad': bans.length }" class="_count">{{ shownBans.length }}</span>
				</template>
			</b-tab-item>
			<b-tab-item v-if="relayShown" :label="$t('Cut at the relay')" />
		</b-tabs>

		<!-- with a title, a head of its own (tile, title, what it is) with the filters and Refresh at the right, above the tabs -->
		<div class="_top is-flex is-align-items-center is-flex-wrap-wrap mb-2">
			<template v-if="title">
				<span class="_tile" aria-hidden="true"><b-icon icon="format-list-bulleted" /></span>
				<div class="_text">
					<p class="_name">{{ title }}</p>
					<p v-if="hint" class="is-size-7 _has-text-gray">{{ hint }}</p>
				</div>
			</template>
			<template v-if="tab === 0">
				<div v-if="!app" class="select is-small mr-2">
					<select v-model="appFilter" name="app-filter" :aria-label="$t('App')" @change="load">
						<option value="">{{ $t('All apps') }}</option>
						<option v-for="a in appNames" :key="a" :value="a">{{ a }}</option>
					</select>
				</div>
				<div class="select is-small mr-2">
					<select v-model="reasonFilter" name="reason-filter" :aria-label="$t('Reason')" @change="load">
						<option value="">{{ $t('All reasons') }}</option>
						<option v-for="r in reasons" :key="r" :value="r">{{ reasonLabel(r) }}</option>
					</select>
				</div>
			</template>
			<b-button name="refresh" size="is-small" :disabled="loading" @click="load">{{ $t('Refresh') }}</b-button>
		</div>

		<b-message v-if="writeError" size="is-small" type="is-danger">{{ writeError }}</b-message>
		<b-message v-if="error" size="is-small" type="is-danger">{{ error }}</b-message>
		<template v-else>
			<p v-if="!rows.length && !loading" class="is-size-7">{{ emptyText }}</p>
			<div v-else class="table-container">
				<table v-if="tab === 0" class="table is-narrow is-fullwidth is-size-7 guard-events">
					<thead>
						<tr>
							<th>{{ $t('Date') }}</th><th>{{ $t('IP address') }}</th><th>{{ $t('Country') }}</th><th>{{ $t('Network') }}</th>
							<th v-if="!app">{{ $t('App') }}</th><th>{{ $t('Path') }}</th><th>{{ $t('Reason') }}</th><th>{{ $t('Action') }}</th><th></th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="(e, i) in page" :key="`${e.time}-${e.key}-${i}`">
							<td>{{ when(e.time) }}</td><td class="_ip">{{ e.ip }}</td><td><country-flag :cc="e.country" />{{ place(e.country) }}</td><td>{{ network(e) }}</td>
							<td v-if="!app">{{ e.app }}</td><td>{{ e.path }}</td>
							<td>{{ reasonText(e, $t, locale) }}</td>
							<td><span :class="`is-${e.action}`" class="_act">{{ actionText(e.action, $t) }}<span v-if="e.count > 1" class="ml-1">×{{ e.count }}</span></span></td>
							<td>
								<b-button v-if="e.reason === 'waf' && canStop(e)" class="stop-rule" size="is-small" type="is-text" :disabled="busy" @click="stopRule(e)">{{ $t('Stop applying this rule to {app}', { app: e.app }) }}</b-button>
							</td>
						</tr>
					</tbody>
				</table>
				<table v-else-if="tab === 2" class="table is-narrow is-fullwidth is-size-7 guard-relay">
					<thead>
						<tr><th>{{ $t('Hour') }}</th><th>{{ $t('IP address') }}</th><th>{{ $t('Reason') }}</th><th>{{ $t('Count') }}</th></tr>
					</thead>
					<tbody>
						<tr v-for="(r, i) in page" :key="`${r.hour}-${r.key}-${r.reason}-${i}`">
							<td>{{ when(r.hour) }}</td><td class="_ip">{{ r.key.replace(/\/32$/, '') }}</td><td>{{ relayReasonText(r, $t) }}</td><td>{{ r.count }}</td>
						</tr>
					</tbody>
				</table>
				<table v-else class="table is-narrow is-fullwidth is-size-7 guard-bans">
					<thead>
						<tr>
							<th>{{ $t('IP address') }}</th><th>{{ $t('Country') }}</th><th>{{ $t('Network') }}</th><th>{{ $t('App') }}</th>
							<th>{{ $t('Reason') }}</th><th>{{ $t('Since') }}</th><th>{{ $t('Until') }}</th><th></th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="b in page" :key="b.key">
							<td class="_ip">{{ b.ip }}</td><td><country-flag :cc="b.country" />{{ place(b.country) }}</td><td>{{ network(b) }}</td><td>{{ b.app }}</td>
							<td>{{ reasonLabel(b.reason) }}</td><td>{{ when(b.since) }}</td><td>{{ when(b.until) }}</td>
							<td class="has-text-right">
								<b-button class="unban" size="is-small" :disabled="busy" @click="unban(b)">{{ $t('Unban') }}</b-button>
								<b-button class="allow" size="is-small" :disabled="busy" @click="allow(b)">{{ $t('Always allow this address') }}</b-button>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
			<b-pagination v-if="rows.length > PER" v-model="current" :per-page="PER" :total="rows.length" size="is-small" />
		</template>

		<p class="is-size-7 mt-2"><a href="https://db-ip.com" target="_blank" rel="noopener noreferrer">IP Geolocation by DB-IP</a></p>
	</div>
</template>

<script>
import CountryFlag from './CountryFlag.vue'
import { actionText, countryName, guardErrorText, reasonText, relayReasonText } from './guardWords'
import { applyGuard, refreshGuard, shareGuard, shareGuardApi, touchGuard } from '@/service/shareGuard'

const PER = 25
const NO_OVERRIDE = { waf: null, rules_off: null, allow: null, block: null, countries: null, rate_per_min: null, ban: null }

export default {
	name: 'GuardJournal',
	components: { CountryFlag },
	props: {
		// a head of its own: the title and what it is, the filters at the right
		title: { type: String, default: '' },
		hint: { type: String, default: '' },
		app: { type: String, default: null },
	},
	data() {
		// counted: which list has been read once, so its tab can show how many it holds
		return { shareGuard, PER, tab: 0, events: [], bans: [], relay: [], counted: { events: false, bans: false, relay: false }, error: '', writeError: '', loading: false, busy: false, seq: 0, current: 1, appFilter: '', reasonFilter: '' }
	},
	computed: {
		// the bans the tab lists: an app's own when the journal is an app's
		shownBans() {
			return this.app ? this.bans.filter(b => b.app === this.app) : this.bans
		},
		// the relay's own cuts: for the box, not for one app
		relayShown() {
			return !this.app && !!shareGuard.view?.relay?.supported
		},
		emptyText() {
			if (this.tab === 2) {
				return this.$t('Nothing was cut at the relay in the last 7 days.')
			}
			return this.tab === 0 ? this.$t('No events') : this.$t('No active bans')
		},
		locale() {
			return this.$i18n.locale.replace('_', '-')
		},
		appNames() {
			return Object.keys(shareGuard.view?.apps || {})
		},
		// the reasons of the events filter (the bans have no filter)
		reasons() {
			return ['waf', 'country', 'scan', 'rate', 'code', 'blocklist', 'banned']
		},
		// the bans route has no app parameter: an app's window keeps its own bans
		rows() {
			return [this.events, this.shownBans, this.relay][this.tab]
		},
		page() {
			return this.rows.slice((this.current - 1) * PER, this.current * PER)
		},
	},
	watch: {
		tab() {
			this.writeError = ''
			this.load()
		},
	},
	mounted() {
		this.load()
	},
	methods: {
		reasonText,
		relayReasonText,
		actionText,
		reasonLabel(r) {
			switch (r) {
				case 'waf': return this.$t('OWASP rules')
				case 'country': return this.$t('Country')
				case 'scan': return this.$t('Scan')
				case 'rate': return this.$t('Request limit')
				case 'code': return this.$t('Access code')
				case 'blocklist': return this.$t('Blocklist')
				case 'banned': return this.$t('Banned address')
				default: return ''
			}
		},
		when(time) {
			const d = new Date(time)
			return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(this.locale)
		},
		place(cc) {
			return cc ? countryName(cc, this.locale) || cc : ''
		},
		network(x) {
			return [x.as_org, x.asn > 0 ? `AS${x.asn}` : ''].filter(Boolean).join(' ')
		},
		async load() {
			const name = ['events', 'bans', 'relay'][this.tab]
			const events = this.tab === 0
			const params = {}
			if (events) {
				const app = this.app || this.appFilter
				if (app) {
					params.app = app
				}
				if (this.reasonFilter) {
					params.reason = this.reasonFilter
				}
			}
			const seq = ++this.seq
			this.loading = true
			try {
				const list = (await (events ? shareGuardApi.events(params) : name === 'bans' ? shareGuardApi.bans() : shareGuardApi.relayRefusals())).data.data
				if (seq !== this.seq) {
					return
				}
				this.error = ''
				this[name] = Array.isArray(list) ? list : []
				this.counted[name] = true
			} catch (e) {
				if (seq !== this.seq) {
					return
				}
				this.error = guardErrorText(e, this.$t)
				this[name] = []
			} finally {
				if (seq === this.seq) {
					this.loading = false
					this.current = 1
				}
			}
		},
		// not for a rule the app already does not apply
		canStop(e) {
			const a = shareGuard.view?.apps?.[e.app]
			return e.rule > 0 && !!a && !(a.effective?.rules_off || []).includes(e.rule)
		},
		async stopRule(e) {
			const a = shareGuard.view?.apps?.[e.app]
			if (!a) {
				return
			}
			const o = a.override || NO_OVERRIDE
			const off = o.rules_off || []
			await this.write(async () => {
				await applyGuard(shareGuardApi.setApp(e.app, a.access, { ...o, rules_off: off.includes(e.rule) ? off : [...off, e.rule] }))
			})
		},
		async unban(b) {
			await this.write(async () => {
				await shareGuardApi.unban(b.key)
				touchGuard()
				await this.load()
			})
		},
		async allow(b) {
			const box = shareGuard.view?.box
			if (!box) {
				return
			}
			await this.write(async () => {
				const allow = box.allow || []
				await applyGuard(shareGuardApi.setBox({ ...box, allow: allow.includes(b.ip) ? allow : [...allow, b.ip] }))
				await shareGuardApi.unban(b.key)
				touchGuard()
				await this.load()
			})
		},
		async write(fn) {
			this.busy = true
			this.writeError = ''
			try {
				await fn()
			} catch (e) {
				this.writeError = guardErrorText(e, this.$t)
				// the core may have saved it all the same
				await refreshGuard({ force: true })
			} finally {
				this.busy = false
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.guard-journal {
	.table-container {
		border-radius: 0.625rem;
		border: 1px solid var(--casa-divider-soft);
	}

	.table {
		background: transparent;
		color: inherit;

		th {
			border: 0;
			color: var(--casa-text-hint);
			font-size: 0.75rem;
			font-weight: 600;
			white-space: nowrap;
		}

		td {
			border-color: var(--casa-divider-soft);
			vertical-align: middle;
		}
	}

	// the tabs' counts
	._count {
		display: inline-flex;
		align-items: center;
		height: 1.125rem;
		margin-left: 0.375rem;
		padding: 0 0.375rem;
		border-radius: 0.5625rem;
		background: var(--casa-hover-tint);
		font-size: 0.6875rem;
		font-weight: 600;

		&.is-bad {
			background: rgba($danger, 0.16);
			color: $danger;
		}
	}

	// titled: head first, then the tabs, then the table
	&.is-titled {
		display: flex;
		flex-direction: column;

		._top {
			order: -1;
			gap: 0.5rem 0.75rem;
			margin-bottom: 0.75rem !important;
		}
	}

	._tile {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 0.75rem;
		background: var(--casa-hover-tint);
		color: var(--casa-text-hint);
	}

	._text {
		flex: 1 1 14rem;
		min-width: 0;
	}

	._name {
		font-weight: 600;
		color: var(--casa-text-strong);
	}

	// what was done with the request, in a chip the colour of its weight
	._act {
		display: inline-flex;
		align-items: center;
		height: 1.25rem;
		padding: 0 0.5rem;
		border-radius: 0.625rem;
		background: var(--casa-hover-tint);
		font-size: 0.7rem;
		font-weight: 600;
		white-space: nowrap;

		&.is-blocked {
			background: rgba($warning, 0.18);
			color: $warning;
		}

		&.is-banned {
			background: rgba($danger, 0.16);
			color: $danger;
		}
	}

	._ip {
		font-family: ui-monospace, sfmono-regular, menlo, consolas, monospace;
		white-space: nowrap;
	}

	// a phone keeps the date, the address, the country, the reason and the action
	@media (max-width: 768px) {
		.guard-events th:nth-child(4),
		.guard-events td:nth-child(4),
		.guard-events th:nth-child(6),
		.guard-events td:nth-child(6) {
			display: none;
		}
	}
}
</style>
