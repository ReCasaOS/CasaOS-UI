<template>
	<div class="modal-card">
		<!-- Modal-Card Header Start -->
		<header class="modal-card-head">
			<div class="is-flex-grow-1">
				<h3 class="title is-header">{{ $t('New Folder') }}</h3>
			</div>
			<b-icon class="close-button" icon="close-outline" pack="casa" @click="$emit('close');" />
		</header>
		<!-- Modal-Card Header End -->
		<!-- Modal-Card Body Start -->
		<section class="modal-card-body ">
			<div class="node-card">
				<div class="cover is-flex is-justify-content-center is-align-items-center">
					<div class="folder-cover">
						<img :src="require('@/assets/img/filebrowser/folder-default.svg')" alt="folder"
							class="folder-icon">
					</div>
				</div>
				<b-field :message="errors" :type="errorType" class="mb-3 mt-5 has-text-light" expanded>
					<b-input v-model="folderName" @keyup.enter="createFolder" ref="inputs"
						@update:model-value="folderName = folderName.replace(/\//g, '')"></b-input>
				</b-field>
				<div class="notification pl-4 pri-height">
					<b-field>
						<b-checkbox v-show="isRootorDATA" v-model="shortcut" type="is-info">
							{{ $t('Add a shortcut') }}
						</b-checkbox>
					</b-field>
					<b-field>
						<b-checkbox v-model="shared" type="is-info">
							{{ $t('Shared') }}
						</b-checkbox>
					</b-field>
					<!-- Ticking Shared used to put the folder on the network readable and
						writable by anyone, with nothing on screen saying so. -->
					<template v-if="shared">
						<b-field>
							<b-checkbox v-model="requireAccount" type="is-info">
								{{ $t('Require an account') }}
							</b-checkbox>
						</b-field>
						<b-field v-if="requireAccount" class="mb-2">
							<b-select v-model="username" :placeholder="$t('Choose an account')" expanded size="is-small">
								<option v-for="user in users" :key="user" :value="user">{{ user }}</option>
							</b-select>
						</b-field>
						<p class="has-text-full-03 is-size-7">
							<a v-if="requireAccount" href="#" @click.prevent="manageUsers">{{ $t('Manage accounts') }}</a>
							<template v-else>{{ $t('Anyone on the network can read and write this folder.') }}</template>
						</p>
					</template>
				</div>

			</div>

		</section>
		<!-- Modal-Card Body End -->
		<!-- Modal-Card Footer Start -->
		<footer class="modal-card-foot is-flex is-align-items-center">
			<div class="is-flex-grow-1"></div>
			<div>
				<b-button :disabled="shared && requireAccount && !username" :label="$t('Submit')" :loading="isloading"
					expaned rounded type="is-primary" @click="createFolder" />
			</div>
		</footer>
		<!-- Modal-Card Footer End -->
	</div>
</template>

<script>
import path from 'path'
import { mixin } from '@/mixins/mixin'
import SambaUsersModal from '@/components/filebrowser/shared/SambaUsersModal.vue'

export default {
	mixins: [mixin],
	props: {
		currentPath: String,
		rootPath: {
			type: String,
			default: '/DATA',
		},
	},
	data() {
		return {
			folderName: 'New Folder',
			errorType: 'is-success',
			errors: '',
			shortcut: false,
			shared: false,
			requireAccount: false,
			username: '',
			users: [],
			isloading: false,
		}
	},
	computed: {
		isRootorDATA() {
			return this.currentPath === '/' || this.currentPath === this.rootPath
		},
	},
	mounted() {
		this.loadUsers()
		this.isRootorDATA ? this.shortcut = true : this.shortcut = false
		this.$nextTick(() => {
			this.$refs.inputs.getElement().select()
		})
	},
	methods: {

		async loadUsers() {
			try {
				const response = await this.$api.samba.getUsers()
				this.users = response.data.data || []
			} catch {
				this.users = []
			}
		},

		manageUsers() {
			this.$buefy.modal.open({
				component: SambaUsersModal,
				hasModalCard: true,
				trapFocus: true,
				canCancel: ['escape'],
				scroll: 'keep',
				animation: 'zoom-in',
				events: { close: () => this.loadUsers() },
			})
		},

		async createFolder() {
			this.isloading = true

			// shortcut
			// src/components/filebrowser/components/ActionButton.vue:121
			const newPath = path.join(this.currentPath, this.folderName)

			this.$api.folder.create(newPath).then(async (res) => {
				if (res.data.success == 200) {
					try {
						if (this.shortcut) {
							// get shortcut detail
							// let shortcut = await this.$api.users.getShutcutDetail().then(v => v.data.data);
							// let shortcut = await this.$store.dispatch('SET_SHORTCUT_DATA').then(v => v.data.data);
							let shortcut = this.$store.state.shortcutData
							// shortcut data preprocess
							if (!shortcut) {
								shortcut = []
							}
							// add new shortcut
							shortcut.push({
								name: this.folderName,
								path: newPath,
								type: 'folder',
							})
							// save shortcut
							// await this.$api.users.saveShutcutDetail(shortcut);
							// LURK BUG: shortcut data not update
							await this.$store.dispatch('SET_SHORTCUT_DATA', shortcut)
						}

						if (this.shared) {
							const username = this.requireAccount ? this.username : ''
							await this.$api.samba.createShare([{
								path: newPath,
								anonymous: username === '',
								username,
								time_machine: false,
							}])
						}
					} catch (e) {
						console.log(e)
					}
					this.$emit('reload')
					this.$emit('close')
				} else {
					this.errorType = 'is-danger'
					this.errors = res.data.message
				}
				this.isloading = false
			}).catch((err) => {
				console.log(err)
			})
		},
		// TODO refresh file list
		// reload() {
		//   this.$EventBus.$on(events.RELOAD_FILE_LIST, this.getNewList);
		// }
	},

}
</script>

<style lang="scss">
//$background: hsl(0, 0%, 97%);
//$notification-background-color: $background;
.pri-height {
	height: 5.625rem;
}
</style>
