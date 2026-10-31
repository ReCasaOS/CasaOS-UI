<template>
	<div class="raid-status has-text-full-04">
		<p class="is-flex is-align-items-center is-flex-wrap-wrap">
			<b-tag :type="tag.type" class="mr-2">{{ tag.text }}</b-tag>
			<b-tag v-if="array.level === 'raid0'" class="mr-2" type="is-warning">{{ $t('No protection') }}</b-tag>
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
			<b-button v-if="canChange" class="mt-1" rounded size="is-small" @click="openChange">{{ $t('Change to RAID 5') }}</b-button>
			<b-button v-if="roomLeft" :loading="isGrowing" class="mt-1" rounded size="is-small" type="is-link" @click="growFilesystem">{{ $t('Use the new space') }}</b-button>
		</p>
	</div>
</template>

<script>
import escape from 'lodash/escape'
import RaidAddDisk from './RaidAddDisk.vue'
import RaidToRaid5 from './RaidToRaid5.vue'
import { raidCanBecomeRaid5, raidLevel, raidRemaining, raidRoomLeft, raidTag } from './raid'

export default {
	name: 'raid-status',
	props: {
		array: {
			type: Object,
			required: true,
		},
		// the size of the filesystem mounted on the array, when there is one: more room in the array than in it is room to use
		fsSize: {
			type: Number,
			default: 0,
		},
	},
	// changed: a disk was added or taken out, the level changed; the list is to be read again
	emits: ['changed'],
	data() {
		return { isGrowing: false }
	},
	computed: {
		canChange() {
			return raidCanBecomeRaid5(this.array)
		},
		roomLeft() {
			return raidRoomLeft(this.array, this.fsSize)
		},
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
				component: RaidAddDisk,
				props: { array: this.array },
				hasModalCard: true,
				trapFocus: true,
				events: { added: () => this.$emit('changed') },
			})
		},
		openChange() {
			this.$buefy.modal.open({
				component: RaidToRaid5,
				props: { array: this.array },
				hasModalCard: true,
				trapFocus: true,
				events: { changed: () => this.$emit('changed') },
			})
		},
		async growFilesystem() {
			this.isGrowing = true
			try {
				await this.$api.disks.growRaidFilesystem(this.array.name)
				this.$buefy.toast.open({ message: escape(this.$t('The filesystem now uses the room of {name}.', { name: this.array.name })), type: 'is-success' })
				this.$emit('changed')
			} catch (e) {
				this.$buefy.toast.open({ message: escape(e?.response?.data?.message || String(e)), type: 'is-danger' })
			} finally {
				this.isGrowing = false
			}
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
