<template>
	<div class="modal-card os-support-modal">
		<header class="modal-card-head">
			<!-- takes the focus when the window opens, to be read; nobody types into it -->
			<h3 ref="title" class="title is-header os-title" tabindex="-1">
				{{ $t('Operating system') }}
			</h3>
		</header>

		<!-- every value below is a text node: the names come from the machine and from the core, never HTML -->
		<section class="modal-card-body">
			<p class="os-name has-text-weight-semibold">
				{{ name }}
			</p>
			<p v-if="os.arch" class="os-arch is-size-7 _has-text-gray">
				{{ os.arch }}
			</p>

			<b-message v-if="statusText"
				:type="os.support.state === 'security_ended' ? 'is-danger' : 'is-warning'"
				class="os-status mt-3"
				size="is-small">
				{{ statusText }}
			</b-message>

			<p v-if="extendedText" class="os-extended _has-text-gray mt-3">
				{{ extendedText }}
			</p>

			<template v-if="nextName">
				<p class="os-next mt-3">
					{{ $t('{name} is the next release.', { name: nextName }) }}
				</p>
				<p class="os-cannot mt-1">
					{{ $t('ReCasaOS cannot upgrade the operating system for you yet.') }}
				</p>
				<p class="os-snapshot mt-1">
					{{ $t('There is no automatic way back from an upgrade: a snapshot of the machine is what lets you go back, and console access is for when the machine does not start. Take a snapshot before any upgrade.') }}
				</p>
				<p v-if="link" class="os-link mt-2">
					<a :href="link.href" rel="noopener noreferrer" target="_blank">{{ $t(link.label) }}</a>
				</p>
			</template>
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button :label="$t('Close')" rounded @click="$emit('close')" />
		</footer>
	</div>
</template>

<script>
import { extendedSentence, releaseLink, releaseName, supportSentence } from './osSupport'

export default {
	name: 'OsSupportModal',
	props: {
		// GET /v1/sys/os, as the top bar read it.
		os: {
			type: Object,
			required: true,
		},
	},
	emits: ['close'],
	computed: {
		name() {
			return releaseName(this.os)
		},
		// The date is written in the language of the sentence: a language without this
		// window's texts falls back to English, and so does its date. The title is the
		// key asked, because $te reads a key with a full stop as a path.
		locale() {
			return this.$te('Operating system') ? this.$i18n.locale : 'en_us'
		},
		statusText() {
			const sentence = supportSentence(this.os.support, this.locale, this.os.id)
			return sentence && this.$t(sentence.key, { name: this.name, date: sentence.date })
		},
		// The later programme, named and dated, with no word on its price or on whose it is.
		extendedText() {
			const sentence = extendedSentence(this.os.support?.extended, this.locale)
			return sentence && this.$t(sentence.key, { name: this.os.support.extended.name, date: sentence.date })
		},
		nextName() {
			return releaseName(this.os.next)
		},
		link() {
			return releaseLink(this.os.next)
		},
	},
	// The window opens with the reader on its heading. Buefy's own autoFocus is off
	// where the window is opened: it would move the focus to the window's frame.
	mounted() {
		this.$nextTick(() => this.$refs.title?.focus?.({ preventScroll: true }))
	},
}
</script>

<style lang="scss" scoped>
.os-title:focus {
	outline: none;
}

// the names come from the machine and the core: a long one wraps instead of leaving the window
.os-support-modal .modal-card-body {
	font-size: 0.875rem;
	overflow-wrap: anywhere;
}

.os-support-modal .os-name {
	font-size: 1rem;
}

.os-support-modal .os-status {
	font-size: 0.875rem;
}

// The link blue is 4.3:1 on the light card: the text colour, underlined, reads at AA in both themes.
.os-support-modal .os-link a {
	color: var(--casa-text);
	text-decoration: underline;
}
</style>
