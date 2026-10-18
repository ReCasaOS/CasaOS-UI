<template>
	<div class="os-copy" :class="{ 'is-block': block }">
		<!-- a text node: the lines come from the machine and from the core, never HTML -->
		<pre v-if="block" :id="id" ref="text" class="os-copy-text" tabindex="0">{{ text }}</pre>
		<code v-else :id="id" ref="text" class="os-copy-text">{{ text }}</code>
		<b-button class="os-copy-button"
			:aria-describedby="id"
			:label="$t('Copy')"
			rounded
			size="is-small"
			@click="copyText" />
		<p v-if="refused" class="os-copy-refused is-size-7 mt-1" role="status">
			{{ $t('Your browser did not allow copying. The text is selected: copy it with Ctrl+C.') }}
		</p>
	</div>
</template>

<script>
import copy from 'clipboard-copy'

let counter = 0

export default {
	name: 'OsUpgradeCopyable',
	props: {
		// what is shown and copied: kept whole
		text: {
			type: String,
			required: true,
		},
		// several lines, in a box that scrolls on its own, instead of one command on a line
		block: {
			type: Boolean,
			default: false,
		},
	},
	data() {
		counter += 1
		return {
			id: `os-copy-${counter}`,
			// the browser did not allow the clipboard (a box served over plain http): the text is selected, to copy by hand
			refused: false,
		}
	},
	methods: {
		copyText() {
			Promise.resolve().then(() => copy(this.text)).then(
				() => {
					this.refused = false
					this.$buefy.toast.open({ message: this.$t('Copied to clipboard'), type: 'is-success' })
				},
				() => {
					this.refused = true
					this.$nextTick(this.select)
				},
			)
		},
		select() {
			const element = this.$refs.text
			const selection = window.getSelection?.()
			if (!element || !selection)
				return
			const range = document.createRange()
			range.selectNodeContents(element)
			selection.removeAllRanges()
			selection.addRange(range)
		},
	},
}
</script>

<style lang="scss" scoped>
.os-copy {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.5rem;
}

// a command is text to read and to paste, not a warning: the colour of Bulma's code is a red
.os-copy-text {
	padding: 0.1rem 0.3rem;
	color: var(--casa-text);
	background: var(--casa-surface-sunken);
	overflow-wrap: anywhere;
}

// the text of a run scrolls in its own box and never makes the window wider
.os-copy.is-block {
	display: block;

	.os-copy-text {
		display: block;
		max-width: 100%;
		max-height: 20rem;
		margin-bottom: 0.5rem;
		padding: 0.5rem;
		overflow: auto;
		white-space: pre;
		overflow-wrap: normal;
		font-size: 0.8125rem;
	}
}
</style>
