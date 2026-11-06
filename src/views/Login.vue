<template>
	<div id="login-page" class="is-flex is-justify-content-center is-align-items-center ">
		<div v-if="!isLoading" class="login-panel step4 is-shadow">
			<div class="is-flex is-justify-content-center pb-3 ">
				<div class="has-text-centered">
					<b-image :src-fallback="require('@/assets/img/account/default-avatar.svg')" src="/v1/users/image?path=/var/lib/casaos/1/avatar.png" class="is-128x128" rounded></b-image>
				</div>

			</div>
			<b-notification v-model="notificationShow" aria-close-label="Close notification" auto-close role="alert"
				type="is-danger">
				{{ message }}
			</b-notification>
			<VeeForm v-if="!preAuth" v-slot="{ handleSubmit }" as="span">
				<VeeField v-slot="{ errors, meta }" :model-value="username" name="User" rules="required">
					<b-field :label="$t('Username')" :message="errors"
						:type="{ 'is-danger': errors[0], 'is-success': meta.valid }"
						class="mt-3">
						<b-input v-model="username" :autofocus="!username" type="text" @keyup.enter="handleSubmit(login)"></b-input>
					</b-field>
				</VeeField>
				<VeeField v-slot="{ errors, meta }" :model-value="password" name="Password" rules="required|min:5">
					<b-field :label="$t('Password')" :message="errors"
						:type="{ 'is-danger': errors[0], 'is-success': meta.valid }" class="mt-2">
						<b-input v-model="password" :autofocus="username" password-reveal
							type="password" @keyup.enter="handleSubmit(login)"></b-input>
					</b-field>
				</VeeField>
				<b-button class="mt-5" expanded rounded type="is-primary" @click="handleSubmit(login)">{{ $t('Login') }}
				</b-button>
			</VeeForm>
			<template v-else>
				<b-field :label="useRecovery ? $t('Recovery code') : $t('Authentication code')" class="mt-3">
					<b-input v-if="useRecovery" v-model="code" autocomplete="off" autofocus type="text" @keyup.enter="verify"></b-input>
					<b-input v-else v-model="code" :has-counter="false" autocomplete="one-time-code" autofocus inputmode="numeric" maxlength="6" type="text" @keyup.enter="verify"></b-input>
				</b-field>
				<a class="is-size-7" @click="toggleRecovery">{{ useRecovery ? $t('Use a code from your app instead') : $t('Use a recovery code instead') }}</a>
				<b-button class="mt-5" expanded rounded type="is-primary" @click="verify">{{ $t('Verify') }}
				</b-button>
				<div class="has-text-centered mt-3">
					<a @click="cancelPreAuth">{{ $t('Back') }}</a>
				</div>
			</template>
		</div>
	</div>
</template>

<script>
import { Field as VeeField, Form as VeeForm } from 'vee-validate'
import { afterLogin } from '@/router/afterLogin'

export default {

	name: 'login-page',
	components: {
		VeeField,
		VeeForm,
	},
	data() {
		return {
			username: '',
			password: '',
			isLoading: false,
			message: '',
			notificationShow: false,
			// The pre-auth token lives here only: it is not a session.
			preAuth: null,
			code: '',
			useRecovery: false,
		}
	},
	beforeMount() {
		const userString = localStorage.getItem('user')
		if (userString) {
			const name = JSON.parse(userString).username || ''
			this.username = name
		}
	},
	mounted() {
		document.querySelector('.modal.is-active ')?.remove()
	},

	methods: {
		async login() {
			try {
				const userRes = await this.$api.users.login(this.username, this.password)
				if (userRes.data.success === 10014) {
					this.preAuth = userRes.data.data
					this.code = ''
					this.useRecovery = false
					this.focusInput()
					return
				}
				await this.finishLogin(userRes.data.data)
			} catch (err) {
				this.showError(err)
			}
		},
		async verify() {
			if (!this.code) {
				return
			}
			if (Date.now() / 1000 > this.preAuth.expires_at) {
				this.cancelPreAuth()
				this.message = this.$t('The code has expired, please log in again')
				this.notificationShow = true
				return
			}
			const body = { pre_auth_token: this.preAuth.pre_auth_token }
			body[this.useRecovery ? 'recovery_code' : 'code'] = this.code
			try {
				const res = await this.$api.users.verify2FA(body)
				await this.finishLogin(res.data.data)
			} catch (err) {
				const code = err.response?.data?.success
				if (code === 20006) {
					this.cancelPreAuth()
				} else if (code === 10015) {
					this.code = ''
				}
				this.showError(err)
			}
		},
		cancelPreAuth() {
			this.preAuth = null
			this.code = ''
			this.useRecovery = false
			this.focusInput('input[type="password"]')
		},
		toggleRecovery() {
			this.useRecovery = !this.useRecovery
			this.code = ''
			this.focusInput()
		},
		// A field swapped in after a click never gets the browser's autofocus.
		focusInput(selector = 'input') {
			this.$nextTick(() => {
				const input = this.$el.querySelector(selector)
				if (input)
					input.focus()
			})
		},
		async finishLogin(data) {
			localStorage.setItem('access_token', data.token.access_token)
			localStorage.setItem('refresh_token', data.token.refresh_token)
			localStorage.setItem('expires_at', data.token.expires_at)
			localStorage.setItem('user', JSON.stringify(data.user))

			this.$store.commit('SET_USER', data.user)
			this.$store.commit('SET_ACCESS_TOKEN', data.token.access_token)
			this.$store.commit('SET_REFRESH_TOKEN', data.token.refresh_token)

			// Straight to the dashboard. This used to await the system version first
			// and store it for the router guard: the session was already written, so
			// a version call that failed threw out of here BEFORE the navigation and
			// left the person on the login page looking at an error, signed in and
			// not knowing it. The minute after an update is precisely when the core
			// is still restarting and that call fails, and signing in again once it
			// answered is what made an update cost two logins.
			this.$router.push(afterLogin(this.$route?.query?.redirect))
		},
		showError(err) {
			this.message = this.$t(err.response?.data?.message || err.message)
			this.notificationShow = true
		},
	},
}
</script>

<style lang="scss">
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
</style>
