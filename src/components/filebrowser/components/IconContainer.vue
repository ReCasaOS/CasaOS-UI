<!--
 * @Author: Jerryk jerry@icewhale.org
 * @Date: 2022-05-04 17:01:10
 * @LastEditors: Jerryk jerry@icewhale.org
 * @LastEditTime: 2022-08-02 12:10:03
 * @FilePath: \CasaOS-UI\src\components\filebrowser\components\IconContainer.vue
 * @Description:
 *
 * Copyright (c) 2022 by IceWhale, All Rights Reserved.
-->
<template>
	<div :class="coverType(item)">
		<transition name="fade">
			<img v-if="showThumb" key="thumb" :class="isWide ? 'thumb-w' : 'thumb-h'" :src="imageData" alt="folder"
				class="is-absolute">
			<img v-else key="icon" :class="iconType(item)" :src="getIconFile(item)" alt="folder" class=" is-absolute">
		</transition>
		<div class="overlay-layer">
			<span v-if="badge" class="file-badge" data-file-badge>{{ badge }}</span>
			<b-icon v-if="isShared" class="share-icon casa-color-green casa-shape-rounded casa-shape-32px" custom-size="casa-28px"
				icon="share" pack="casa"></b-icon>
		</div>
	</div>
</template>

<script>
import { mixin } from '@/mixins/mixin'
import IconContainerMixin from '@/mixins/IconContainerMixin'

export default {
	mixins: [mixin, IconContainerMixin],
}
</script>

<style lang="scss" scoped>
.overlay-layer {
	position: absolute;
	width: 100%;
	height: 100%;
	z-index: 10;

	.share-icon {
		position: absolute;
		right: 0.75rem;
		bottom: 0;
	}
}
.file-badge {
	position: absolute;
	left: 50%;
	bottom: 0.5rem;
	transform: translateX(-50%);
	padding: 0 0.3rem;
	border-radius: 0.25rem;
	background: rgba(26, 31, 36, 0.85);
	color: #fff;
	font-size: 0.625rem;
	font-weight: 600;
	line-height: 1rem;
	letter-spacing: 0.02em;
	pointer-events: none;

	&.is-small {
		bottom: 0;
		padding: 0 0.15rem;
		font-size: 0.5rem;
		line-height: 0.75rem;
	}
}
</style>
