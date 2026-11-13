<template>
	<div class="relay-join-card">
		<p class="_name">{{ $t('Join the community protection') }}</p>
		<p class="is-size-7 _has-text-gray">{{ $t('Your box sends the relay the addresses it bans: the address, the reason and the app, nothing else. In return, addresses banned by several networks are cut before they reach you.') }}</p>
		<p v-if="relay.community_size > 0" class="is-size-7">{{ $t('{n} addresses already blocked by the community', { n: relay.community_size }) }}</p>
		<p v-if="waves.length > 0" class="is-size-7 relay-waves">{{ $t('These addresses could have been cut at the relay before reaching your box.') }}</p>
		<b-button class="relay-join" type="is-primary" size="is-small" @click="ask">{{ $t('Join the community protection') }}</b-button>
		<!-- closing it any way but "I agree" does nothing -->
		<b-modal v-if="open" :model-value="true" has-modal-card trap-focus aria-role="dialog" aria-modal @close="close">
			<div class="modal-card" style="width: auto">
				<header class="modal-card-head"><p class="modal-card-title">{{ $t('Join the community protection') }}</p></header>
				<section class="modal-card-body">
					<p class="mb-2">{{ $t('What is sent: for each address your box bans, the address, the reason (OWASP rules, scan, request limit, access code) and the app.') }}</p>
					<p class="mb-2">{{ $t('What is never sent: pages visited, headers, codes, the addresses you block or allow yourself.') }}</p>
					<p class="mb-2">{{ $t('An address is cut for everyone only when boxes of two different owners banned it within 24 hours. The relay keeps reports 30 days.') }}</p>
					<p class="mb-3">{{ $t('You can stop at any time; your reports are then deleted from the relay.') }}</p>
					<b-checkbox v-model="agreed" class="relay-agree">{{ $t('I agree that this box sends the addresses it bans to the relay') }}</b-checkbox>
				</section>
				<footer class="modal-card-foot">
					<b-button class="relay-cancel" @click="close">{{ $t('Cancel') }}</b-button>
					<b-button class="relay-agree-go" type="is-primary" :disabled="!agreed || busy" @click="join">{{ $t('I agree') }}</b-button>
				</footer>
			</div>
		</b-modal>
	</div>
</template>

<script>
export default {
	name: 'RelayJoin',
	props: {
		relay: { type: Object, required: true },
		waves: { type: Array, default: () => [] },
		busy: { type: Boolean, default: false },
	},
	emits: ['join'],
	data() {
		return { open: false, agreed: false }
	},
	methods: {
		ask() {
			this.agreed = false
			this.open = true
		},
		close() {
			this.open = false
		},
		join() {
			this.open = false
			this.$emit('join')
		},
	},
}
</script>

<style lang="scss" scoped>
.relay-join-card {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 0.375rem;
	padding: 0.75rem;
	border-radius: 0.75rem;
	background: var(--casa-hover-tint);

	._name {
		font-weight: 600;
		color: var(--casa-text-strong);
	}
}
</style>
