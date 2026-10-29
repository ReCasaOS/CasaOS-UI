<template>
	<div class="modal-card storage-plan">
		<header class="modal-card-head">
			<h3 class="title is-header is-flex-grow-1">{{ verbTitle(verb, $t) }}</h3>
			<b-icon class="close-button" icon="close-outline" pack="casa" @click="$emit('close')" />
		</header>

		<section class="modal-card-body">
			<b-loading v-model="isLoading" :is-full-page="false"></b-loading>

			<!-- 1. what the action asks -->
			<template v-if="!plan">
				<b-field v-if="asks.member" :label="$t('Disk of the pool')">
					<b-select v-model="memberName" expanded>
						<option v-if="verb === 'replace-disk' && pool && pool.backend === 'md' && pool.missing > 0" value="">{{ $t('The missing disk') }}</option>
						<option v-for="m in members" :key="m.name" :value="m.name">{{ m.disk || m.name }} ({{ memberWords(m) }})</option>
					</b-select>
				</b-field>

				<b-field v-if="asks.disks" :label="asks.disks === 'many' ? $t('Disks') : $t('Disk')">
					<div>
						<p v-if="!disks.length" class="has-text-grey-light">{{ $t('No blank disk is big enough.') }}</p>
						<template v-if="asks.disks === 'many'">
							<b-checkbox v-for="d in disks" :key="d.name" v-model="diskNames" :native-value="d.name" class="is-block mb-1">
								{{ d.name }} — {{ d.model }} · {{ renderSize(d.size) }}
							</b-checkbox>
						</template>
						<b-select v-else v-model="diskName" expanded>
							<option v-for="d in disks" :key="d.name" :value="d.name">{{ d.name }} — {{ d.model }} · {{ renderSize(d.size) }}</option>
						</b-select>
					</div>
				</b-field>

				<b-field v-if="asks.layout" :label="$t('Protection')">
					<div>
						<b-radio v-for="o in layoutOptions" :key="o.key" v-model="layoutKey" :disabled="!o.possible" :native-value="o.key" class="is-block mb-2">
							<span class="has-text-weight-semibold">{{ layoutName(o.layout, $t) }}</span>
							<span class="has-text-full-04"> · {{ survives(o.tolerates, $t) }}</span>
							<span v-if="o.capacity" class="has-text-full-04"> · {{ $t('{size} for data', { size: renderSize(o.capacity) }) }}</span>
							<span v-if="!o.possible" class="has-text-grey-light"> · {{ $t('needs {n} disks', { n: o.min_disks }) }}</span>
						</b-radio>
					</div>
				</b-field>

				<p v-if="refusal" class="has-text-danger">{{ refusal }}</p>
			</template>

			<!-- 2. the preview -->
			<template v-else>
				<p class="has-text-weight-semibold mb-3">{{ plan.summary }}</p>
				<table class="table is-fullwidth is-narrow plan-effects">
					<tbody>
						<tr v-if="plan.effects.capacity_after || plan.effects.capacity_before">
							<td>{{ $t('Space for data') }}</td>
							<td>{{ plan.effects.capacity_before ? `${renderSize(plan.effects.capacity_before)} → ` : '' }}{{ renderSize(plan.effects.capacity_after) }}</td>
						</tr>
						<tr>
							<td>{{ $t('Protection') }}</td>
							<td :class="{ 'has-text-danger': plan.effects.tolerates_after < plan.effects.tolerates_before }">
								{{ survives(plan.effects.tolerates_before, $t) }} → {{ survives(plan.effects.tolerates_after, $t) }}
							</td>
						</tr>
					</tbody>
				</table>
				<b-message v-if="plan.effects.erases.length" type="is-danger">
					{{ $t('Everything on {disks} is erased.', { disks: plan.effects.erases.join(', ') }) }}
				</b-message>
				<p v-for="note in plan.effects.notes" :key="note" class="has-text-full-04 mb-2">{{ note }}</p>
				<ol class="ml-5 mb-3">
					<li v-for="s in plan.steps" :key="s">{{ s }}</li>
				</ol>
				<b-collapse v-model="showCommands" class="mb-3">
					<template #trigger="{ open }">
						<a class="is-size-7">{{ open ? $t('Hide the commands') : $t('Show the commands') }}</a>
					</template>
					<pre class="is-size-7 plan-commands">{{ commands }}</pre>
				</b-collapse>
				<b-field v-if="plan.confirm" :label="$t('Type {text} to confirm', { text: plan.confirm })">
					<b-input v-model="typed" autocomplete="off"></b-input>
				</b-field>
			</template>
		</section>

		<footer class="modal-card-foot is-justify-content-flex-end">
			<b-button v-if="plan" rounded @click="back">{{ $t('Back') }}</b-button>
			<b-button v-else rounded @click="$emit('close')">{{ $t('Cancel') }}</b-button>
			<b-button v-if="!plan" :disabled="!chosen" :loading="isLoading" rounded type="is-primary" @click="preview">{{ $t('Preview') }}</b-button>
			<b-button v-else :disabled="!confirmed" :loading="isApplying" :type="plan.effects.erases.length ? 'is-danger' : 'is-primary'" rounded @click="apply">
				{{ $t('Apply') }}
			</b-button>
		</footer>
	</div>
</template>

<script>
import escape from 'lodash/escape'
import { choices, diskChoices, intent, layoutName, layoutTargets, memberChoices, survives, verbTitle } from './pools'
import { renderSize } from '@/mixins/file_utils'

const layoutKey = l => `${l.kind}:${l.copies || l.parity || 0}`

export default {
	name: 'storage-plan',
	props: {
		verb: { type: String, required: true },
		pool: { type: Object, default: null },
		drives: { type: Array, default: () => [] },
		// already chosen: the member (replace, take out) or the drive (add, wipe)
		member: { type: Object, default: null },
		disk: { type: Object, default: null },
	},
	emits: ['close', 'applied'],
	data() {
		return {
			memberName: this.member?.name ?? '',
			diskNames: this.disk && this.verb !== 'wipe-disk' ? [this.disk.name] : [],
			diskName: this.disk?.name ?? '',
			layoutKey: '',
			options: [],
			plan: null,
			refusal: '',
			typed: '',
			showCommands: false,
			isLoading: false,
			isApplying: false,
		}
	},
	computed: {
		asks() {
			return choices(this.verb, this.pool)
		},
		members() {
			return memberChoices(this.verb, this.pool)
		},
		chosenMember() {
			return this.members.find(m => m.name === this.memberName) || null
		},
		disks() {
			return diskChoices(this.verb, this.drives, this.chosenMember)
		},
		chosenDisks() {
			if (this.verb === 'wipe-disk') {
				return [this.disk.name]
			}
			if (!this.asks.disks) {
				return []
			}
			return this.asks.disks === 'many' ? this.diskNames : (this.diskName ? [this.diskName] : [])
		},
		layoutOptions() {
			if (this.verb === 'change-layout') {
				return layoutTargets(this.pool).map(l => ({ key: layoutKey(l), layout: l, possible: true, tolerates: l.kind === 'mirror' ? l.copies - 1 : 0, capacity: 0 }))
			}
			return this.options.map(o => ({ ...o, key: layoutKey(o.layout) }))
		},
		chosenLayout() {
			return this.layoutOptions.find(o => o.key === this.layoutKey && o.possible)?.layout || null
		},
		chosen() {
			if (this.asks.disks && !this.chosenDisks.length) {
				return false
			}
			if (this.asks.layout && !this.chosenLayout) {
				return false
			}
			if (this.asks.member && this.memberName === '' && !(this.verb === 'replace-disk' && this.pool?.backend === 'md' && this.pool.missing > 0)) {
				return false
			}
			return !this.isLoading
		},
		confirmed() {
			return !this.isApplying && (!this.plan.confirm || this.typed.trim() === this.plan.confirm)
		},
		commands() {
			return (this.plan?.commands || []).map(c => c.join(' ')).join('\n')
		},
	},
	watch: {
		// the layouts depend on the disks chosen
		diskNames() {
			if (this.verb === 'create-pool') {
				this.loadLayouts()
			}
		},
		memberName() {
			if (!this.disks.some(d => d.name === this.diskName)) {
				this.diskName = this.disks[0]?.name || ''
			}
		},
	},
	mounted() {
		if (this.asks.disks === 'one' && !this.diskName) {
			this.diskName = this.disks[0]?.name || ''
		}
		if (this.asks.member && this.memberName === '' && this.members.length && !(this.pool?.backend === 'md' && this.pool.missing > 0)) {
			this.memberName = this.members[0].name
		}
		if (this.verb === 'create-pool') {
			this.loadLayouts()
		}
		// nothing to choose: straight to the preview
		if (!this.asks.disks && !this.asks.layout && !this.asks.member) {
			this.preview()
		}
	},
	methods: {
		renderSize,
		layoutName,
		survives,
		verbTitle,
		memberWords(m) {
			return { active: this.$t('Active'), faulty: this.$t('Faulty'), spare: this.$t('Spare'), rebuilding: this.$t('Rebuilding') }[m.state] || m.state
		},
		async loadLayouts() {
			try {
				this.options = (await this.$api.pools.layouts(this.diskNames)).data.data || []
			} catch {
				this.options = []
			}
			if (!this.layoutOptions.some(o => o.key === this.layoutKey && o.possible)) {
				// the most protective layout these disks allow
				const possible = this.layoutOptions.filter(o => o.possible)
				this.layoutKey = possible.length ? possible.reduce((a, b) => (b.tolerates > a.tolerates ? b : a)).key : ''
			}
		},
		async preview() {
			this.isLoading = true
			this.refusal = ''
			try {
				const body = intent(this.verb, { disks: this.chosenDisks, member: this.asks.member ? this.memberName : '', layout: this.asks.layout ? this.chosenLayout : null })
				this.plan = (await this.$api.pools.plan(body)).data.data
				this.typed = ''
				this.showCommands = false
			} catch (e) {
				this.refusal = e?.response?.data?.message || String(e)
			} finally {
				this.isLoading = false
			}
		},
		back() {
			this.plan = null
			if (!this.asks.disks && !this.asks.layout && !this.asks.member) {
				this.$emit('close')
			}
		},
		async apply() {
			this.isApplying = true
			try {
				await this.$api.pools.apply(this.plan.id, this.typed.trim())
				this.$buefy.toast.open({ message: escape(this.$t('Started: {summary}', { summary: this.plan.summary })), type: 'is-success' })
				this.$emit('applied')
				this.$emit('close')
			} catch (e) {
				this.$buefy.toast.open({ message: escape(e?.response?.data?.message || String(e)), type: 'is-danger' })
				if (e?.response?.status === 409 || e?.response?.status === 404) {
					this.plan = null // the storage changed, or the plan expired: choose again
				}
			} finally {
				this.isApplying = false
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.plan-commands {
	white-space: pre-wrap;
	word-break: break-all;
}
.plan-effects td {
	border: none;
}
</style>
