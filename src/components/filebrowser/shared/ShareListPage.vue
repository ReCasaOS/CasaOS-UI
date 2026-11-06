<template>
	<div class="content is-flex-grow-1">
		<!-- Header Start -->
		<header class="modal-card-head">
			<!-- SideBar Button Start -->
			<sidebar-menu-button></sidebar-menu-button>
			<!-- SideBar Button End -->
			<div id="bread-container"
				class="is-flex-grow-1 is-flex breadcrumb-container">
				<h3 class="title is-header mb-0">{{ $t("Shared Folders") }}</h3>
			</div>
			<!-- The accounts had no door of their own anywhere in the dashboard: the
				only way in was a link inside the dialog that assigns one, which is no
				use to somebody who has not made one yet. -->
			<b-button class="mr-2" icon-left="account-multiple-outline" rounded size="is-small"
				@click="manageUsers">{{ $t('Manage accounts') }}</b-button>
			<b-icon class="close-button" icon="close-outline" pack="casa" @click="$emit('close');" />
		</header>
		<!-- Header End -->

		<share-list-view :is-loading="isLoading" :list-data="list" @change-access="changeAccess">
			<div>
				<div class="buttons is-justify-content-center">
					<b-image :src="require('@/assets/img/share/share-empty.svg')"
						class="is-160x160"></b-image>
				</div>
				{{
					$t(
						"Follow the guide to start sharing your files on the local network.",
					)
				}}
				<div class="buttons is-justify-content-center pt-3">
					<b-button rounded type="is-primary" @click="selectShare">{{
						$t("Start")
					}}
					</b-button>
				</div>
			</div>
		</share-list-view>
		<b-loading v-model="isLoading" :is-full-page="false"></b-loading>
	</div>
</template>

<script>
import { defineAsyncComponent } from 'vue'
import ShareListView from './ShareListView.vue'
import ShareAccessModal from './ShareAccessModal.vue'
import { shareMembers } from './shareMembers'
import SambaUsersModal from './SambaUsersModal.vue'
import events from '@/events/events'

export default {
	data() {
		return {
			list: [],
			isLoading: true,
		}
	},

	components: {
		ShareListView,
		SidebarMenuButton: defineAsyncComponent(() => import('../components/SidebarMenuButton.vue')),
	},

	mounted() {
		this.getSharedList()
	},

	methods: {
		/**
		 * @description: Change who can open a shared folder
		 * @return {*}
		 */
		changeAccess(item) {
			this.$buefy.modal.open({
				component: ShareAccessModal,
				hasModalCard: true,
				trapFocus: true,
				canCancel: ['escape'],
				scroll: 'keep',
				animation: 'zoom-in',
				props: { share: item },
				events: {
					reload: () => this.getSharedList(),
				},
			})
		},

		async getSharedList() {
			this.isLoading = true
			try {
				const list = await this.$api.samba.getShares()
				this.isLoading = false
				this.list = list.data.data.map((item) => {
					const name = item.path.split('/').pop()
					return {
						id: item.id,
						date: '',
						isSelected: false,
						is_dir: true,
						name,
						path: item.path,
						username: item.username || '',
						members: shareMembers(item),
						time_machine: !!item.time_machine,
						size: 0,
						write: false,
					}
				})
			} catch {
				this.isLoading = false
				this.list = []
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
				events: { close: () => this.getSharedList() },
			})
		},

		selectShare() {
			this.$EventBus.$emit(events.SELECT_SHARE)
		},
	},
}
</script>
