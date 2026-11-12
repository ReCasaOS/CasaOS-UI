<template>
	<!-- The new login page (beta, opt-in in the settings menu): one card over the
		wallpaper, the greeting top left, the logo on the right, the form at the
		bottom with the arrow beside it; on a phone a column. Same sign-in, 2FA
		and messages as the classic page below. -->
	<div v-if="loginStyle === 'beta'" id="login-page" class="login-beta">
		<div class="login-card">
			<h1 class="login-greeting">
				{{ $t('Welcome back to ReCasaOS') }}
			</h1>

			<div class="login-logo">
				<img :src="require('@/assets/img/logo/casa-dark.svg')" alt="ReCasaOS">
			</div>

			<div class="login-form">
				<b-notification v-model="notificationShow" aria-close-label="Close notification" auto-close
					class="login-error" role="alert" type="is-danger">
					{{ message }}
				</b-notification>

				<VeeForm v-if="!preAuth" v-slot="{ handleSubmit }" as="div" class="login-row">
					<div class="login-fields login-credentials">
						<VeeField v-slot="{ errors }" :model-value="username" name="User" rules="required">
							<b-field :message="fieldMessage('username', errors)" :type="{ 'is-danger': fieldMessage('username', errors) }">
								<b-input v-model="username" :autofocus="!username" :placeholder="$t('Username')" autocomplete="username"
									autocapitalize="none" type="text" @blur="touched.username = true" @keyup.enter="handleSubmit(login)"></b-input>
							</b-field>
						</VeeField>
						<VeeField v-slot="{ errors }" :model-value="password" name="Password" rules="required|min:5">
							<b-field :message="fieldMessage('password', errors)" :type="{ 'is-danger': fieldMessage('password', errors) }">
								<b-input v-model="password" :autofocus="!!username" :placeholder="$t('Password')"
									autocomplete="current-password" password-reveal type="password" @blur="touched.password = true"
									@keyup.enter="handleSubmit(login)"></b-input>
							</b-field>
						</VeeField>
					</div>
					<b-button :aria-label="$t('Login')" :disabled="!username || !password" :loading="signingIn" :title="$t('Login')"
						class="login-go" icon-left="chevron-right" rounded @click="handleSubmit(login)" />
				</VeeForm>

				<div v-else class="login-row">
					<div class="login-fields">
						<p class="login-hint">{{ useRecovery ? $t('Recovery code') : $t('Authentication code') }}</p>
						<b-field>
							<b-input v-if="useRecovery" v-model="code" :placeholder="$t('Recovery code')" autocomplete="off" autofocus
								type="text" @keyup.enter="verify"></b-input>
							<b-input v-else v-model="code" :has-counter="false" autocomplete="one-time-code" autofocus inputmode="numeric"
								maxlength="6" placeholder="000000" type="text" @keyup.enter="verify"></b-input>
						</b-field>
						<a class="is-size-7 login-link" @click="toggleRecovery">{{ useRecovery ? $t('Use a code from your app instead') : $t('Use a recovery code instead') }}</a>
						<a class="is-size-7 login-link" @click="cancelPreAuth">{{ $t('Back') }}</a>
					</div>
					<b-button :aria-label="$t('Verify')" :disabled="!code" :loading="signingIn" :title="$t('Verify')"
						class="login-go" icon-left="chevron-right" rounded @click="verify" />
				</div>
			</div>
		</div>
	</div>

	<div v-else id="login-page" class="is-flex is-justify-content-center is-align-items-center ">
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
			// the new page: a field left empty says so once it is left
			touched: { username: false, password: false },
			// the new page's arrow turns while the box answers
			signingIn: false,
		}
	},
	computed: {
		// which page: the router asked the box before this page opened (needInit);
		// what this browser saw last when it could not
		loginStyle() {
			return this.$store?.state?.loginStyle || 'classic'
		},
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
		// the new page: the form's rules on submit, and a word under an empty
		// field as soon as it is left
		fieldMessage(field, errors) {
			if (this.touched[field] && !this[field]) {
				return field === 'username' ? this.$t('Enter the username') : this.$t('Enter the password')
			}
			return errors && errors[0] ? errors[0] : ''
		},

		async login() {
			this.signingIn = true
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
			} finally {
				this.signingIn = false
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
			this.signingIn = true
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
			} finally {
				this.signingIn = false
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

<style lang="scss">
// The new login page (beta). Colours are the theme tokens, so the dark theme
// is dark here too; the accent is ReCasaOS's green with its dark ink in both.
#login-page.login-beta {
	--login-accent: #bef500;
	--login-accent-ink: #151515;

	position: relative;
	z-index: 500;
	display: flex;
	height: 100%;
	padding: 2rem;
	// a phone's keyboard takes half the screen: the card scrolls, never hides
	overflow-y: auto;

	.login-card {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-rows: auto 1fr auto;
		column-gap: 2rem;
		// in the middle when it fits, from the top when it does not
		margin: auto;
		width: 798px;
		max-width: 100%;
		min-height: 486px;
		padding: 2.5rem;
		color: var(--casa-text);
		background: var(--casa-surface);
		border: 1px solid var(--casa-border-faint);
		border-radius: 14px;
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18);
	}

	.login-greeting {
		grid-column: 1;
		grid-row: 1;
		max-width: 15em;
		font-size: 1.875rem;
		font-weight: 400;
		line-height: 1.2;
		color: var(--casa-text);
	}

	.login-logo {
		grid-column: 2;
		grid-row: 1 / 3;
		align-self: start;
		margin: 2.75rem 3.25rem 0 0;

		img {
			display: block;
			width: 8.5rem;
			height: 8.5rem;
			// the mark's own corners (180 of 1024)
			border-radius: 17.6%;
		}
	}

	.login-form {
		grid-column: 1 / 3;
		grid-row: 3;
		margin-top: 2rem;
	}

	// the fields on the left, the arrow at the bottom right
	.login-row {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
	}

	.login-fields {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: 15rem;
		min-width: 0;

		// room for a field's message under it
		&.login-credentials {
			gap: 2.5rem;
		}

		.field {
			position: relative;
			margin-bottom: 0;
		}

		.input {
			height: 2.25rem;
			padding-left: 0.6rem;
			// 16px: below that a phone zooms the page in when the field gets the focus
			font-size: 1rem;
			color: var(--casa-text);
			background: var(--casa-surface);
			border: 1px solid var(--casa-border-strong);
			border-radius: 0.5rem;
			box-shadow: none;

			&::placeholder {
				color: var(--casa-text-muted);
			}

			&:focus {
				border-color: var(--casa-text-muted);
				box-shadow: 0 0 0 2px rgba(190, 245, 0, 0.55);
			}
		}

		.control.has-icons-right .icon {
			height: 2.25rem;
			color: var(--casa-text-muted) !important;
		}

		.help {
			position: absolute;
			top: 100%;
			margin-top: 0.5rem;
			font-size: 0.75rem;
		}
	}

	.login-go {
		flex: none;
		width: 3.5rem;
		height: 3.5rem;
		padding: 0;
		color: var(--login-accent-ink);
		background: var(--login-accent);
		border: none;

		.icon {
			width: 1.5rem;
			height: 1.5rem;
			font-size: 1.5rem;
		}

		&[disabled] {
			opacity: 0.6;
			background: var(--login-accent);
		}

		&.is-loading::after {
			border-color: transparent transparent var(--login-accent-ink) var(--login-accent-ink) !important;
		}
	}

	.login-hint,
	.login-link {
		color: var(--casa-text-muted);
	}

	.login-error {
		margin-bottom: 1rem;
		// the text never runs under the close button
		padding-right: 3rem;
	}
}

// a phone or a narrow window: one column, the logo first, the fields the
// whole width with the arrow beside them
@media screen and (max-width: 768px) {
	#login-page.login-beta {
		padding: 1rem;

		.login-card {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto auto auto;
			row-gap: 1.25rem;
			width: 100%;
			min-height: 0;
			padding: 1.75rem 1.25rem;
		}

		.login-logo {
			grid-column: 1;
			grid-row: 1;
			margin: 0;

			img {
				width: 4.5rem;
				height: 4.5rem;
			}
		}

		.login-greeting {
			grid-row: 2;
			font-size: 1.625rem;
		}

		.login-form {
			grid-column: 1;
			grid-row: 3;
			margin-top: 1rem;
		}

		.login-fields {
			flex: 1;
			width: auto;
		}
	}
}

// the dark mark on the dark card: a hairline keeps its edge
html[data-theme='dark'] #login-page.login-beta .login-logo img {
	box-shadow: 0 0 0 1px var(--casa-border-strong);
}
</style>
