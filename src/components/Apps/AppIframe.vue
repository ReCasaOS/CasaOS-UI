<template>
	<section aria-modal="true"
		class="app-iframe-overlay"
		role="dialog"
		:aria-label="appName">
		<transition name="c-zoom-in" appear>
			<div class="app-iframe-dialog">
				<header class="app-iframe-header is-flex is-align-items-center">
					<h1 class="app-iframe-title is-flex-grow-1 mb-0">
						{{ appName }}
					</h1>
					<button class="app-iframe-close"
						type="button"
						:aria-label="$t('Close')"
						:title="$t('Close')"
						@click="$emit('close')">
						<b-icon custom-size="casa-24px" icon="close-outline" pack="casa" />
					</button>
				</header>
				<div class="app-iframe-content">
					<div v-if="refusal"
						class="app-iframe-refused is-flex is-flex-direction-column is-align-items-center is-justify-content-center has-text-centered">
						<p class="mb-4">
							{{ refusal }}
						</p>
						<b-button rounded type="is-primary" @click="openInTab">
							{{ $t('Open in a new tab') }}
						</b-button>
					</div>
					<iframe v-else
						:src="url"
						:title="appName"
						allow="autoplay; fullscreen"
						allowfullscreen
						class="app-iframe"></iframe>
				</div>
			</div>
		</transition>
	</section>
</template>

<script>
import { rememberFrameRefused } from '@/mixins/app/frameCheck'

// What the user is told, by the reason the box gives (AppManagement /web/frame-check).
const REFUSALS = {
	'x-frame-options': '{name} does not allow being shown inside another page.',
	'frame-ancestors': '{name} does not allow being shown inside another page.',
	'untrusted-certificate': '{name} uses an HTTPS certificate the browser does not trust, and inside the dashboard there is no way to accept it.',
	'mixed-content': '{name} is served over plain HTTP, which the browser does not show inside a dashboard opened over HTTPS.',
}

export default {
	name: 'AppIframe',
	props: {
		appName: {
			type: String,
			default: '',
		},
		url: {
			type: String,
			required: true,
		},
	},
	emits: ['close'],
	data() {
		return {
			reason: null,
		}
	},
	computed: {
		refusal() {
			const message = this.reason && REFUSALS[this.reason]
			return message ? this.$t(message, { name: this.appName }) : ''
		},
	},
	watch: {
		url: {
			immediate: true,
			handler(url) {
				this.reason = null
				this.check(url)
			},
		},
	},
	methods: {
		// A browser that refuses the frame leaves it empty and tells this page nothing,
		// so the box asks the app the way the browser does. Anything short of a "no" --
		// no answer, an AppManagement without the endpoint -- leaves the frame as it is.
		async check(url) {
			try {
				const res = await this.$api.webFrame.check(url, window.location.origin)
				const answer = res.data && res.data.data
				if (url !== this.url || !answer || answer.embeddable !== false) {
					return
				}
				this.reason = answer.reason
				rememberFrameRefused(url)
			} catch {
				// not an answer either way
			}
		},
		openInTab() {
			window.open(this.url, '_blank')
			this.$emit('close')
		},
	},
}
</script>

<style lang="scss" scoped>
.app-iframe-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  overflow: auto;
  background: rgba(0, 0, 0, 0.8);
}

.app-iframe-dialog {
  display: flex;
  flex-direction: column;
  width: 90vw;
  height: 90vh;
  max-width: 81rem;
  min-height: 0;
  overflow: hidden;
  background: var(--casa-surface);
  border-radius: 0.5rem;
  box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.25);
}

.app-iframe-header {
  flex: 0 0 3.5rem;
  min-height: 3.5rem;
  padding: 1.25rem 1.25rem 0.5rem 1.5rem;
  color: var(--casa-text-emphasis);
  background-color: var(--casa-surface-head);
  border-bottom: 1px solid var(--casa-divider);
}

.app-iframe-title {
  overflow: hidden;
  color: inherit;
  font-size: 1rem;
  font-weight: 500;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-iframe-close {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 2.25rem;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  color: inherit;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 0.25rem;
}

.app-iframe-close:hover,
.app-iframe-close:focus-visible {
  background: rgba(0, 0, 0, 0.08);
}

.app-iframe-close:focus {
  outline: 2px solid var(--casa-focus-ring);
  outline-offset: 2px;
}

.app-iframe-content {
  flex: 1 1 auto;
  min-height: 0;
  background: var(--casa-surface);
}

.app-iframe-refused {
  height: 100%;
  max-width: 36rem;
  margin: 0 auto;
  padding: 2rem;
  color: var(--casa-text-emphasis);
}

.app-iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}

@media screen and (max-width: 768px) {
  .app-iframe-overlay {
    padding: 0;
  }

  .app-iframe-dialog {
    width: 100%;
    height: 100%;
    border-radius: 0;
  }
}
</style>
