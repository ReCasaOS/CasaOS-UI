<template>
	<div class="overlay common-modal-background">
		<header class="modal-card-head">
			<div class="is-flex-grow-1 is-flex">
				<!-- Title Start -->
				<h3 class="title is-5 one-line mr-4">{{ item.name }}</h3>
				<!-- Title End -->
			</div>
			<div class="is-flex is-align-items-center">
				<!-- Download File Button Start -->
				<b-button icon-left="downloads-outline" icon-pack="casa" type="is-primary" size="is-small"
					:label="$t('Download')" class="mr-2" rounded @click="download" />
				<!-- Download File Button End -->

				<!-- Close Button Start -->
				<div class="close-button" @click="$emit('close')">
					<b-icon icon="close-outline" pack="casa"></b-icon>
				</div>
				<!-- Close File Button End -->
			</div>
		</header>

		<!-- Player Start -->
		<div ref="playerContainer"
			class="is-flex is-justify-content-center is-align-items-center is-flex-grow-1 v-container video pt-4 pb-5">
			<div class="audio-blur-background" v-if="poster != ''"></div>
			<div class="video-container" :class="{ 'is-align-items-center': isAudio }">
				<div key="video-player" ref="artRef" v-if="isVideo" class="player">
				</div>
				<div v-if="isAudio" :key="item.path" class="player-audio">
					<p class="has-text-centered one-line mb-2">{{ audioTitle }}<template v-if="audioArtist"> - {{ audioArtist }}</template></p>
					<audio :src="getFileUrl(item)" autoplay controls preload="auto" style="width: 100%"></audio>
				</div>
			</div>
		</div>
		<!-- Player Start -->

		<!-- Player Footer Start -->
		<div class="v-footer is-flex is-justify-content-center">
		</div>
		<!-- Player Footer End -->
	</div>
</template>

<script>
import Artplayer from 'artplayer'
import { parseWebStream } from 'music-metadata'
import { defaultSubtitle, playerLang, subtitlesFor } from './subtitles'
import { mixin } from '@/mixins/mixin'

// ArtPlayer 5 carries English and Chinese; the other languages it has are
// loaded when the dashboard is in one of them
const PLAYER_I18N = {
	ar: () => import('artplayer/i18n/ar'),
	cs: () => import('artplayer/i18n/cs'),
	es: () => import('artplayer/i18n/es'),
	fa: () => import('artplayer/i18n/fa'),
	fr: () => import('artplayer/i18n/fr'),
	id: () => import('artplayer/i18n/id'),
	pl: () => import('artplayer/i18n/pl'),
	ru: () => import('artplayer/i18n/ru'),
	tr: () => import('artplayer/i18n/tr'),
	vi: () => import('artplayer/i18n/vi'),
}

export default {
	mixins: [mixin],
	props: {
		item: {
			type: Object,
			default: () => {
				return {
					path: '',
					name: '',
				}
			},
		},
		list: {
			type: Array,
			default: () => {
				return []
			},
		},
	},
	data() {
		return {
			type: '',
			ext: '',
			instance: null,
			poster: '',
			audioTitle: this.item.name,
			audioArtist: '...',
			destroyed: false,
		}
	},
	computed: {
		isVideo() {
			return this.type == 'video-x-generic'
		},
		isAudio() {
			return this.type == 'audio-x-generic'
		},
	},

	mounted() {
		this.ext = this.getFileExt(this.item, true)
		Object.keys(this.typeMap).forEach((_type) => {
			const extensions = this.typeMap[_type]
			if (extensions.includes(this.ext)) {
				this.type = _type
			}
		})
		this.$nextTick(() => {
			if (this.isAudio) {
				(async () => {
					const fileUrl = this.getFileUrl(this.item)
					// What music-metadata-browser's fetchFromUrl did, on music-metadata's own API.
					const response = await fetch(fileUrl)
					if (!response.ok)
						throw new Error(`Failed to fetch ${fileUrl}: ${response.status}`)
					const metadata = await parseWebStream(response.body, {
						mimeType: response.headers.get('Content-Type') ?? undefined,
						size: Number(response.headers.get('Content-Length')) || undefined,
					})
					// The tags are parsed: stop downloading whatever is left of the file.
					if (!response.body.locked)
						await response.body.cancel()
					if (metadata.common.picture) {
						const blob = new Blob([metadata.common.picture[0].data], { type: metadata.common.picture[0].format })
						const url = URL.createObjectURL(blob)
						this.poster = url
						this.$refs.playerContainer.style.backgroundImage = `url(${this.poster})`
						this.$refs.playerContainer.style.backgroundSize = 'cover'
						this.$refs.playerContainer.style.backgroundPosition = 'center'
					}
					// 将图片作为div.v-container的背景图，并且增加模糊效果

					this.audioTitle = metadata.common.title || this.item.name
					this.audioArtist = metadata.common.artist
				})()
			} else {
				this.createPlayer()
			}
		})
	},

	beforeUnmount() {
		this.destroyed = true
		if (this.instance && this.instance.destroy) {
			this.instance.destroy(false)
		}
	},
	methods: {
		close() {
			this.$emit('close')
		},

		// The subtitle files in the video's folder go in the settings menu; one
		// named after the video is shown at start.
		async createPlayer() {
			const lang = playerLang(this.$i18n.locale)
			const i18n = PLAYER_I18N[lang] ? { [lang]: (await PLAYER_I18N[lang]()).default } : undefined
			// closed while its language loaded
			if (this.destroyed) {
				return
			}
			const subtitles = subtitlesFor(this.item, this.list)
			const shown = defaultSubtitle(subtitles)
			const track = subtitle => ({ url: this.getFileUrl(subtitle), type: subtitle.type, name: subtitle.name })
			const settings = subtitles.length === 0
				? []
				: [{
						html: this.$t('Subtitles'),
						tooltip: shown ? shown.name : this.$t('No subtitles'),
						selector: [
							{ html: this.$t('No subtitles'), default: !shown },
							...subtitles.map(subtitle => ({ html: subtitle.name, default: subtitle === shown, subtitle })),
						],
						onSelect: (option) => {
							if (option.subtitle) {
								const { url, ...rest } = track(option.subtitle)
								this.instance.subtitle.switch(url, rest)
								this.instance.subtitle.show = true
							} else {
								this.instance.subtitle.show = false
							}
							return option.html
						},
					}]
			this.instance = new Artplayer({
				url: this.getFileUrl(this.item),
				container: this.$refs.artRef,
				setting: true,
				flip: true,
				playbackRate: true,
				aspectRatio: true,
				subtitleOffset: true,
				fullscreenWeb: true,
				fullscreen: true,
				autoplay: true,
				pip: true,
				theme: '#007AE5',
				playsInline: true,
				screenshot: true,
				airplay: true,
				playsinline: true,
				lang,
				settings,
				// ArtPlayer checks its options' types: an absent one is left out
				...(i18n && { i18n }),
				...(shown && { subtitle: track(shown) }),
			})
		},
	},
}
</script>

<style lang="scss" scoped>
.player {
	height: 100%;
	width: 100%;
}

.player-audio {
	width: 100%;
	max-width: 80rem;
}

.audio-blur-background {
	width: 100%;
	height: 100%;
	margin: -1rem 0 -1.5rem 0;
	background-size: cover;
	background-position: bottom center;
	background-attachment: fixed;
	background-color: rgba(53, 54, 58, 0.4);
	-webkit-backdrop-filter: blur(5px) saturate(180%);
	backdrop-filter: blur(10px) saturate(180%);
	border: none;
	position: absolute;
	z-index: 0;
	overflow: hidden;
}
</style>
