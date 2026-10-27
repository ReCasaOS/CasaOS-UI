<template>
	<div class="raid-status has-text-full-04">
		<p class="is-flex is-align-items-center is-flex-wrap-wrap">
			<b-tag :type="tag.type" class="mr-2">{{ tag.text }}</b-tag>
			<span class="mr-2">{{ title }}</span>
			<span v-if="remaining" class="has-text-grey-light">{{ remaining }}</span>
		</p>
		<p class="mt-1 is-flex is-flex-wrap-wrap is-align-items-center">
			<span v-for="member in array.members" :key="member.name" class="member mr-3">
				{{ member.disk }}
				<span v-if="member.state !== 'active'" :class="member.state === 'faulty' ? 'has-text-danger' : 'has-text-grey-light'">
					({{ memberState(member.state) }})
				</span>
				<a v-if="member.state === 'faulty'" class="ml-1 is-underlined" @click="confirmTakeOut(member)">{{ $t('Take out') }}</a>
			</span>
			<span v-if="array.missing > 0" class="member has-text-danger mr-3">{{ $t('Missing: {count}', { count: array.missing }) }}</span>
			<b-button v-if="canAdd" class="mt-1" rounded size="is-small" @click="openAddDisk">{{ $t('Add a disk') }}</b-button>
		</p>
	</div>
</template>

<script>
import escape from 'lodash/escape'
import RaidAddDisk from './RaidAddDisk.vue'
import { raidLevel, raidRemaining, raidTag } from './raid'

export default {
	name: 'raid-status',
	props: {
		array: {
			type: Object,
			required: true,
		},
	},
	// changed: a disk was added or taken out; the list is to be read again
	emits: ['changed'],
	computed: {
		// where a disk is missing, or a failed one is still in the array (the new one waits as a spare)
		canAdd() {
			return this.array.state !== 'inactive' && (this.array.missing > 0 || this.array.members.some(m => m.state === 'faulty'))
		},
		tag() {
			return raidTag(this.array, this.$t)
		},
		title() {
			return `${raidLevel(this.array.level)} · ${this.array.name}`
		},
		remaining() {
			return this.array.action === 'idle' ? '' : raidRemaining(this.array.remaining, this.$t)
		},
	},
	methods: {
		openAddDisk() {
			this.$buefy.modal.open({
				parent: this,
				component: RaidAddDisk,
				props: { array: this.array },
				hasModalCard: true,
				trapFocus: true,
				events: { added: () => this.$emit('changed') },
			})
		},
		confirmTakeOut(member) {
			this.$buefy.dialog.confirm({
				title: escape(this.$t('Take {disk} out of {name}?', { disk: member.disk, name: this.array.name })),
				message: escape(this.$t('It has failed: the array goes on with its other disks. You can then unplug it.')),
				confirmText: this.$t('Take out'),
				type: 'is-danger',
				hasIcon: true,
				onConfirm: () => this.takeOut(member),
			})
		},
		async takeOut(member) {
			try {
				await this.$api.disks.removeFromRaid(this.array.name, member.name)
				this.$buefy.toast.open({ message: escape(this.$t('{disk} is taken out of {name}.', { disk: member.disk, name: this.array.name })), type: 'is-success' })
				this.$emit('changed')
			} catch (e) {
				this.$buefy.toast.open({ message: escape(e?.response?.data?.message || String(e)), type: 'is-danger' })
			}
		},
		memberState(state) {
			return { rebuilding: this.$t('Rebuilding'), spare: this.$t('Spare'), faulty: this.$t('Faulty') }[state] || state
		},
	},
}
</script>

<style lang="scss" scoped>
.member {
	white-space: nowrap;
}
</style>
