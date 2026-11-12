<template>
	<div class="modal-card">
		<!-- Modal-Card Header Start -->
		<header class="modal-card-head">
			<div class="is-flex-grow-1">
				<h3 class="title is-header">{{ $t('Change wallpaper') }}</h3>
			</div>

		</header>
		<!-- Modal-Card Header End -->
		<!-- Modal-Card Body Start -->
		<section class="modal-card-body ">
			<!-- which wallpaper: the dashboard's, or the login screen's -->
			<b-field class="mb-0" position="is-centered">
				<b-radio-button :model-value="target" native-value="desktop" size="is-small" @update:model-value="switchTarget">
					{{ $t('Dashboard') }}
				</b-radio-button>
				<b-radio-button :disabled="!canSetLogin" :model-value="target" native-value="login" size="is-small" @update:model-value="switchTarget">
					{{ $t('Login screen') }}
				</b-radio-button>
			</b-field>
			<!-- the login page reads the first account's folder: another account's file would never show -->
			<p v-if="!canSetLogin" class="is-size-7 has-text-centered login-note">
				{{ $t('Only the first account can choose the login screen\'s wallpaper.') }}
			</p>

			<div class="preview-card">
				<div :style="backgroundStyleObj" class="preview-image">
					<b-image v-if="target === 'desktop'" :src="require('@/assets/background/preview-widget.svg')" class="preview-widget"></b-image>
					<div v-else class="preview-login"></div>
					<b-image :src="require('@/assets/background/blank.png')"></b-image>
				</div>
			</div>
			<p v-if="target === 'login'" class="is-size-7 has-text-centered login-note">
				{{ $t('Shown behind the login box. The first wallpaper is the default one.') }}
			</p>

			<div class="columns is-mobile mt-5 mb-5 is-variable is-2">
				<div v-for="(item, index) in wallpaperItems" :key="`wallpaper${index}`" class="column">
					<div :class="{ active: checkActive(item.path) }" class="image-list-item is-clickable"
						@click="changeWallpaper(item.path)">
						<b-image :src="item.path"></b-image>
					</div>
				</div>

				<div class="column is-relative is-one-quarter">
					<div :class="{ active: checkActiveFrom('Upload') }" class="upload-button-container is-clickable">
						<div id="upload-wallpaper"
							class="upload-button is-flex is-align-items-center is-justify-content-center ">
							<b-icon icon="picture-upload-outline" pack="casa" size="is-large"></b-icon>

						</div>
						<b-loading v-model="isUpLoading" :can-cancel="false" :is-full-page="false"></b-loading>
					</div>

				</div>
			</div>
		</section>
		<!-- Modal-Card Body End -->
		<!-- Modal-Card Footer Start -->
		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button :label="$t('Cancel')" rounded @click="$emit('close')" />
			<!-- the login screen's choice is known once the probe answered: before, Apply could delete its file -->
			<b-button :disabled="target === 'login' && !loginProbed" :label="$t('Apply')" :loading="isLoading" rounded type="is-primary" @click="saveChange" />
		</footer>
		<!-- Modal-Card Footer End -->
	</div>
</template>

<script>
import Uploader from 'simple-uploader.js'
import escape from 'lodash/escape'
import { LOGIN_WALLPAPER_KEY, LOGIN_WALLPAPER_NAME, LOGIN_WALLPAPER_USER, findLoginWallpaper, loginWallpaperPath, toJPEG } from './loginWallpaper'

const wallpaperConfig = 'wallpaper'
// where an image uploaded for the login screen goes before it is converted:
// not over the dashboard's own upload
const loginUploadKey = `${LOGIN_WALLPAPER_KEY}-upload`
// the user service's answer to a delete of a file that is not there
const FILE_DOES_NOT_EXIST = 60001

export default {
	components: {},
	data() {
		return {
			isLoading: false,
			isUpLoading: false,
			uploader: null,
			attributes: {
				accept: 'image/png, image/jpeg, image/svg+xml, image/bmp, image/png, image/gif',
			},
			wallpaperItems: [
				{
					name: 'Built-in wallpaper 1',
					path: require('@/assets/background/wallpaper01.jpg'),
				},
				{
					name: 'Built-in wallpaper 2',
					path: require('@/assets/background/wallpaper02.jpg'),
				},
			],
			backgroundStyleObj: {
				backgroundImage: `url(${this.parseUrl(this.$store.state.wallpaperObject.path)})`,
			},
			path: this.$store.state.wallpaperObject.path,
			from: this.$store.state.wallpaperObject.from,
			target: 'desktop',
			// whether the probe for the login screen's file has answered
			loginProbed: false,
			// the raw file uploaded for the login screen, deleted once converted
			loginUploadPath: '',
			// each wallpaper's choice, kept while the other one is shown; the
			// login screen's is the built-in one until a file is found
			choices: {
				desktop: { path: this.$store.state.wallpaperObject.path, from: this.$store.state.wallpaperObject.from },
				login: { path: require('@/assets/background/wallpaper01.jpg'), from: 'Built-in' },
			},
		}
	},
	computed: {
		// the login page reads the first account's folder only
		canSetLogin() {
			return (this.$store.state.user?.id || LOGIN_WALLPAPER_USER) === LOGIN_WALLPAPER_USER
		},
	},
	created() {
		this.uploader = new Uploader({
			target: this.getTargetUrl(wallpaperConfig),
			singleFile: true,
			testChunks: false,
			uploadMethod: 'POST',
			allowDuplicateUploads: true,
			chunkSize: 1024 * 1024 * 1024 * 1024,
		})
	},
	mounted() {
		findLoginWallpaper().then(url => this.onLoginProbed(url))
		this.uploader.assignBrowse(document.getElementById('upload-wallpaper'), false, true, this.attributes)
		this.uploader.on('filesSubmitted', () => {
			this.isUpLoading = true
			this.$api.sys.getVersion().then(() => {
				this.uploader.opts.headers.Authorization = this.$store.state.access_token || localStorage.getItem('access_token')
				this.uploader.upload()
			})
		})
		this.uploader.on('fileError', () => {
			this.isUpLoading = false
			this.$buefy.toast.open({
				message: this.$t('Upload failed, please try again!'),
				type: 'is-danger',
			})
		})
		this.uploader.on('fileSuccess', (rootFile, file, message) => {
			this.isUpLoading = false
			const res = JSON.parse(message)

			if (res.success === 200) {
				if (this.target === 'login') {
					this.loginUploadPath = new URLSearchParams(res.data.online_path.split('?')[1] || '').get('path') || ''
				}
				const uploadPath = `SERVER_URL${res.data.online_path}&time=${new Date().getTime()}`
				this.backgroundStyleObj.backgroundImage = `url(${this.parseUrl(uploadPath)})`
				this.path = uploadPath
				this.from = 'Upload'
			} else {
				this.$buefy.toast.open({
					message: escape(res.message),
					type: 'is-danger',
				})
			}
		})
	},
	beforeUnmount() {
		// an upload for the login screen that was not applied: nothing should keep it
		this.removeLoginUpload()
	},
	methods: {
		// The probe found the login screen's file, or not. On the login tab with
		// the placeholder still chosen, show what is really there.
		onLoginProbed(url) {
			if (url) {
				const placeholder = this.choices.login
				this.choices.login = { path: url, from: 'Login' }
				if (this.target === 'login' && this.from === placeholder.from && this.path === placeholder.path) {
					this.path = url
					this.from = 'Login'
					this.backgroundStyleObj.backgroundImage = `url(${this.parseUrl(url)})`
				}
			}
			this.loginProbed = true
		},
		// a delete of a file that is not there is no failure; any other refusal is
		removeImage(path) {
			return this.$api.users.removeUserImage(path).catch((e) => {
				if (e.response?.data?.success !== FILE_DOES_NOT_EXIST) {
					throw e
				}
			})
		},
		removeLoginUpload() {
			const path = this.loginUploadPath
			this.loginUploadPath = ''
			return path ? this.removeImage(path).catch(() => {}) : Promise.resolve()
		},
		switchTarget(target) {
			this.choices[this.target] = { path: this.path, from: this.from }
			this.target = target
			const { path, from } = this.choices[target]
			this.path = path
			this.from = from
			this.backgroundStyleObj.backgroundImage = `url(${this.parseUrl(path)})`
			this.uploader.opts.target = this.getTargetUrl(target === 'login' ? loginUploadKey : wallpaperConfig)
		},
		saveChange() {
			if (this.target === 'login') {
				return this.saveLogin()
			}
			const data = {
				path: this.path,
				from: this.from,
			}
			this.isLoading = true
			this.$api.users.setCustomStorage(wallpaperConfig, data).then((res) => {
				this.isLoading = false
				if (res.data.success === 200) {
					this.$messageBus('dashboardsetting_wallpaper', res.data.data.path.toString())
					this.$emit('close')
					setTimeout(() => {
						this.$store.commit('SET_WALLPAPER', {
							path: res.data.data.path,
							from: res.data.data.from,
						})
					}, 300)
				} else {
					this.$buefy.toast.open({
						message: this.$t('Save failed, please try again!'),
						type: 'is-danger',
					})
				}
			})
		},
		// The login screen's wallpaper is a file: converted and uploaded, or
		// deleted for the built-in one.
		async saveLogin() {
			if (this.from === 'Login') {
				this.$emit('close')
				return
			}
			this.isLoading = true
			try {
				if (this.path === this.wallpaperItems[0].path) {
					await this.removeImage(loginWallpaperPath(LOGIN_WALLPAPER_USER))
				} else {
					const blob = await toJPEG(this.parseUrl(this.path))
					const res = await this.$api.users.uploadUserImage(LOGIN_WALLPAPER_KEY, blob, LOGIN_WALLPAPER_NAME)
					if (res.data.success !== 200) {
						throw new Error(res.data.message)
					}
				}
				// the raw upload (any format, any size) is readable without a session: once converted it goes
				await this.removeLoginUpload()
				this.$buefy.toast.open({ message: this.$t('Login screen wallpaper saved.'), type: 'is-success' })
				this.$emit('close')
			} catch {
				this.$buefy.toast.open({ message: this.$t('Save failed, please try again!'), type: 'is-danger' })
			} finally {
				this.isLoading = false
			}
		},
		changeWallpaper(path) {
			this.backgroundStyleObj.backgroundImage = `url(${this.parseUrl(path)})`
			this.path = path
			this.from = 'Built-in'
		},

		checkActive(path) {
			return this.path == path
		},
		checkActiveFrom(from) {
			return this.from == from
		},
		getTargetUrl(key) {
			const accessToken = localStorage.getItem('access_token')
			return `${this.$protocol}//${this.$baseURL}/v1/users/current/image/${key}?token=${accessToken}&type=wallpaper`
		},
		parseUrl(serverUrl) {
			const newUrl = serverUrl.replace('SERVER_URL', `${this.$protocol}//${this.$baseURL}`)
			return newUrl
		},
	},
}
</script>

<style lang="scss" scoped>
.preview-card {
	margin-left: 2.625rem;
	margin-right: 2.625rem;
	margin-top: 1.5rem;
	margin-bottom: 3rem;
	border: 6px solid transparent;
	border-radius: 16px;
	background-clip: padding-box, border-box;
	background-origin: padding-box, border-box;
	background-image: linear-gradient(to right, var(--casa-surface), var(--casa-surface)),
		linear-gradient(108.27deg,
			rgba(57, 60, 64, 1) 1.44%,
			rgba(92, 96, 102, 1) 55.8%,
			rgba(34, 36, 38, 1) 110.95%);
	box-shadow: 0px 16px 24px rgba(115, 120, 128, 0.4);
	overflow: hidden;

	.preview-image {
		position: relative;
		overflow: hidden;

		// the login box, where the dashboard preview shows its widgets
		.preview-login {
			position: absolute;
			left: 50%;
			top: 50%;
			z-index: 1;
			width: 22%;
			height: 46%;
			transform: translate(-50%, -50%);
			border-radius: 8px;
			background: rgba(255, 255, 255, 0.72);
			box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
		}

		.preview-widget {
			position: absolute;
			left: 8.3333%;
			top: 14.81%;
			width: 23.96%;
			z-index: 1;
		}
	}
}

.image-list-item,
.upload-button-container {
	width: 100%;
	height: 100%;
	overflow: hidden;
	border-radius: 5px;
	border-color: transparent;
	border-width: 2px;
	border-style: solid;
	transition: border-color 0.3s ease;

	&.active {
		border-color: $primary;
	}

	&:hover {
		border-color: $primary;
	}

	.image {
		border-radius: 4px;
		border: var(--casa-surface) 1px solid;
		overflow: hidden;
		background-size: cover;
	}

	.upload-button {
		width: 100%;
		height: 100%;
		border-radius: 4px;
		border: var(--casa-surface) 1px solid;
		overflow: hidden;
		background-color: var(--casa-surface-tile);
	}
}

.login-note {
	margin-top: -2rem;
	margin-bottom: 1rem;
	color: var(--casa-text-hint);
}

.preview-image {
	background-size: cover;
	background-repeat: no-repeat;
	overflow: hidden;
	background-position: center center;
	transition: background-image 0.3s ease;
}
</style>
