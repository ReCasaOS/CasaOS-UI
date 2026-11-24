<!--
  * @LastEditors: zhanghengxin ezreal.zhang@icewhale.org
  * @LastEditTime: 2023/4/24 上午11:20
  * @FilePath: /CasaOS-UI/src/components/filebrowser/components/FileBreadcrumb.vue
  * @Description:
  *
  * Copyright (c) 2023 by IceWhale, All Rights Reserved.

  -->

<!--
 * @Author: JerryK
 * @Date: 2022-03-01 15:40:34
 * @LastEditors: Jerryk jerry@icewhale.org
 * @LastEditTime: 2022-05-26 23:13:48
 * @Description:
 * @FilePath: \CasaOS-UI\src\components\filebrowser\components\FileBreadcrumb.vue
-->
<template>
	<div class="is-flex is-align-items-center path-bar">
		<!-- a path typed or pasted (CasaOS#184): Enter opens it, Escape or leaving the field gives the breadcrumb back -->
		<b-input v-if="editing" ref="pathInput" v-model="typed" :aria-label="$t('Path')" class="path-input is-flex-grow-1"
			data-path-input size="is-small" @blur="editing = false" @keydown.enter.prevent="go" @keydown.esc.prevent="editing = false" />
		<b-breadcrumb v-else size="is-medium">
			<b-breadcrumb-item v-for="(item, index) in pathCollection" v-show="item.show || item == activeHide"
				:key="item + index"
				:active="checkActive(index)" @click="open(item)">
				<template v-if="item == activeHide">
					<b-dropdown ref="breadDrop" :triggers="['']" animation="fade1" append-to-body aria-role="list"
						class="file-dropdown">
						<template #trigger>
							<p role="button">
								<b-icon id="das" custom-size="mdi-18px" icon="dots-horizontal">
								</b-icon>
							</p>
						</template>
						<b-dropdown-item v-for="(sitem, index) in hideItems" :key="`ff${index}`" aria-role="menuitem"
							@click="subOpen(sitem)">
							{{ sitem.name }}
						</b-dropdown-item>

					</b-dropdown>
				</template>
				<template v-else>
					{{ item.name }}
				</template>
			</b-breadcrumb-item>
		</b-breadcrumb>
		<b-tooltip v-if="!editing" :label="$t('Type a path')" position="is-bottom" type="is-dark">
			<button :aria-label="$t('Type a path')" class="path-button" data-path-edit type="button" @click="edit">
				<b-icon custom-size="mdi-16px" icon="pencil-outline" />
			</button>
		</b-tooltip>
		<b-tooltip :label="copied ? $t('Copied') : $t('Copy Path')" position="is-bottom" type="is-dark">
			<button :aria-label="$t('Copy Path')" class="path-button" data-path-copy type="button" @mousedown.prevent @click="copyCurrent">
				<b-icon :icon="copied ? 'check' : 'content-copy'" custom-size="mdi-16px" />
			</button>
		</b-tooltip>
		<b-breadcrumb id="shadowBread" class="shadow" size="is-medium">
			<b-breadcrumb-item v-for="(item, index) in pathCollection" :key="`fake${item}${index}`">
				{{ item.name }}
			</b-breadcrumb-item>
		</b-breadcrumb>
	</div>
</template>

<script>
import slice from 'lodash/slice'
import map from 'lodash/map'
import sum from 'lodash/sum'
import remove from 'lodash/remove'
import findLast from 'lodash/findLast'
import copy from 'clipboard-copy'
import { typedPath } from '../filesLot'

export default {
	inject: ['filePanel'],
	data() {
		return {
			pathCollection: [],
			hideItems: [],
			activeHide: {},
			editing: false,
			typed: '',
			copied: false,
		}
	},
	watch: {
		'$store.state.currentPath': {
			handler(val) {
				this.pathCollection = this.buildPathArray(val)
				this.onResize()
			},
			deep: true,
		},
	},
	computed: {
		dropMenu() {
			return this.$refs.breadDrop[0]
		},
	},
	created() {
		this.pathCollection = this.buildPathArray(this.$store.state.currentPath)
	},
	mounted() {

	},
	methods: {
		open(item) {
			if (item == this.activeHide) {
				this.$refs.breadDrop[0].isActive = !this.$refs.breadDrop[0].isActive
				return false
			}
			this.filePanel.getFileList(item.path)
		},
		subOpen(item) {
			this.filePanel.getFileList(item.path)
			// this.onResize(this.pathArray)
		},
		edit() {
			this.typed = this.$store.state.currentPath
			this.editing = true
			this.$nextTick(() => {
				this.$refs.pathInput?.focus()
				this.$refs.pathInput?.$el.querySelector('input')?.select()
			})
		},
		go() {
			const path = typedPath(this.typed, this.$store.state.currentPath)
			this.editing = false
			if (path) {
				this.filePanel.getFileList(path)
			}
		},
		copyCurrent() {
			copy(this.$store.state.currentPath)
			this.copied = true
			clearTimeout(this.copiedTimer)
			this.copiedTimer = setTimeout(() => {
				this.copied = false
			}, 1500)
		},
		checkActive(index) {
			return index == this.pathCollection.length - 1
		},
		onResize() {
			const shadowBread = document.getElementById('shadowBread')
			const containerWidth = document.getElementById('bread-container').clientWidth
			this.$nextTick(() => {
				this.hideItems = []
				const shadowBreadWidth = shadowBread.clientWidth
				if (shadowBreadWidth > containerWidth) {
					const shadowBreadList = shadowBread.getElementsByTagName('li')
					const shadowBreadListWidth = map(shadowBreadList, (item) => {
						return item.clientWidth
					})
					this.pathCollection.forEach((item, index) => {
						if (index > 0 && sum(shadowBreadListWidth) + 50 > containerWidth && index < this.pathCollection.length - 1) {
							remove(shadowBreadListWidth, (item, index) => {
								return index == 1
							})
							item.show = false
							this.hideItems.push(item)
						}
					})
					this.activeHide = findLast(this.pathCollection, (item) => {
						return !item.show
					})
				}
			})
		},

		buildPathArray(path) {
			if (path == '/') {
				path = path.substr(1)
			}
			const arr = path.split('/')
			const collection = arr.map((item, index) => {
				return {
					name: item == '' ? 'Root' : item,
					show: true,
					path: item == '' ? '/' : slice(arr, 0, index + 1).join('/'),
				}
			})
			return collection
		},
	},
}
</script>

<style lang="scss" scoped>
.path-bar {
	min-width: 0;
}

.path-input {
	max-width: 40rem;
}

.path-button {
	display: inline-flex;
	align-items: center;
	margin-left: 0.25rem;
	padding: 0.125rem;
	border: none;
	border-radius: 0.25rem;
	background: transparent;
	color: inherit;
	cursor: pointer;
	opacity: 0.6;

	&:hover,
	&:focus-visible {
		opacity: 1;
	}
}
</style>
