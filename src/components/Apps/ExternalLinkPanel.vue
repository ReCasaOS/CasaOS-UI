<template>
	<div class="modal-card">
		<!-- Modal-Card Header Start -->
		<header class="modal-card-head">
			<div class="is-flex-grow-1">
				<h3 class="title is-header">
					{{ panelTitle }}
				</h3>
			</div>
			<b-icon class="close-button" icon="close-outline" pack="casa" @click="$emit('close');" />
		</header>
		<!-- Modal-Card Header End -->
		<!-- Modal-Card Body Start -->
		<section class="modal-card-body ">
			<div class="node-card">
				<div class="mb-0">
					<VeeForm ref="ob1" as="span">
						<VeeField v-slot="{ errors, meta }" :model-value="hostname" name="hostname" rules="required">
							<b-field :message="errors" :type="{ 'is-danger': errors[0], 'is-success': meta.valid }"
								class="is-flex-wrap-nowrap">
								<template #label>
									{{ $t('Address') }}
									<label style="color:red">*</label>
								</template>
								<b-autocomplete ref="inputs" v-model="hostname" :data="filteredDataObj"
									:placeholder="$t('Local URL,Pblic URL')" append-to-body field="hostname"
									max-height="120px" open-on-focus />
							</b-field>
						</VeeField>

						<div v-if="!state_hostIsExist" class="message-alert is-flex is-align-items-center">
							<div class="left mr-2 is-flex is-align-items-center">
								<b-icon icon="danger" pack="casa" />
							</div>
							<div class="main is-flex is-align-items-center">
								{{ $t('Eg: //192.168.1.1:5000 or https://www.google.com') }}
							</div>
						</div>

						<VeeField v-slot="{ errors, meta }" :model-value="name" name="appName" rules="required">
							<b-field :message="errors" :type="{ 'is-danger': errors[0], 'is-success': meta.valid }"
								class="is-flex-wrap-nowrap">
								<template #label>
									{{ $t('App Name') }}
									<label style="color:red">*</label>
								</template>
								<b-input v-model="name" :disabled="disableEditName"
									:placeholder="$t('Customize your APP name')" max-height="120px" />
							</b-field>
						</VeeField>

						<b-field :label="$t('Icon URL')">
							<p class="control">
								<span class="button is-static container-icon">
									<b-image :key="icon" :src="icon" :src-fallback="require('@/assets/img/app/default.svg')"
										class="is-32x32" ratio="1by1" />
								</span>
							</p>
							<b-input v-model="icon" :placeholder="$t('Your custom icon URL')" expanded />
						</b-field>
					</VeeForm>
				</div>
			</div>
		</section>
		<!-- Modal-Card Body End -->
		<!-- Modal-Card Footer Start -->
		<footer class="modal-card-foot is-flex is-align-items-center">
			<div class="is-flex-grow-1"></div>
			<div>
				<b-button :label="$t('Connect')" :loading="isLoading" expaned rounded type="is-primary" @click="connect" />
			</div>
		</footer>
		<!-- Modal-Card Footer End -->
	</div>
</template>

<script>
import { Field as VeeField, Form as VeeForm } from 'vee-validate'
import escape from 'lodash/escape'
import smoothReflow from '@/mixins/smoothReflow'
import Business_ShowNewAppTag from '@/mixins/app/Business_ShowNewAppTag'
import Business_LinkApp from '@/mixins/app/Business_LinkApp'

export default {
	components: { VeeField, VeeForm },
	mixins: [smoothReflow, Business_ShowNewAppTag, Business_LinkApp],
	props: {
		linkName: {
			type: String,
			default: '',
		},
		linkHost: {
			type: String,
			default: '',
		},
		linkIcon: {
			type: String,
			default: '',
		},
	},
	data() {
		return {
			hostname: '',
			name: '',
			title: {
				en_us: '',
			},
			icon: '',
			isLoading: false,
		}
	},
	computed: {
		filteredDataObj() {
			return this.$store.state.networkStorage
		},
		state_hostIsExist() {
			return this.hostname !== ''
		},
		panelTitle() {
			if (this.linkName === '') {
				return this.$t('Add External Link/APP')
			} else {
				return this.$t('Set External Link/APP')
			}
		},
		disableEditName() {
			return !!this.linkName
		},
	},
	watch: {},
	created() {
		this.hostname = this.linkHost || 'http://'
		this.name = this.linkName
		this.icon = this.linkIcon
	},

	mounted() {
		this.$nextTick(() => {
			this.$refs.inputs.focus()
		})
	},
	methods: {
		/**
		 * @description: Validate form async
		 * @param {object} ref ref of component
		 * @return {boolean}
		 */
		async checkStep(ref) {
			// vee-validate 3 resolves to a Boolean, v4 to { valid, ... } — and an
			// object is always truthy, so read `.valid` whenever it is there.
			const result = await ref.validate()
			return result?.valid ?? result
		},

		connect() {
			this.isLoading = true
			this.checkStep(this.$refs.ob1).then(async (valid) => {
				if (valid) {
					let listLinkApp = await this.getLinkAppList()
					if (!listLinkApp.find((item) => {
						if (item.name === this.name) {
							item.hostname = this.hostname
							item.icon = this.icon
							return true
						}
						return false
					})) {
						listLinkApp = listLinkApp.concat({
							hostname: this.hostname,
							name: this.name,
							icon: this.icon,
							app_type: 'LinkApp',
							status: 'running',
						})
						this.addIdToSessionStorage(this.name)
					}
					this.saveLinkApp(listLinkApp)
				}
			})
		},

		getLinkAppByHost() {
			this.$api.sys.getProxyRequestContent(this.hostname).then((res) => {
				this.isLoading = false
				if (res.status == 200) {
					this.name = ''
					this.icon = require('@/assets/img/app/default.svg')
				} else {
					this.$buefy.toast.open({
						message: escape(res.data.message),
						type: 'is-warning',
					})
				}
			}).catch((err) => {
				this.isLoading = false
				this.$buefy.toast.open({
					message: escape(err.response.data.message || 'NOT FOUND'),
					type: 'is-danger',
				})
			})
		},

		saveLinkApp(data) {
			const json = JSON.stringify(data)
			this.$api.users.saveLinkAppDetail(json).then((res) => {
				this.isLoading = false
				if (res.data.success == 200) {
					let stor = res.data.data
					if (stor === '') {
						stor = []
					}
					this.$emit('updateState')
					this.$emit('close')
				} else {
					this.$buefy.toast.open({
						message: escape(res.data.message),
						type: 'is-warning',
					})
				}
			}).catch((err) => {
				this.isLoading = false
				this.$buefy.toast.open({
					message: escape(err.response.data.message || 'NOT FOUND'),
					type: 'is-danger',
				})
			})
		},

	},
}
</script>

<style lang="scss" scoped>
.modal-card {
    max-width: 40rem;
}

.modal-card-body {
    overflow-y: hidden;
}

.message-alert {
    padding: 0.4rem 1rem;
    margin-bottom: 1.75rem;
    background: var(--casa-warning-tint);
    border-radius: 4px;
    color: #d99000;
    font-size: 0.875rem;
}
</style>

<style lang="scss">
.network-storage-modal {
    .field-label {
        text-align: left;
    }
}

.smb-media {
    color: #999;
}
</style>
