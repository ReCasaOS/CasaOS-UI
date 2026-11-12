<template>
	<div class="guard-journal">
		<b-tabs v-model="tab" :animated="false" size="is-small">
			<b-tab-item :label="$t('Events')" />
			<b-tab-item :label="$t('Active bans')" />
		</b-tabs>

		<div class="is-flex is-align-items-center mb-2">
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
			<p v-if="!rows.length && !loading" class="is-size-7">{{ tab === 0 ? $t('No events') : $t('No active bans') }}</p>
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
							<td>{{ when(e.time) }}</td><td>{{ e.ip }}</td><td>{{ place(e.country) }}</td><td>{{ network(e) }}</td>
							<td v-if="!app">{{ e.app }}</td><td>{{ e.path }}</td>
							<td>{{ reasonText(e, $t, locale) }}</td>
							<td>{{ actionText(e.action, $t) }}<span v-if="e.count > 1" class="ml-1">×{{ e.count }}</span></td>
							<td>
								<b-button v-if="e.reason === 'waf' && canStop(e)" class="stop-rule" size="is-small" type="is-text" :disabled="busy" @click="stopRule(e)">{{ $t('Stop applying this rule to {app}', { app: e.app }) }}</b-button>
							</td>
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
							<td>{{ b.ip }}</td><td>{{ place(b.country) }}</td><td>{{ network(b) }}</td><td>{{ b.app }}</td>
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
import { actionText, countryName, flag, guardErrorText, reasonText } from './guardWords'
import { applyGuard, shareGuard, shareGuardApi, touchGuard } from '@/service/shareGuard'

const PER = 25
const NO_OVERRIDE = { waf: null, rules_off: null, allow: null, block: null, countries: null, rate_per_min: null, ban: null }

export default {
	name: 'GuardJournal',
	props: {
		app: { type: String, default: null },
		boxPolicy: { type: Object, default: null },
	},
	emits: ['changed'],
	data() {
		return { shareGuard, PER, tab: 0, events: [], bans: [], error: '', writeError: '', loading: false, busy: false, seq: 0, partial: false, current: 1, appFilter: '', reasonFilter: '' }
	},
	computed: {
		locale() {
			return this.$i18n.locale.replace('_', '-')
		},
		appNames() {
			return Object.keys(shareGuard.view?.apps || {})
		},
		reasons() {
			return this.tab === 0 ? ['waf', 'country', 'scan', 'rate', 'code', 'blocklist', 'banned'] : ['waf', 'scan', 'rate', 'code']
		},
		rows() {
			return this.tab === 0 ? this.events : this.bans
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
		actionText,
		reasonLabel(r) {
			switch (r) {
				case 'waf': return this.$t('OWASP rules')
				case 'country': return this.$t('Country')
				case 'scan': return this.$t('Scan')
				case 'rate': return this.$t('Request limit')
				case 'code': return this.$t('Access code')
				case 'blocklist': return this.$t('Blocklist')
				case 'banned': return this.$t('Banned')
				default: return ''
			}
		},
		when(time) {
			const d = new Date(time)
			return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(this.locale)
		},
		place(cc) {
			return cc ? `${flag(cc)} ${countryName(cc, this.locale)}`.trim() : ''
		},
		network(x) {
			return [x.as_org, x.asn > 0 ? `AS${x.asn}` : ''].filter(Boolean).join(' ')
		},
		async load() {
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
				const list = (await (events ? shareGuardApi.events(params) : shareGuardApi.bans())).data.data
				if (seq !== this.seq) {
					return
				}
				this.error = ''
				this[events ? 'events' : 'bans'] = Array.isArray(list) ? list : []
			} catch (e) {
				if (seq !== this.seq) {
					return
				}
				this.error = guardErrorText(e, this.$t)
				this[events ? 'events' : 'bans'] = []
			} finally {
				if (seq === this.seq) {
					this.loading = false
					this.current = 1
				}
			}
		},
		canStop(e) {
			return e.rule > 0 && !!shareGuard.view?.apps?.[e.app]
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
			const box = shareGuard.view?.box || this.boxPolicy
			if (!box) {
				return
			}
			await this.write(async () => {
				const allow = box.allow || []
				await applyGuard(shareGuardApi.setBox({ ...box, allow: allow.includes(b.ip) ? allow : [...allow, b.ip] }))
				this.partial = true
				await shareGuardApi.unban(b.key)
				touchGuard()
				await this.load()
			})
		},
		async write(fn) {
			this.busy = true
			this.writeError = ''
			this.partial = false
			try {
				await fn()
				this.$emit('changed')
			} catch (e) {
				this.writeError = guardErrorText(e, this.$t)
				// the box was saved before the unban failed: the parent's copy is stale
				if (this.partial) {
					this.$emit('changed')
				}
			} finally {
				this.busy = false
			}
		},
	},
}
</script>
