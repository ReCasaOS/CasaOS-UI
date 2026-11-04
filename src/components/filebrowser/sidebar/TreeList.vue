<template>
	<div class="ul">
		<!-- Root List Start -->
		<tree-list-item v-for="item in rootDataList" :key="item.path" :is-active="isActive" :item="item"
			icon-color="casa-color-blue"></tree-list-item>
		<!-- Root List End -->

		<!-- Data List Start -->
		<tree-list-item v-for="item in dataList" :key="item.path" :is-active="isActive" :is-share="checkSharevisibility(item)"
			:item="item" icon-color="casa-color-blue"></tree-list-item>
		<!-- Data List End -->

		<!-- Starred Start -->
		<template v-if="starredList.length">
			<h3 class="title is-3 mb-0 pb-3 pt-3 has-text-left">
				{{ $t('Starred') }}
			</h3>
			<tree-list-item v-for="item in starredList" :key="`starred:${item.path}`" :icon-label="$t('Remove from Starred')"
				:is-active="isActive" :is-share="checkSharevisibility(item)" :item="item" icon-color="casa-color-blue"
				icon-name="close-outline" @rightIconClick="unstar"></tree-list-item>
		</template>
		<!-- Starred End -->
	</div>
</template>

<script>
import has from 'lodash/has'
import { homeFolders } from '../fileRoot.js'
import TreeListItem from './TreeListItem.vue'
import { checkStarred } from './starred.js'
import { mixin } from '@/mixins/mixin'
import events from '@/events/events'

export default {
	mixins: [mixin],
	inject: ['filePanel'],
	components: {
		TreeListItem,
	},
	props: {
		path: {
			type: String,
			default: '',
		},
		autoLoad: {
			type: Boolean,
			default: false,
		},
		isActive: {
			type: Boolean,
			default: true,
		},
	},
	data() {
		return {
			rootDataList: [
				{
					name: 'Root',
					icon: 'root-outline',
					pack: 'casa',
					path: '/',
					visible: true,
					selected: true,
					extensions: null,
				},
			],

			dataList: [],
			starredList: [],
		}
	},
	computed: {
		initFolders() {
			return homeFolders(this.filePanel.rootPath || '/DATA')
		},
	},
	watch: {
		'filePanel.fileRootReady': function (ready) {
			if (ready) {
				this.getNewList()
			}
		},
		// a star added or removed anywhere (context menu, new folder, a deleted item)
		'$store.state.shortcutData': function () {
			this.refreshStarred()
		},
	},
	async created() {
		// Get the shortcut detail for the first time and save it to store
		try {
			await this.$store.dispatch('GET_SHORTCUT_DATA')
		} catch (e) {
			console.log(e)
		}
		if (this.filePanel.fileRootReady) {
			this.getNewList()
		}
	},

	mounted() {
		this.$EventBus.$on(events.RELOAD_FILE_LIST, this.getNewList)

		this.dataList = [...this.initFolders]
	},
	methods: {
		async getNewList() {
			const newList = await this.$api.folder.getList(this.rootDataList[0].path)
			const dataList = await this.$api.folder.getList(this.initFolders[0].path)

			this.dataList = [...this.initFolders]
			const contactList = []
			contactList.push(...newList.data.data.content, ...dataList.data.data.content)
			this.dataList.forEach((dir) => {
				dir.visible = contactList.some(item => item.path == dir.path && item.is_dir)
				const isInArray = contactList.find(item => item.path == dir.path && item.is_dir)
				dir.extensions = isInArray ? isInArray.extensions : null
			})
			this.refreshStarred()
		},

		async refreshStarred() {
			const starred = this.$store.state.shortcutData || []
			const list = await checkStarred(starred, path => this.$api.folder.getList(path).then(res => res.data.data.content))
			// a newer refresh may have started meanwhile: only the store's current list is drawn
			if (starred === this.$store.state.shortcutData) {
				this.starredList = list
			}
		},

		unstar(item) {
			this.$store.dispatch('SET_SHORTCUT_DATA', this.$store.state.shortcutData.filter(s => s.path !== item.path))
		},

		checkSharevisibility(item) {
			const extensions = item.extensions
			if (extensions === null) {
				return false
			} else {
				if (has(extensions, 'share')) {
					return extensions.share.shared === 'true'
				} else {
					return false
				}
			}
		},

	},
}
</script>
