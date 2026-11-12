<!--
 * @Author: Jerryk jerry@icewhale.org
 * @Date: 2022-07-31 20:24:15
 * @LastEditors: Jerryk jerry@icewhale.org
 * @LastEditTime: 2023-02-06 17:53:42
 * @FilePath: /CasaOS-UI/src/components/filebrowser/shared/SelectShareModal.vue
 * @Description:
 *
 * Copyright (c) 2022 by IceWhale, All Rights Reserved.
-->
<template>
	<div class="modal-card">
		<!-- Modal-Card Header Start -->
		<header class="modal-card-head">
			<div class="is-flex-grow-1">
				<h3 class="title is-3">{{ $t('Select Shared Folder') }}</h3>
			</div>
			<div>
				<button class="delete" type="button" @click="$emit('close')"></button>
			</div>
		</header>
		<!-- Modal-Card Header End -->
		<!-- Modal-Card Body Start -->
		<section class="modal-card-body">

			<ul class="folder-list scrollbars-light mt-5 mb-5">
				<li v-for="(item, index) in rootDataList" :key="`rs${index}`">
					<div class="is-flex list-item new-list-item is-align-items-center disbiled">
						<div class="cover ml-2 mr-2 is-flex-shrink-0  is-flex is-align-items-center">
							<b-icon :icon="item.icon" :pack="item.pack" class="casa-color-blue" custom-size="casa-28px"></b-icon>
						</div>
						<div class=" is-flex-grow-1">{{ item.name }}</div>
						<div class=" is-flex-shrink-0  is-flex is-align-items-center">
							<b-checkbox :model-value="item.selected" class="mr-0" disabled></b-checkbox>
						</div>
					</div>
				</li>
				<li v-for="(item, index) in dataList" :key="`s${index}`">
					<div v-if="item.visible" class="is-flex list-item new-list-item is-align-items-center" @click="toggle(item)">
						<div class="cover ml-2 mr-2 is-flex-shrink-0 is-flex is-align-items-center">
							<b-icon :icon="item.icon" :pack="item.pack" class="casa-color-blue" custom-size="casa-28px"></b-icon>
						</div>
						<div class=" is-flex-grow-1 is-unselectable">{{ item.name }}</div>
						<div class=" is-flex-shrink-0  is-flex is-align-items-center">
							<b-checkbox :model-value="item.selected" class="mr-0 none-click"></b-checkbox>
						</div>
					</div>
				</li>
			</ul>
		</section>
		<!-- Modal-Card Body End -->
		<!-- Access Start -->
		<section class="modal-card-body share-access is-flex-grow-0">
			<b-switch v-model="requireAccount" size="is-small">{{ $t('Require an account') }}</b-switch>
			<p v-if="!requireAccount" class="has-text-full-03 is-size-7 mt-1">
				{{ $t('Anyone on the network can read and write these folders.') }}
			</p>
			<template v-else>
				<b-field class="mt-2">
					<b-select v-model="username" :placeholder="$t('Choose an account')" expanded size="is-small">
						<option v-for="user in users" :key="user" :value="user">{{ user }}</option>
					</b-select>
				</b-field>
				<p class="has-text-full-03 is-size-7">
					{{ $t('The account applies to every folder selected above.') }}
					<a href="#" @click.prevent="manageUsers">{{ $t('Manage accounts') }}</a>
				</p>
			</template>
			<b-switch v-model="timeMachine" class="mt-3" size="is-small">
				{{ $t('Use as a Time Machine destination') }}
			</b-switch>
			<p v-if="timeMachine" class="has-text-full-03 is-size-7 mt-1">
				{{ $t('Macs on the network will offer these folders as a Time Machine backup disk.') }}
			</p>
		</section>
		<!-- Access End -->
		<!-- Modal-Card Footer Start -->
		<footer class="modal-card-foot is-flex is-align-items-center">
			<div class="is-flex-grow-1"></div>
			<div>
				<b-button :disabled="requireAccount && !username" :label="$t('Submit')" :loading="isSaving" rounded type="is-primary" @click="saveShares" />
			</div>
		</footer>
		<!-- Modal-Card Footer End -->
	</div>
</template>

<script>
import escape from 'lodash/escape'
import SambaUsersModal from './SambaUsersModal.vue'

export default {
	data() {
		return {
			isSaving: false,
			// Access. A share is protected when it names an account, so leaving
			// requireAccount off sends no username and produces the guest share
			// CasaOS has always created here.
			requireAccount: false,
			username: '',
			users: [],
			// Apple's SMB extensions are per-share, so a Time Machine folder gets
			// them and every other share stays exactly as it was.
			timeMachine: false,
			rootDataList: [
				{
					name: 'Root',
					icon: 'folder-root',
					pack: 'casa',
					path: '/',
					visible: true,
					selected: false,
					extensions: null,
				},
			],

			initFolders: [
				{
					name: 'DATA',
					icon: 'folder-data',
					pack: 'casa',
					path: '/DATA',
					visible: true,
					selected: true,
					extensions: null,
				},
				{
					name: 'Documents',
					icon: 'folder-documents',
					pack: 'casa',
					path: '/DATA/Documents',
					visible: true,
					selected: true,
					extensions: null,
				},
				{
					name: 'Downloads',
					icon: 'folder-downloads',
					pack: 'casa',
					path: '/DATA/Downloads',
					visible: true,
					selected: true,
					extensions: null,
				},
				{
					name: 'Gallery',
					icon: 'folder-gallery',
					pack: 'casa',
					path: '/DATA/Gallery',
					visible: true,
					selected: true,
					extensions: null,
				},
				{
					name: 'Media',
					icon: 'folder-media',
					pack: 'casa',
					path: '/DATA/Media',
					visible: true,
					selected: true,
					extensions: null,
				},

			],
			dataList: [],
		}
	},
	async created() {
		this.getNewList()
		this.loadUsers()
	},
	methods: {
		/**
		 * @description: Load the share accounts available to protect a share
		 * @return {*}
		 */
		async loadUsers() {
			try {
				const response = await this.$api.samba.getUsers()
				this.users = response.data.data || []
			} catch {
				// Without a list the switch simply has nothing to offer; sharing
				// without an account still works.
				this.users = []
			}
		},

		/**
		 * @description: Open the share account manager
		 * @return {*}
		 */
		manageUsers() {
			this.$buefy.modal.open({
				component: SambaUsersModal,
				hasModalCard: true,
				trapFocus: true,
				canCancel: ['escape'],
				scroll: 'keep',
				animation: 'zoom-in',
				events: {
					close: () => this.loadUsers(),
				},
			})
		},

		/**
		 * @description: Get new list
		 * @return {*}
		 */
		async getNewList() {
			const newList = await this.$api.folder.getList(this.rootDataList[0].path)
			const dataList = await this.$api.folder.getList(this.initFolders[0].path)
			this.shortcutList = this.$store.state.shortcutData
			this.dataList = [...this.initFolders, ...this.shortcutList]
			const contactList = []
			contactList.push(...newList.data.data.content, ...dataList.data.data.content, ...this.shortcutList)
			this.dataList.forEach((dir) => {
				dir.visible = contactList.some(item => item.path == dir.path && item.is_dir)
				dir.extensions = contactList.find(item => item.path == dir.path && item.is_dir).extensions
			})
		},
		/**
		 * @description: Toggle folder select
		 * @param {*} item
		 * @return {*}
		 */
		toggle(item) {
			item.selected = !item.selected
		},

		/**
		 * @description: Save shares
		 * @return {*}
		 */
		async saveShares() {
			this.isSaving = true
			const selectedList = this.dataList.filter(item => item.selected)
			const username = this.requireAccount ? this.username : ''
			const data = selectedList.map((item) => {
				return {
					path: item.path,
					anonymous: username === '',
					username,
					time_machine: this.timeMachine,
				}
			})
			try {
				await this.$api.samba.createShare(data)
				this.isSaving = false
				this.$emit('close')
				this.$emit('reload')
			} catch (error) {
				this.isSaving = false
				this.$buefy.toast.open({
					message: escape(error.response.data.message),
					type: 'is-danger',
				})
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.folder-list {
	background: var(--casa-surface-sunken);
	border: 1px solid var(--casa-border-subtle);
	border-radius: 0.75rem;
	padding: 1.5rem;

	li {
		.list-item {
			padding: 0.625rem 0.75rem 0.625rem 0.75rem;
			margin: 0.125rem 0;
			border-radius: 4px;
			cursor: pointer;
			transition: all 0.2s;
			align-items: center;
			font-size: 14px;

			.arrow-container {
				width: 24px;
				height: 24px;
			}

			span {
				overflow: hidden;
				white-space: nowrap;
				text-overflow: ellipsis;
			}

			&:hover {
				background: var(--casa-selected);
			}

			&.active {
				background: var(--casa-selected);
			}

			.icon {
				overflow: hidden;
			}

			&.disbiled {
				opacity: 0.2;
				pointer-events: none;
			}

			.none-click {
				pointer-events: none;
			}
		}

		.new-list-item {
			font-size: 0.875rem;
		}
	}
}
</style>

<style lang="scss">
.folder-list {
	.control-label {
		display: none !important;
	}
}
</style>
