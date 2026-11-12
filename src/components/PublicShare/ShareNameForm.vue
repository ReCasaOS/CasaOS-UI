<template>
	<form class="share-name-form" @submit.prevent="claim">
		<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">{{ error }}</b-message>
		<b-field>
			<b-input name="share-name" :model-value="name" :aria-label="$t('Choose the name of this box')" maxlength="32" :has-counter="false" autocomplete="off" @update:model-value="v => (name = v.toLowerCase())" />
		</b-field>
		<div class="is-flex is-align-items-center mb-3">
			<label class="checkbox is-flex is-align-items-center">
				<input v-model="accepted" class="mr-2" type="checkbox">
				{{ $t('By turning it on, you accept the terms of service of Let\'s Encrypt.') }}
			</label>
			<a class="ml-2 is-size-7" :href="publicShare.status?.tos_url" target="_blank" rel="noopener noreferrer">{{ $t('Read the terms') }}</a>
		</div>
		<b-button :disabled="!valid || busy" :loading="busy" native-type="button" rounded size="is-small" type="is-primary" @click="claim">{{ $t('Choose this name') }}</b-button>
	</form>
</template>

<script>
import { BOX_NAME, shareErrorText } from './shareWords'
import { apply, publicShare, publicShareApi } from '@/service/publicShare'

export default {
	name: 'ShareNameForm',
	emits: ['claimed'],
	data() {
		return { name: '', accepted: false, busy: false, error: '', publicShare }
	},
	computed: {
		valid() {
			return BOX_NAME.test(this.name) && this.accepted
		},
	},
	methods: {
		async claim() {
			if (!this.valid || this.busy) {
				return
			}
			this.busy = true
			this.error = ''
			try {
				await apply(publicShareApi.setName(this.name))
				this.$emit('claimed')
			} catch (e) {
				this.error = shareErrorText(e, this.$t)
			} finally {
				this.busy = false
			}
		},
	},
}
</script>
