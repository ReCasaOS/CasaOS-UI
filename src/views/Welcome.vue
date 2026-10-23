<!--
  * @LastEditors: zhanghengxin ezreal.zhang@icewhale.org
  * @LastEditTime: 2022/12/1 下午8:02
  * @FilePath: /CasaOS-UI/src/views/Welcome.vue
  * @Description:
  *
  * Copyright (c) 2022 by IceWhale, All Rights Reserved.
  -->

<template>
	<div id="login-page" class="is-flex is-justify-content-center is-align-items-center">
		<div v-if="!isLoading" v-animate-css="initAni" :class="`step${step}`" class="login-panel is-shadow">

			<div v-if="step == 1" class="has-text-centered">
				<div v-animate-css="s1Ani" class=" is-flex is-justify-content-center">
					<!-- The same mark twice: navy ink for the light panel, white for the dark one. -->
					<b-image :src="require('@/assets/img/logo/casa-dark.svg')" class="is-128x128 mb-4 logo-on-light"></b-image>
					<b-image :src="require('@/assets/img/logo/casa-light.svg')" class="is-128x128 mb-4 logo-on-dark"></b-image>
				</div>

				<h2 v-animate-css="s2Ani" class="title is-2 mb-5 has-text-centered __attached_title">{{
					$t('Welcome to CasaOS')
				}}</h2>
				<!-- the core creates the first account only on the machine ([app] FirstAdmin = local) -->
				<h2 v-if="$store.state.firstAdmin === 'local'" v-animate-css="s3Ani" class="subtitle has-text-centered __attached_sub_title">{{
					$t('The first account is created on the machine itself. Once it exists, reload this page to sign in.')
				}}</h2>
				<template v-else>
					<h2 v-animate-css="s3Ani" class="subtitle  has-text-centered __attached_sub_title">{{
						$t(`Let's create your initial account`)
					}}</h2>
					<b-button v-animate-css="s4Ani" class="mt-2" rounded type="is-primary" @click="goToStep(2)">{{
						$t(`Go →`)
					}}
					</b-button>
				</template>
			</div>

			<div v-if="step == 2">
				<h2 class="title is-3  has-text-centered">{{ $t('Create Account') }}</h2>
				<div class="is-flex is-justify-content-center ">
					<div class="has-text-centered">
						<b-image :src="require('@/assets/img/account/default-avatar.svg')" class="is-128x128"
							rounded></b-image>
					</div>
				</div>
				<VeeForm v-slot="{ handleSubmit }" as="span">
					<VeeField v-slot="{ errors, meta }" :model-value="username" name="User" rules="required">
						<b-field :label="$t('Username')" :message="errors"
							:type="{ 'is-danger': errors[0], 'is-success': meta.valid }">
							<b-input v-model="username" type="text"
								@keyup.enter="handleSubmit(register)"></b-input>
						</b-field>
					</VeeField>
					<VeeField v-slot="{ errors, meta }" :model-value="password" name="password"
						rules="required|min:5">
						<b-field :label="$t('Password')" :message="errors"
							:type="{ 'is-danger': errors[0], 'is-success': meta.valid }"
							class="mt-4">
							<b-input v-model="password" password-reveal type="password"
								@keyup.enter="handleSubmit(register)"></b-input>
						</b-field>
					</VeeField>
					<VeeField v-slot="{ errors, meta }" :model-value="confirmation" name="Password Confirmation"
						rules="required|confirmed:@password">
						<b-field :label="$t('Confirm Password')" :message="errors"
							:type="{ 'is-danger': errors[0], 'is-success': meta.valid }" class="mt-4">
							<b-input v-model="confirmation" password-reveal type="password"
								@keyup.enter="handleSubmit(register)"></b-input>
						</b-field>
					</VeeField>
					<b-button class="mt-5" expanded rounded type="is-primary" @click="handleSubmit(register)">
						{{ $t('Create') }}
					</b-button>
				</VeeForm>
			</div>

			<div v-if="step == 3" class="has-text-centered ">
				<h2 class="title is-3  has-text-centered">{{ $t('All things done!') }}</h2>
				<div class="is-flex is-align-items-center is-justify-content-center">
					<lottie-animation :animation-data="require('@/assets/ani/done.json')" :auto-play="true" :loop="false"
						class="animation" @complete="complete"></lottie-animation>
				</div>
			</div>
		</div>
	</div>
</template>

<script>
import { Field as VeeField, Form as VeeForm } from 'vee-validate'
import LottieAnimation from 'lottie-web-vue'
import smoothReflow from '@/mixins/smoothReflow'

export default {

	name: 'welcome-page',
	mixins: [smoothReflow],
	data() {
		return {
			step: 1,
			username: '',
			password: '',
			confirmation: '',
			isLoading: true,
			isLogin: false,
			message: '',
			notificationShow: false,
			initAni: {
				classes: 'zoomIn',
				delay: 1000,
				duration: 700,
			},
			s1Ani: {
				classes: 'fadeInUp',
				delay: 1300,
				duration: 700,
			},
			s2Ani: {
				classes: 'fadeInUp',
				delay: 1700,
				duration: 700,
			},
			s3Ani: {
				classes: 'fadeInUp',
				delay: 1900,
				duration: 700,
			},
			s4Ani: {
				classes: 'fadeIn',
				delay: 2500,
				duration: 700,
			},
		}
	},
	components: {
		VeeField,
		VeeForm,
		LottieAnimation,
	},

	mounted() {
		this.$smoothReflow({
			el: '.login-panel',
			property: ['height', 'width'],
		})
		this.isLoading = false
	},

	methods: {
		/**
		 * @description: register
		 * @return {*}
		 */
		register() {
			const initKey = this.$store.state.initKey
			this.$api.users.register(this.username, this.password, initKey).then((res) => {
				if (res.data.success == 200) {
					this.login().then(() => {
						// First login set default app order
						this.$api.users.setCustomStorage('app_order', { data: ['App Store', 'Files'] })
					})
					this.goToStep(3)
				}
			}).catch((err) => {
				this.$buefy.toast.open({
					message: err.response.data.message,
					type: 'is-danger',
					position: 'is-top',
					duration: 5000,
					queue: false,
				})
			})
		},

		/**
		 * @description: login
		 * @return {*}
		 */
		async login() {
			const userRes = await this.$api.users.login(this.username, this.password)
			if (userRes.data.success == 200) {
				localStorage.setItem('access_token', userRes.data.data.token.access_token)
				localStorage.setItem('refresh_token', userRes.data.data.token.refresh_token)
				localStorage.setItem('expires_at', userRes.data.data.token.expires_at)
				localStorage.setItem('user', JSON.stringify(userRes.data.data.user))

				this.$store.commit('SET_NEED_INITIALIZATION', false)
				this.$store.commit('SET_INIT_KEY', '')
				this.$store.commit('SET_USER', userRes.data.data.user)
				this.$store.commit('SET_ACCESS_TOKEN', userRes.data.data.token.access_token)
				this.$store.commit('SET_REFRESH_TOKEN', userRes.data.data.token.refresh_token)

				// no version fetch here either: nothing reads that key, and awaiting it
				// between storing the session and finishing put a first install one
				// failed request away from stopping half-done
				sessionStorage.setItem('fromWelcome', true)
				this.isLogin = true
			} else {
				this.isLogin = false
				this.message = this.$t('Username or Password error!')
				this.notificationShow = true
			}
		},
		goToStep(step) {
			this.step = step
		},
		complete() {
			if (this.isLogin) {
				this.$router.push('/')
			} else {
				this.$router.push('/login')
			}
		},
	},
}
</script>

<style lang="scss">
.animation {
	width: 120px;
	height: 120px;
}

#login-page {
	height: calc(100% - 5.5rem);
	position: relative;
	z-index: 500;

	.login-panel {
		text-align: left;
		background: var(--casa-frost);
		backdrop-filter: blur(1rem);
		border-radius: 8px;
		padding: 2.5rem 4rem;

		.label {
			color: #dfdfdf;
		}

		.input {
			background: var(--casa-frost-input);
			border-color: transparent;
		}

		&.step1 {
			padding: 4rem 6rem;
		}

		&.step2 {
			padding: 2.5rem 4rem;
			width: 32rem;
		}

		&.step3 {
			padding: 4rem 8rem;
		}

		&.step4 {
			width: 28rem;
		}
	}
}

@media screen and (max-width: 480px) {
	.login-panel {
		text-align: left;
		background: var(--casa-frost);
		backdrop-filter: blur(1rem);
		border-radius: 8px;
		margin: 0 2rem;
		padding: 2rem !important;

		.label {
			color: #dfdfdf;
		}

		.input {
			background: var(--casa-frost-input);
			border-color: transparent;
		}

		.is-128x128 {
			height: 96px;
			width: 96px;
		}

		.is-3 {
			font-size: 1.5rem;
		}

		&.step1 {
			.is-2 {
				font-size: 1.5rem;
			}

			.subtitle {
				font-size: 1rem;
			}
		}

		&.step3 {
			padding: 4rem !important;
		}
	}
}

// Temporary
.__attached_title {
	// former color.Not in existing architecture.
	color: var(--casa-frost-heading);
}

.__attached_sub_title {
	color: var(--casa-frost-heading-dim);
}

html[data-theme='dark'] .logo-on-light,
html[data-theme='light'] .logo-on-dark {
	display: none;
}

.__op60 {
	opacity: 0.6;
}
</style>
