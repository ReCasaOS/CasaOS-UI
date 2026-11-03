<template>
	<!-- Enrols a box (or this one) and shows its code; or shows a box's new code. The code is shown once by the
		core, so the dialog keeps it on screen, selectable, until its Close button. -->
	<div class="modal-card add-box-dialog">
		<header class="modal-card-head">
			<h3 class="title is-header">{{ title }}</h3>
		</header>

		<section class="modal-card-body">
			<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">{{ error }}</b-message>

			<template v-if="code">
				<p class="mb-3">{{ $t('Copy this code into the box\'s settings. It is shown once.') }}</p>
				<b-field :label="$t('Enrolment code')">
					<b-input :model-value="code" expanded readonly @focus="$event.target.select()" />
					<p class="control">
						<b-button :label="$t('Copy')" @click="copyCode" />
					</p>
				</b-field>
			</template>

			<template v-else-if="!rotate">
				<b-field :label="$t('Name')">
					<b-input v-model="name" maxlength="64" required />
				</b-field>
				<b-field :label="$t('Dashboard address (optional)')">
					<b-input v-model="url" placeholder="https://" type="url" />
				</b-field>
			</template>

			<b-loading v-else :active="busy" :is-full-page="false" />
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button v-if="code || rotate" :label="$t('Close')" rounded @click="$emit('close')" />
			<template v-else>
				<b-button :label="$t('Cancel')" rounded @click="$emit('close')" />
				<b-button :label="$t('Add')" :loading="busy" rounded type="is-primary" @click="submit" />
			</template>
		</footer>
	</div>
</template>

<script>
import copy from 'clipboard-copy'
import { fleetApi } from '@/service/fleet'

export default {
	name: 'AddBoxDialog',
	props: {
		// enrol the master itself: its name is this dashboard's host
		self: { type: Boolean, default: false },
		// a box to give a new code to ({ id, name }): no form, the code at once
		rotate: { type: Object, default: null },
	},
	emits: ['close', 'added'],
	data() {
		return {
			name: this.self ? window.location.hostname : '',
			url: '',
			code: '',
			error: '',
			busy: false,
		}
	},
	computed: {
		title() {
			if (this.rotate) {
				return this.$t('New code for {name}', { name: this.rotate.name })
			}
			return this.self ? this.$t('Add this box') : this.$t('Add a box')
		},
	},
	mounted() {
		if (this.rotate) {
			this.run(() => fleetApi.rotateCode(this.rotate.id))
		}
	},
	methods: {
		submit() {
			const name = this.name.trim()
			const url = this.url.trim()
			if (!name) {
				this.error = this.$t('Give the box a name')
				return
			}
			if (url && !/^https?:\/\//i.test(url)) {
				this.error = this.$t('The address must start with http')
				return
			}
			this.run(() => fleetApi.addBox({ name, url, self: this.self }))
		},
		// the call that answers { code }: what the core sends is shown as text, never trusted to be a string
		async run(call) {
			this.busy = true
			this.error = ''
			try {
				const code = (await call())?.data?.data?.code
				this.code = typeof code === 'string' ? code : ''
				if (!this.code) {
					this.error = this.$t('Could not be read')
					return
				}
				this.$emit('added')
			} catch (e) {
				this.error = e?.response?.data?.message || e?.message || this.$t('Could not be read')
			} finally {
				this.busy = false
			}
		},
		copyCode() {
			Promise.resolve().then(() => copy(this.code)).then(
				() => this.$buefy.toast.open({ message: this.$t('Copied to clipboard'), type: 'is-success', queue: false }),
				() => this.$buefy.toast.open({ message: this.$t('Copy failed: select the code and copy it by hand'), type: 'is-warning', queue: false }),
			)
		},
	},
}
</script>
