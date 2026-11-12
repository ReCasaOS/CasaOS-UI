<template>
	<div class="storage-pool">
		<!-- the pools: one card each -->
		<div v-for="pool in pools" :key="pool.id" class="background-item mb-4 pb-3 pt-3 pl-3 pr-3">
			<div class="is-flex is-align-items-center">
				<div class="is-flex-grow-1">
					<h4 class="title is-5 mb-1">{{ pool.name }}</h4>
					<p class="has-text-full-04">
						{{ pool.layout_known ? layoutName(pool.layout, $t) : pool.profile }} · {{ survives(pool.tolerates, $t) }}
					</p>
				</div>
				<b-tag :type="tag(pool).type" class="pool-tag">{{ tag(pool).text }}</b-tag>
			</div>
			<template v-if="pool.mounted && pool.size">
				<b-progress :value="usedPercent(pool)" class="mt-3 mb-1" size="is-small" type="is-primary"></b-progress>
				<p class="has-text-full-04 is-size-7">
					{{ $t('{used} used of {size}', { used: renderSize(pool.used), size: renderSize(pool.size) }) }}
				</p>
			</template>
			<p v-else-if="!pool.mounted" class="has-text-danger mt-2">{{ $t('The pool is not mounted: its data cannot be reached.') }}</p>
			<!-- the service's own words: data not in the layout, and the like -->
			<p v-if="pool.problem" class="has-text-danger mt-2">{{ pool.problem }}</p>

			<!-- its disks -->
			<table class="table is-fullwidth is-narrow mt-3 pool-members">
				<tbody>
					<tr v-for="member in pool.members" :key="member.name">
						<td>{{ member.disk || member.name }}</td>
						<td class="has-text-full-04">{{ member.size ? renderSize(member.size) : '' }}</td>
						<td><b-tag :type="memberType(member)" size="is-small">{{ memberState(member) }}</b-tag></td>
						<td class="has-text-right">
							<b-button v-if="can(pool, 'replace-disk')" rounded size="is-small" @click="open('replace-disk', { pool, member })">{{ $t('Replace') }}</b-button>
							<b-button v-if="can(pool, 'remove-disk') && removable(pool, member)" class="ml-1" rounded size="is-small" @click="open('remove-disk', { pool, member })">{{ $t('Take out') }}</b-button>
						</td>
					</tr>
				</tbody>
			</table>

			<!-- what can be done -->
			<div class="buttons mt-2">
				<b-button v-for="verb in poolVerbs(pool)" :key="verb" :type="isDanger(verb) ? 'is-danger' : ''" rounded size="is-small"
					@click="open(verb, { pool })">
					{{ verbTitle(verb, $t) }}
				</b-button>
			</div>
		</div>

		<div v-if="!pools.length" class="has-text-centered mt-5 mb-5">
			<p class="has-text-grey-light mb-3">{{ $t('No pool yet: make one from blank disks.') }}</p>
			<b-button :disabled="!canCreate" rounded type="is-primary" @click="open('create-pool')">{{ verbTitle('create-pool', $t) }}</b-button>
		</div>
		<!-- a backend that holds several pools offers another -->
		<b-button v-else-if="canCreate" class="mb-4" rounded size="is-small" type="is-primary" @click="open('create-pool')">{{ verbTitle('create-pool', $t) }}</b-button>

		<!-- the drives and what each is -->
		<h5 class="title is-6 mt-4 mb-2">{{ $t('Drives') }}</h5>
		<div v-for="drive in drives" :key="drive.name" class="is-flex is-align-items-center mb-2 pool-drive">
			<div class="is-flex-grow-1">
				<span class="has-text-weight-semibold">{{ drive.name }}</span>
				<span class="has-text-full-04 ml-2">{{ drive.model }} · {{ renderSize(drive.size) }} · {{ drive.type }}</span>
				<b-tag v-if="drive.smart_status === 'failed'" class="ml-2" size="is-small" type="is-danger">{{ $t('SMART failed') }}</b-tag>
			</div>
			<b-tag class="mr-2" size="is-small">{{ roleName(drive.role) }}</b-tag>
			<b-button v-if="drive.verbs.includes('wipe-disk')" rounded size="is-small" type="is-danger is-light" @click="open('wipe-disk', { disk: drive })">{{ $t('Wipe') }}</b-button>
			<b-button v-else-if="drive.verbs.includes('add-disk') && pools.length === 1" rounded size="is-small" @click="open('add-disk', { pool: pools[0], disk: drive })">{{ $t('Add to the pool') }}</b-button>
		</div>

		<!-- a job that ended badly says so -->
		<b-message v-if="failedJob" class="mt-3" type="is-danger">{{ $t('{summary} failed: {error}', { summary: failedJob.summary, error: failedJob.error }) }}</b-message>
	</div>
</template>

<script>
import StoragePlan from './StoragePlan.vue'
import { layoutName, poolTag, poolWorking, survives, verbTitle } from './pools'
import { renderSize } from '@/mixins/file_utils'

// a pool's own actions, shown as buttons under it (members and drives have theirs)
const POOL_VERBS = ['restore-layout', 'add-disk', 'change-layout', 'check', 'cancel-check', 'mount-degraded', 'delete-pool']
const DANGER = ['mount-degraded', 'restore-layout', 'delete-pool']

export default {
	name: 'storage-pool',
	props: {
		// GET /v2/storage's data
		view: {
			type: Object,
			required: true,
		},
	},
	emits: ['changed'],
	computed: {
		pools() {
			return this.view.pools || []
		},
		// the box's own verbs: create-pool where the backend allows another pool
		canCreate() {
			return (this.view.verbs || []).includes('create-pool')
		},
		drives() {
			return this.view.drives || []
		},

		failedJob() {
			const last = (this.view.jobs || []).at(-1)
			return last?.state === 'failed' ? last : null
		},
	},
	methods: {
		renderSize,
		layoutName,
		survives,
		verbTitle,
		tag(pool) {
			return poolTag(pool, this.$t)
		},
		usedPercent(pool) {
			return pool.size ? Math.min(100, Math.floor(pool.used * 100 / pool.size)) : 0
		},
		poolVerbs(pool) {
			return POOL_VERBS.filter(v => this.can(pool, v))
		},
		isDanger(verb) {
			return DANGER.includes(verb)
		},
		can(pool, verb) {
			return Boolean(pool?.verbs?.includes(verb))
		},
		removable(pool, member) {
			return pool.backend !== 'md' || member.state === 'faulty' || member.state === 'spare'
		},
		memberState(member) {
			return {
				active: this.$t('Active'),
				rebuilding: this.$t('Rebuilding'),
				spare: this.$t('Spare'),
				faulty: member.disk ? this.$t('Faulty') : this.$t('Missing'),
			}[member.state] || member.state
		},
		memberType(member) {
			return { active: 'is-success', rebuilding: 'is-warning', spare: 'is-info', faulty: 'is-danger' }[member.state] || ''
		},
		roleName(role) {
			return {
				system: this.$t('System'),
				member: this.$t('In the pool'),
				free: this.$t('Blank'),
				small: this.$t('Too small'),
				foreign: this.$t('Holds other data'),
				busy: this.$t('In use'),
			}[role] || role
		},
		// the plan dialog for a verb, with what is already chosen
		open(verb, { pool = null, member = null, disk = null } = {}) {
			this.$buefy.modal.open({
				component: StoragePlan,
				hasModalCard: true,
				trapFocus: true,
				canCancel: ['escape'],
				props: { verb, pool, drives: this.drives, member, disk },
				events: { applied: () => this.$emit('changed') },
			})
		},
		working() {
			return poolWorking(this.view)
		},
	},
}
</script>

<style lang="scss" scoped>
.pool-members td {
	vertical-align: middle;
	border: none;
}
</style>
