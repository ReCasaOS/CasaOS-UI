<template>
	<form class="guard-policy-form" @submit.prevent="save">
		<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">{{ errorText }}</b-message>

		<section v-for="b in blocks" :key="b" class="mb-4">
			<div class="is-flex is-align-items-center mb-2">
				<h4 class="has-text-weight-semibold mr-3">{{ titles[b] }}</h4>
				<label v-if="box" class="checkbox is-size-7"><input v-model="same[b]" class="mr-1" type="checkbox" :name="`same-${b}`">{{ $t('Same as the box') }}</label>
			</div>

			<template v-if="b === 'owasp'">
				<div class="select is-small" :class="{ 'is-danger': bad('waf') }">
					<select v-model="d.waf" name="waf" :aria-label="titles.owasp" :disabled="same.owasp" @change="memory = d.waf !== 'off'">
						<option value="off">{{ $t('Off') }}</option>
						<option value="observe">{{ $t('Observe') }}</option>
						<option value="block">{{ $t('Block') }}</option>
					</select>
				</div>
				<span class="is-size-7 ml-2">{{ $t('Observe first') }}</span>
				<p v-if="memory" class="is-size-7 mt-2">{{ $t('The OWASP rules use about 50 MB of memory on the box.') }}</p>
				<div class="mt-2">
					<span class="is-size-7">{{ $t('Disabled rules') }}</span>
					<span v-for="id in d.rules" :key="id" class="tag is-light ml-1" :class="{ 'is-danger': bad('rules_off') }">
						{{ id }}<button class="delete is-small" type="button" :aria-label="`${$t('Remove')} ${id}`" :disabled="same.owasp" @click="d.rules = d.rules.filter(r => r !== id)"></button>
					</span>
					<input v-model="ruleId" class="input is-small ml-2" name="rule-id" style="width: 7rem" inputmode="numeric" :aria-label="$t('Rule number')" :disabled="same.owasp" @keydown.enter.prevent="addRule">
					<button class="button is-small ml-1" name="rule-add" type="button" :disabled="same.owasp || !/^\d+$/.test(ruleId.trim())" @click="addRule">{{ $t('Add') }}</button>
				</div>
			</template>

			<template v-else-if="b === 'lists'">
				<div v-for="l in ['allow', 'block']" :key="l" class="mb-2">
					<label class="label is-size-7">{{ l === 'allow' ? $t('Allowed addresses') : $t('Blocked addresses') }}</label>
					<pre v-if="box && box[l]?.length" class="guard-box-entries has-text-grey is-size-7 p-1">{{ box[l].join('\n') }}</pre>
					<textarea v-model="d[l]" class="textarea is-small" :class="{ 'is-danger': bad(l) || wrong(l).length }" :name="l" rows="3" :disabled="same.lists" :placeholder="$t('One address or network (CIDR) per line')"></textarea>
					<p v-if="wrong(l).length" class="guard-lines-error help is-danger">{{ $t('Not an address: {lines}', { lines: wrong(l).join(', ') }) }}</p>
				</div>
			</template>

			<template v-else-if="b === 'countries'">
				<label v-for="m in modes" :key="m.v" class="radio mr-3"><input v-model="d.mode" type="radio" :value="m.v" :disabled="same.countries" class="mr-1">{{ m.text }}</label>
				<div v-if="d.mode !== 'none'" class="mt-2">
					<span v-for="cc in d.list" :key="cc" class="tag is-light mr-1 mb-1" :class="{ 'is-danger': bad('countries.list') }">
						{{ flag(cc) }} {{ countryName(cc, $i18n.locale) }}<button class="delete is-small" type="button" :aria-label="`${$t('Remove')} ${cc}`" :disabled="same.countries" @click="d.list = d.list.filter(c => c !== cc)"></button>
					</span>
					<div class="select is-small">
						<select name="country-add" :aria-label="$t('Add a country')" :disabled="same.countries" @change="addCountry">
							<option value="">{{ $t('Add a country') }}</option>
							<option v-for="c in countries" :key="c.cc" :value="c.cc" :disabled="d.list.includes(c.cc)">{{ flag(c.cc) }} {{ c.name }}</option>
						</select>
					</div>
				</div>
			</template>

			<template v-else-if="b === 'limit'">
				<input v-model.number="d.rate" class="input is-small" :class="{ 'is-danger': bad('rate_per_min') }" name="rate" type="number" min="1" style="width: 7rem" :aria-label="titles.limit" :disabled="same.limit">
			</template>

			<template v-else>
				<div v-for="r in banRules" :key="r.n" class="mb-1 is-size-7">
					<span class="guard-ban-label">{{ r.label }}</span>
					<input v-model.number="d.ban[r.n]" class="input is-small" :class="{ 'is-danger': bad(`ban.${r.n}`) }" :name="`ban-${r.n}`" type="number" min="1" style="width: 5rem" :aria-label="r.label" :disabled="same.ban">
					{{ $t('within') }}
					<input v-model.number="d.min[r.w]" class="input is-small" :class="{ 'is-danger': bad(`ban.${r.w}`) }" :name="`ban-${r.w}`" type="number" min="1" step="any" style="width: 5rem" :aria-label="`${r.label}, ${$t('minutes')}`" :disabled="same.ban">
					{{ $t('minutes') }}
				</div>
			</template>
		</section>

		<b-button native-type="submit" :disabled="busy" :loading="busy" rounded size="is-small" type="is-primary">{{ $t('Save') }}</b-button>
	</form>
</template>

<script>
import { countryName, flag, guardErrorText } from './guardWords'
import { lines, validAddress } from './guardIp'

const BLOCKS = ['owasp', 'lists', 'countries', 'limit', 'ban']
const BANS = [['waf_hits', 'waf_window_s'], ['scan_404', 'scan_window_s'], ['rate_strikes', 'rate_window_s'], ['code_fails', 'code_window_s']]
// the core's DefaultPolicy(), for an answer that lacks a field
const DEFAULT = { waf: 'off', rules_off: [], allow: [], block: [], countries: { mode: 'none', list: [] }, rate_per_min: 600, ban: { waf_hits: 10, waf_window_s: 600, scan_404: 100, scan_window_s: 60, rate_strikes: 3, rate_window_s: 600, code_fails: 5, code_window_s: 600 } }
// shortcut: a fixed list of the ISO 3166-1 alpha-2 officially assigned codes, add the new one when ISO assigns it
const CODES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ')

export default {
	name: 'GuardPolicyForm',
	props: {
		// the box policy to edit (or, with `box`, ignored: the override is edited against `box`)
		policy: { type: Object, required: true },
		// set: the form edits an app's override of this box policy
		box: { type: Object, default: null },
		override: { type: Object, default: null },
		busy: { type: Boolean, default: false },
		// the core's refusal, `bad_policy:<field>`
		error: { type: String, default: '' },
	},
	emits: ['save'],
	data() {
		const o = this.box ? this.override || {} : {}
		const src = { ...DEFAULT, ...(this.box || this.policy) }
		// in an override the lists are the app's additions only; the other blocks start from the box value
		const add = k => (this.box ? o[k] : src[k]) || []
		const ban = { ...src.ban, ...o.ban }
		const countries = o.countries ?? src.countries
		const unset = k => !!this.box && o[k] == null
		return {
			blocks: BLOCKS,
			same: { owasp: unset('waf') && !add('rules_off').length, lists: !add('allow').length && !add('block').length && !!this.box, countries: unset('countries'), limit: unset('rate_per_min'), ban: unset('ban') },
			d: {
				waf: o.waf ?? src.waf,
				rules: [...add('rules_off')],
				allow: add('allow').join('\n'),
				block: add('block').join('\n'),
				mode: countries.mode,
				list: [...(countries.list || [])],
				rate: o.rate_per_min ?? src.rate_per_min,
				ban,
				min: Object.fromEntries(BANS.map(([, w]) => [w, ban[w] / 60])),
			},
			ruleId: '',
			memory: false,
		}
	},
	computed: {
		titles() {
			return { owasp: this.$t('OWASP rules'), lists: this.$t('Allowed and blocked addresses'), countries: this.$t('Countries'), limit: this.$t('Requests per minute'), ban: this.$t('Bans') }
		},
		modes() {
			return [{ v: 'none', text: this.$t('None') }, { v: 'block', text: this.$t('Block these') }, { v: 'allow', text: this.$t('Only these') }]
		},
		banRules() {
			const label = [this.$t('Rule hits (OWASP)'), this.$t('Missing pages (404)'), this.$t('Request limit exceeded'), this.$t('Wrong codes')]
			return BANS.map(([n, w], i) => ({ n, w, label: label[i] }))
		},
		countries() {
			const loc = String(this.$i18n.locale).replace('_', '-')
			return CODES.map(cc => ({ cc, name: countryName(cc, loc) })).sort((x, y) => x.name.localeCompare(y.name, loc))
		},
		// `bad_policy:ban.scan_404` gives `ban.scan_404`; a Gateway path matches no field
		field() {
			return this.error.startsWith('bad_policy:') ? this.error.slice(11) : ''
		},
		errorText() {
			return guardErrorText({ response: { data: { message: this.error } } }, this.$t)
		},
	},
	methods: {
		flag,
		countryName,
		bad(name) {
			return this.field === name || this.field.startsWith(`${name}[`)
		},
		wrong(l) {
			return lines(this.d[l]).filter(x => !validAddress(x))
		},
		addRule() {
			const n = Number(this.ruleId.trim())
			if (/^\d+$/.test(this.ruleId.trim()) && !this.d.rules.includes(n)) {
				this.d.rules.push(n)
			}
			this.ruleId = ''
		},
		addCountry(e) {
			if (e.target.value && !this.d.list.includes(e.target.value)) {
				this.d.list.push(e.target.value)
			}
			e.target.value = ''
		},
		save() {
			if (this.busy || this.wrong('allow').length || this.wrong('block').length) {
				return
			}
			const { d, same: s } = this
			const ban = { ...d.ban }
			BANS.forEach(([, w]) => (ban[w] = Math.round(d.min[w] * 60)))
			this.$emit('save', {
				waf: s.owasp ? null : d.waf,
				rules_off: s.owasp ? null : [...d.rules],
				allow: s.lists ? null : lines(d.allow),
				block: s.lists ? null : lines(d.block),
				countries: s.countries ? null : { mode: d.mode, list: d.mode === 'none' ? [] : [...d.list] },
				rate_per_min: s.limit ? null : d.rate,
				ban: s.ban ? null : ban,
			})
		},
	},
}
</script>
