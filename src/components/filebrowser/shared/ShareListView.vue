<template>
	<div class="node-list fliebroswer">

		<!-- Table body Start -->
		<div class="tbody">
			<div id="select-container" class="scroll-container scrollbars-light is-relative ">
				<!-- Empty Content Slot Start -->
				<div v-if="listData.length == 0 && !isLoading"
					class="is-flex is-align-items-center is-justify-content-center empty-container">
					<slot></slot>
				</div>
				<!-- Empty Content Slot End -->
				<div class="select-parent">
					<div class="card-container">
						<div v-for="(item, index) in listData" :key="`list-${index}${item.path}`" :data-rel="index"
							class="tr-wrapper rdata" @contextmenu.prevent="openContextMenu($event, item)">
							<div :class="{ active: item.isSelected }" class="tr is-unselectable">

								<div class="td">
									<!-- CheckBox Start -->
									<b-field class="checkbox-container is-flex  mr-0 ml-2 mb-0">

									</b-field>
									<!-- CheckBox End -->
								</div>
								<div class="td">
									<div class="cover">
										<list-icon-container :item="item"></list-icon-container>
									</div>
									<p class="text ">
										{{ item.name }}
										<b-tag :type="item.members.length ? 'is-light' : 'is-warning'" class="ml-2" rounded>
											{{ item.members.map(m => m.username).join(', ') || $t('Everyone') }}
										</b-tag>
									</p>
									<div class="action-wrapper mr-3">
										<!-- Access Button Start -->
										<b-button class="mr-2" icon-left="account-lock-outline" rounded size="is-small"
											:title="$t('Who can open this folder')"
											@click.stop="$emit('change-access', item)"></b-button>
										<!-- Access Button End -->
										<!-- Action Button Start -->
										<action-button :index="index" :item="item"></action-button>
										<!-- Action Button End -->
									</div>
								</div>
							</div>
						</div>
					</div>

				</div>

			</div>
			<!-- Context Menu Start -->
			<!-- eslint-disable-next-line vue/no-unused-refs -- opened by mixins/mixin.js -->
			<context-menu ref="ctxMenu" @reload="$emit('reload')"></context-menu>
			<!-- Context Menu End -->

		</div>

		<!-- Table body End -->
	</div>
</template>

<script>
import ListIconContainer from '../components/ListIconContainer.vue'
import ActionButton from './ActionButton.vue'
import ContextMenu from './ContextMenu.vue'
import { mixin } from '@/mixins/mixin'

export default {
	components: {
		ActionButton,
		ContextMenu,
		ListIconContainer,
	},
	mixins: [mixin],
	props: {
		listData: Array,
		isLoading: Boolean,
	},

	data() {
		return {
			isMobile: false,
		}
	},
	created() {
		this.M_WIDTH = 768
	},

	mounted() {
		window.addEventListener('resize', this.onResize)
		this.onResize()
	},

	methods: {
		/*************************************************
		 * PART 1  Alignment Method
		 **************************************************/
		/**
		 * @description: Changes the arrangement of the list when the view size changes.
		 * @return {*}
		 */
		onResize() {
			const ww = document.body.clientWidth
			this.isMobile = ww <= this.M_WIDTH
		},
	},
}
</script>

<style></style>
