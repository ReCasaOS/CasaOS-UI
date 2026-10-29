<template>
	<div class="storage-pool">
		<!-- the pool -->
		<div v-if="pool" class="background-item mb-4 pb-3 pt-3 pl-3 pr-3">
			<div class="is-flex is-align-items-center">
				<div class="is-flex-grow-1">
					<h4 class="title is-5 mb-1">{{ pool.name }}</h4>
					<p class="has-text-full-04">
						{{ pool.layout_known ? layoutName(pool.layout, $t) : pool.profile }} · {{ survives(pool.tolerates, $t) }}
					</p>
				</div>
				<b-tag :type="tag.type" class="pool-tag">{{ tag.text }}</b-tag>
			</div>
			<template v-if="pool.mounted && pool.size">
				<b-progress :value="usedPercent" class="mt-3 mb-1" size="is-small" type="is-primary"></b-progress>
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
							<b-button v-if="can('replace-disk')" rounded size="is-small" @click="open('replace-disk', { member })">{{ $t('Replace') }}</b-button>
							<b-button v-if="can('remove-disk') && removable(member)" class="ml-1" rounded size="is-small" @click="open('remove-disk', { member })">{{ $t('Take out') }}</b-button>
						</td>
					</tr>
				</tbody>
			</table>

			<!-- what can be done -->
			<div class="buttons mt-2">
				<b-button v-for="verb in poolVerbs" :key="verb" :type="verb === 'mount-degraded' || verb === 'restore-layout' ? 'is-danger' : ''" rounded size="is-small"
					@click="open(verb)">
					{{ verbTitle(verb, $t) }}
				</b-button>
			</div>
		</div>

		<div v-else class="has-text-centered mt-5 mb-5">
			<p class="has-text-grey-light mb-3">{{ $t('No pool yet: make one from blank disks.') }}</p>
			<b-button :disabled="!freeDrives.length" rounded type="is-primary" @click="open('create-pool')">{{ verbTitle('create-pool', $t) }}</b-button>
		</div>

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
			<b-button v-else-if="drive.verbs.includes('add-disk')" rounded size="is-small" @click="open('add-disk', { disk: drive })">{{ $t('Add to the pool') }}</b-button>
		</div>

		<!-- a job that ended badly says so -->
		<b-message v-if="failedJob" class="mt-3" type="is-danger">{{ $t('{summary} failed: {error}', { summary: failedJob.summary, error: failedJob.error }) }}</b-message>
	</div>
</template>

<script>
import StoragePlan from './StoragePlan.vue'
import { layoutName, poolTag, poolWorking, survives, verbTitle } from './pools'
import { renderSize } from '@/mixins/file_utils'

// the pool's own actions, shown as buttons under it (members and drives have theirs)
const POOL_VERBS = ['restore-layout', 'add-disk', 'change-layout', 'check', 'cancel-check', 'mount-degraded']

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
		pool() {
			return this.view.pool
		},
		drives() {
			return this.view.drives || []
		},
		freeDrives() {
			return this.drives.filter(d => d.role === 'free')
		},
		tag() {
			return poolTag(this.pool, this.$t)
		},
		usedPercent() {
			return this.pool.size ? Math.min(100, Math.floor(this.pool.used * 100 / this.pool.size)) : 0
		},
		poolVerbs() {
			return POOL_VERBS.filter(v => this.can(v))
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
		can(verb) {
			return Boolean(this.pool?.verbs?.includes(verb))
		},
		removable(member) {
			return this.pool.backend !== 'md' || member.state === 'faulty' || member.state === 'spare'
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
		open(verb, { member = null, disk = null } = {}) {
			this.$buefy.modal.open({
				component: StoragePlan,
				hasModalCard: true,
				trapFocus: true,
				canCancel: ['escape'],
				props: { verb, pool: this.pool, drives: this.drives, member, disk },
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
