<!--
 * Replaces vue-codemirror@4, a Vue 2-only wrapper. Its successor (v6) requires
 * CodeMirror 6, a rewrite in which modes become Lezer packages and addons
 * become extensions; codemirror@5 itself is still maintained and has no
 * framework binding, so the wrapper was the only Vue 2 piece to own.
 *
 * Covers what the two call sites use and nothing more: `value` in, `input` out,
 * a `ready` event carrying the instance, and the same `.vue-codemirror` root
 * element - _filebrowser.scss sizes the file editor through that class.
 *
 * Dropped with the library: the merge view, `code` as an alias of `value`, the
 * gutter markers (`marker` / `unseenLines`), the `name` and `placeholder`
 * attributes, global options and events, the deep `options` watcher, and the 18
 * CodeMirror events it re-emitted under two spellings each. No call site used
 * one; both change their options through the instance, not through the prop.
 -->
<template>
	<div class="vue-codemirror">
		<textarea ref="textarea"></textarea>
	</div>
</template>

<script>
import CodeMirror from 'codemirror'

export default {
	name: 'CodeMirrorEditor',
	// Declared, or Vue 3 also passes `@input` down to the root element as a native listener: the
	// hidden textarea of CodeMirror fires a real `input` event that bubbles up to it, and the
	// parent's handler then received that Event where it expected the text (the .env editor sent
	// the JSON of an Event as the app's .env).
	emits: ['input', 'ready'],
	props: {
		value: {
			type: String,
			default: '',
		},
		options: {
			type: Object,
			default: () => ({}),
		},
	},
	watch: {
		value(next) {
			// A parent bound with v-model hands us back the value we just emitted.
			// Writing it in again would reset the cursor to the end of the document
			// on every keystroke, so only write a value the editor does not hold.
			if (this.codemirror && next !== this.codemirror.getValue()) {
				const scroll = this.codemirror.getScrollInfo()
				this.codemirror.setValue(next)
				this.codemirror.scrollTo(scroll.left, scroll.top)
			}
		},
	},
	mounted() {
		// Deliberately not in data(): Vue 2 would deep-observe the editor, its
		// document and its DOM. The library did that, nothing needs it.
		this.codemirror = CodeMirror.fromTextArea(this.$refs.textarea, this.options)
		// Before the listener, so mounting with a value does not emit `input`.
		this.codemirror.setValue(this.value)
		this.codemirror.on('change', cm => this.$emit('input', cm.getValue()))
		this.$emit('ready', this.codemirror)
		// The editor measures itself as it is created, when a container inside a
		// modal or behind a v-if is often not laid out yet.
		this.$nextTick(() => this.refresh())
	},
	beforeUnmount() {
		// Puts the textarea back and unhooks the editor, rather than the library's
		// "remove the wrapper element and leave the instance running".
		this.codemirror.toTextArea()
	},
	methods: {
		refresh() {
			this.codemirror.refresh()
		},
	},
}
</script>
