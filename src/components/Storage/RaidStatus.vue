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
			</span>
			<span v-if="array.missing > 0" class="member has-text-danger">{{ $t('Missing: {count}', { count: array.missing }) }}</span>
		</p>
	</div>
</template>

<script>
import { raidLevel, raidRemaining, raidTag } from './raid'

export default {
	name: 'raid-status',
	props: {
		array: {
			type: Object,
			required: true,
		},
	},
	computed: {
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
