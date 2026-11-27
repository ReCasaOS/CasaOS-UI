<template>
	<div class="json-tree">
		<!-- every key and every value comes from an address: text only, never markup -->
		<template v-if="branch">
			<div class="json-line">
				<button :aria-expanded="open ? 'true' : 'false'" class="json-button" data-json-toggle type="button" @click="open = !open">
					<span aria-hidden="true" class="json-arrow">{{ open ? '▾' : '▸' }}</span>
					<span class="json-key">{{ name }}</span>
					<span class="json-size">{{ sizeText }}</span>
				</button>
				<template v-if="isArray">
					<button class="json-button json-use" data-json-each type="button" @click="pick('each')">
						{{ $t('One row per item') }}
					</button>
					<button class="json-button json-use" data-json-count type="button" @click="pick('count')">
						{{ $t('Count') }}
					</button>
				</template>
			</div>
			<div v-if="open" class="json-children" role="group">
				<json-tree v-for="key in keys" :key="key" :path="[...path, key]" :value="value[key]" @pick="$emit('pick', $event)" />
				<button v-if="size > shown" class="json-button json-use" data-json-more type="button" @click="shown += PAGE">
					{{ $t('Show more ({count} left)', { count: size - shown }) }}
				</button>
			</div>
		</template>
		<button v-else :title="$t('Add as a row')" class="json-button json-leaf" data-json-leaf type="button" @click="pick('leaf')">
			<span class="json-key">{{ name }}</span>{{ ' ' }}<span class="json-value">{{ text }}</span>
		</button>
	</div>
</template>

<script>
// the children of a node that are drawn at once
const PAGE = 50
// the levels that are open at first: the root and its children
const OPEN_LEVELS = 2
const MAX_TEXT = 80

/**
 * An answer in JSON, as a tree of buttons. A click says `pick`: { kind, path, value }, `path` being the keys and indexes from the root.
 * `kind` is `leaf` for a value, and `each` or `count` for the two things an array offers.
 */
export default {
	name: 'JsonTree',
	props: {
		// any JSON value; not declared with a type: null is one
		value: { default: null },
		path: { type: Array, default: () => [] },
	},
	emits: ['pick'],
	data() {
		return { open: this.path.length < OPEN_LEVELS, shown: PAGE, PAGE }
	},
	computed: {
		isArray() {
			return Array.isArray(this.value)
		},
		branch() {
			return this.value !== null && typeof this.value === 'object'
		},
		size() {
			return this.isArray ? this.value.length : Object.keys(this.value).length
		},
		sizeText() {
			return this.isArray ? `[${this.size}]` : `{${this.size}}`
		},
		keys() {
			return this.isArray ? Array.from({ length: Math.min(this.size, this.shown) }, (_, index) => index) : Object.keys(this.value).slice(0, this.shown)
		},
		name() {
			return this.path.length ? String(this.path.at(-1)) : this.$t('Answer')
		},
		text() {
			const text = JSON.stringify(this.value) ?? ''
			return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text
		},
	},
	methods: {
		pick(kind) {
			this.$emit('pick', { kind, path: this.path, value: this.value })
		},
	},
}
</script>

<style lang="scss" scoped>
.json-tree {
	font-family: monospace;
	font-size: 0.8125rem;
	line-height: 1.6;
}

.json-children {
	padding-left: 1rem;
}

.json-line {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 0 0.5rem;
}

.json-button {
	padding: 0 0.25rem;
	border: 0;
	border-radius: 0.25rem;
	background: none;
	color: inherit;
	font: inherit;
	text-align: left;
	cursor: pointer;

	&:hover,
	&:focus-visible {
		background: rgba(128, 128, 128, 0.2);
	}
}

.json-leaf {
	display: block;
	max-width: 100%;
	overflow-wrap: anywhere;
}

.json-key {
	font-weight: 600;
	margin-right: 0.375rem;
}

.json-size,
.json-value {
	opacity: 0.75;
}

.json-use {
	text-decoration: underline;
	font-family: inherit;
}
</style>
