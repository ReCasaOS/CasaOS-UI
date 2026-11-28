<template>
	<div class="modal-card api-widget-editor touch-targets">
		<header class="modal-card-head">
			<h3 class="title is-header">
				{{ editing ? $t('Edit an API widget') : importing ? $t('Import an API widget') : $t('Add an API widget') }}
			</h3>
		</header>

		<!-- every text here may come from a recipe, from an address or from the core: text only, never markup -->
		<section class="modal-card-body">
			<div class="is-flex is-flex-wrap-wrap is-gap-1">
				<b-field :label="$t('Name')" class="grows">
					<b-input v-model="form.name" :aria-label="$t('Name')" :has-counter="false" :maxlength="MAX_TEXT" data-editor-name />
				</b-field>
				<b-field :label="$t('Icon')">
					<b-select v-model="form.icon" :aria-label="$t('Icon')" data-editor-icon>
						<option value="">
							{{ $t('Default icon') }}
						</option>
						<option v-for="icon in icons" :key="icon" :value="icon">
							{{ icon }}
						</option>
					</b-select>
				</b-field>
			</div>

			<!-- what will leave the box, said before anything is tested -->
			<b-message v-if="importing" class="mb-3" data-editor-sent size="is-small" type="is-info">
				<p>{{ $t('This recipe makes the box send, to the address you type below:') }}</p>
				<p>GET {{ built.path }}</p>
				<p v-for="part in sent" :key="part.where">
					{{ part.value === null ? $t('{where}: a secret you type below', { where: part.where }) : $t('{where}: {value}', { where: part.where, value: part.value }) }}
				</p>
				<p>{{ $t('Nothing is sent before you press Test.') }}</p>
			</b-message>

			<div class="settings-card mb-3">
				<div class="is-flex is-flex-wrap-wrap is-gap-1">
					<b-field :label="$t('Base address')" class="grows">
						<b-input v-model="base" :aria-label="$t('Base address')" :placeholder="form.baseHint || 'http://192.168.1.10:8080'" data-editor-base @blur="leaveBase" @update:model-value="baseTyped = true" />
					</b-field>
					<b-field :label="$t('Path')" class="grows">
						<b-input v-model="form.path" :aria-label="$t('Path')" data-editor-path placeholder="/api/status" @blur="leavePath" />
					</b-field>
				</div>
				<b-switch v-model="insecure" class="mb-3" data-editor-insecure size="is-small">
					{{ $t('Accept a self-signed certificate') }}
				</b-switch>

				<div v-for="group in groups" :key="group.field" :data-pairs="group.field" class="mb-3">
					<p class="has-text-weight-semibold is-size-7 mb-1">
						{{ group.title }}
					</p>
					<div v-for="(pair, index) in form[group.field]" :key="index" class="is-flex is-flex-wrap-wrap is-gap-1 is-align-items-center mb-1" data-pair>
						<b-input :aria-label="group.name" :model-value="pair.name" :placeholder="group.name" class="grows" data-pair-name size="is-small" @update:model-value="rename(pair, $event)" />
						<b-input v-model="pair.value" :aria-label="secretOf(pair) ? $t('Secret of {name}', { name: pair.name }) : $t('Value of {name}', { name: pair.name })"
							:placeholder="secretOf(pair) ? keptText(pair) : $t('Value')" :type="secretOf(pair) ? 'password' : 'text'" autocomplete="new-password" class="grows" data-pair-value size="is-small" />
						<b-checkbox :disabled="forced(pair)" :model-value="secretOf(pair)" data-pair-secret size="is-small" @update:model-value="setSecret(pair, $event)">
							{{ $t('Secret') }}
						</b-checkbox>
						<b-button :aria-label="$t('Remove {name}', { name: pair.name })" data-pair-remove rounded size="is-small" @click="form[group.field].splice(index, 1)">
							{{ $t('Remove') }}
						</b-button>
					</div>
					<b-button :disabled="form[group.field].length >= MAX_PAIRS" data-pair-add rounded size="is-small" @click="form[group.field].push(blankPair())">
						{{ group.add }}
					</b-button>
				</div>

				<b-switch v-model="form.basicOn" data-editor-basic size="is-small">
					{{ $t('Basic authentication') }}
				</b-switch>
				<div v-if="form.basicOn" class="is-flex is-flex-wrap-wrap is-gap-1 is-align-items-center mt-2">
					<b-input v-model="form.basicUser.value" :aria-label="$t('User')" :placeholder="secretOf(form.basicUser) ? keptText(form.basicUser) || $t('User') : $t('User')"
						:type="secretOf(form.basicUser) ? 'password' : 'text'" autocomplete="new-password" class="grows" data-basic-user size="is-small" />
					<b-checkbox :model-value="form.basicUser.secret" data-basic-user-secret size="is-small" @update:model-value="setSecret(form.basicUser, $event)">
						{{ $t('Secret') }}
					</b-checkbox>
					<b-input v-model="form.basicPassword.value" :aria-label="$t('Password')" :placeholder="keptText(form.basicPassword) || $t('Password')" autocomplete="new-password" class="grows"
						data-basic-password size="is-small" type="password" />
				</div>

				<p v-if="secretsAgain" class="is-size-7 has-text-warning mt-3" data-editor-secrets-again role="status">
					{{ $t('The address or the request changed: type every secret again. A saved secret is never sent to another address, or in another request, than the one it was typed for.') }}
				</p>
				<p class="is-size-7 mt-3">
					{{ $t('A secret stays on the box: it is never shown again, and never goes into an exported recipe.') }}
				</p>

				<div class="is-flex is-flex-wrap-wrap is-gap-1 is-align-items-center mt-3">
					<b-button :disabled="!canTest" :loading="testing" data-editor-test rounded type="is-primary" @click="test">
						{{ $t('Test') }}
					</b-button>
					<span class="is-size-7">{{ $t('The box reads the address once and shows what it answers.') }}</span>
				</div>
			</div>

			<b-message v-if="error" class="mb-3" data-editor-error size="is-small" type="is-danger">
				{{ error }}
			</b-message>

			<div v-if="hasAnswer" class="columns">
				<div class="column is-half">
					<p class="has-text-weight-semibold mb-1">
						{{ $t('Answer') }}
					</p>
					<p class="is-size-7 mb-2">
						{{ $t('Click a value to add it as a row. On a list, choose one row per item, or its count.') }}
					</p>
					<p v-if="picking" class="is-size-7 has-text-info mb-2" data-editor-picking role="status">
						{{ pickingText }}
						<b-button class="ml-1" data-editor-picking-cancel rounded size="is-small" @click="picking = null">
							{{ $t('Cancel') }}
						</b-button>
					</p>
					<p v-if="note" class="is-size-7 has-text-warning mb-2" data-editor-note role="status">
						{{ note }}
					</p>
					<div class="answer" data-editor-answer>
						<json-tree :value="answer" @pick="pick" />
					</div>
				</div>
				<div class="column is-half">
					<p class="has-text-weight-semibold mb-1">
						{{ $t('Preview') }}
					</p>
					<div :class="{ 'is-stale': stale }" class="preview" data-editor-preview>
						<module-card v-if="source" :module="{ name: 'preview', title: form.name }" :source="source" />
					</div>
					<p v-if="stale" class="is-size-7 has-text-warning mt-1" data-editor-stale role="status">
						{{ $t('Test again') }}
					</p>
					<p v-else-if="previewError" class="is-size-7 has-text-danger mt-1" data-editor-preview-error role="status">
						{{ previewError }}
					</p>
				</div>
			</div>

			<p class="has-text-weight-semibold mb-1">
				{{ $t('Rows') }}
			</p>
			<api-widget-row v-for="(row, index) in form.rows" :key="index" :row="row" @remove="removeRow(index)" />
			<div class="is-flex is-flex-wrap-wrap is-gap-1 is-align-items-center mb-3">
				<b-button :disabled="form.rows.length >= maxRows" data-row-add rounded size="is-small" @click="form.rows.push(blankRow())">
					{{ $t('Add a row by hand') }}
				</b-button>
				<b-field class="mb-0">
					<b-radio-button v-model="form.layout" data-editor-layout native-value="rows" size="is-small">
						{{ $t('Rows') }}
					</b-radio-button>
					<b-radio-button v-model="form.layout" native-value="figures" size="is-small">
						{{ $t('Large figures (4 at most)') }}
					</b-radio-button>
				</b-field>
			</div>

			<b-switch :model-value="form.status !== null" class="mb-2" data-editor-status size="is-small" @update:model-value="form.status = $event ? blankStatus() : null">
				{{ $t('Status chip at the top of the card') }}
			</b-switch>
			<template v-if="form.status">
				<api-widget-row :row="form.status" status />
				<b-button :disabled="!hasAnswer" class="mb-3" data-status-pick rounded size="is-small" @click="picking = { status: true }">
					{{ $t('Choose its value in the answer') }}
				</b-button>
			</template>

			<div class="is-flex is-flex-wrap-wrap is-gap-1 mt-3">
				<b-field :label="$t('Read again every (seconds, 60 to 3600)')">
					<b-input v-model.number="form.refresh" :aria-label="$t('Read again every (seconds, 60 to 3600)')" data-editor-refresh max="3600" min="60" type="number" />
				</b-field>
				<b-field :label="$t('Example of address, for whoever imports the recipe')" class="grows">
					<b-input v-model="form.baseHint" :aria-label="$t('Example of address, for whoever imports the recipe')" :has-counter="false" data-editor-hint maxlength="120" placeholder="http://IP:8080" />
				</b-field>
			</div>
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button :label="$t('Cancel')" rounded @click="$emit('close')" />
			<b-button :disabled="!canSave" :label="$t('Save')" :loading="saving" data-editor-save rounded type="is-primary" @click="save" />
		</footer>
	</div>
</template>

<script>
import { markRaw } from 'vue'
import ApiWidgetRow from './ApiWidgetRow.vue'
import JsonTree from './JsonTree.vue'
import { widgetView } from './format'
import { isWidgetId } from './ids'
import { MAX_PAIRS, MAX_ROWS, MAX_TEXT, blankPair, blankRow, blankStatus, countRow, emptyInputs, formOf, isSecretName, leafRow, listRow, pointerOf, recipeOf, requestOf, secretsOf, sentParts, splitBase, splitPath } from './recipe'
import ModuleCard from '@/components/moduleCards/ModuleCard.vue'
import { CARD_ICONS } from '@/components/moduleCards/moduleCards'
import events from '@/events/events'
import { createWidget, previewWidget, testWidget, updateWidget } from '@/service/apiWidgets'

// the card is evaluated again this long after the last change of the rows
const PREVIEW_AFTER_MS = 500

/**
 * The editor of an API widget: `widget` is the one to change (as the core lists it), `recipe` an imported recipe to make a new widget of;
 * neither, a new widget from nothing. An import never changes a widget.
 *
 * Only the Test button makes the box read the address. After it, a change of what is shown evaluates again the answer already received
 * (the core's preview route, which sends nothing); a change of what makes the request greys the preview until the next test.
 *
 * A secret is typed in a password field, goes to the core apart from the recipe, and lives no longer than this window: the core never
 * gives one back. The core is the judge of a recipe: what it refuses is said here as it says it.
 */
export default {
	name: 'ApiWidgetEditor',
	components: { ApiWidgetRow, JsonTree, ModuleCard },
	props: {
		widget: { type: Object, default: null },
		recipe: { type: Object, default: null },
	},
	emits: ['close'],
	data() {
		const editing = isWidgetId(this.widget?.id)
		const form = formOf(editing ? this.widget.recipe : this.recipe)
		const base = editing && typeof this.widget.base === 'string' ? this.widget.base : ''
		const insecure = editing && this.widget.insecure_tls === true
		return {
			form,
			base,
			insecure,
			editing,
			// the base is split only when it was typed here: a saved one may hold the start of a path
			baseTyped: false,
			// the request as it is saved, and whether the core said its secrets must come again
			savedRequest: requestOf(form, base, insecure),
			again: false,
			// the request of the last test that worked, with the secrets typed then, and what it answered (kept out of Vue's reach: it
			// may be 256 KiB)
			testedRequest: null,
			answer: null,
			hasAnswer: false,
			// what draws the card: a new one for each card, so that it is read at once
			source: null,
			previewError: '',
			testing: false,
			saving: false,
			error: '',
			// the next click on the answer fills this: { row, path, step } for a list, { status } for the chip
			picking: null,
			note: '',
			timer: 0,
			serial: 0,
			icons: CARD_ICONS,
			MAX_PAIRS,
			MAX_TEXT,
		}
	},
	computed: {
		groups() {
			return [
				{ field: 'headers', title: this.$t('Headers'), name: this.$t('Header name'), add: this.$t('Add a header') },
				{ field: 'query', title: this.$t('Query parameters'), name: this.$t('Parameter name'), add: this.$t('Add a parameter') },
			]
		},
		importing() {
			return !this.editing && this.recipe !== null
		},
		built() {
			return recipeOf(this.form)
		},
		// what the preview follows
		builtText() {
			return JSON.stringify(this.built)
		},
		address() {
			return this.base.trim()
		},
		request() {
			return requestOf(this.form, this.address, this.insecure)
		},
		// the request and the secrets typed for it: the answer of a test is the answer to both
		asked() {
			return this.request + JSON.stringify(secretsOf(this.form))
		},
		// the core keeps a saved secret only for the request it was typed for
		secretsAgain() {
			return this.editing && (this.again || this.request !== this.savedRequest)
		},
		stale() {
			return this.testedRequest !== null && this.testedRequest !== this.asked
		},
		sent() {
			return sentParts(this.built)
		},
		// the inputs that still need their secret
		missing() {
			const kept = this.editing && !this.secretsAgain ? this.widget.inputs_set ?? {} : {}
			return emptyInputs(this.form).filter(id => kept[id] !== true)
		},
		canTest() {
			return this.form.name !== '' && this.address !== '' && this.form.path !== '' && !this.missing.length && !this.testing && !this.saving
		},
		canSave() {
			return this.canTest && this.form.rows.length > 0
		},
		maxRows() {
			return MAX_ROWS[this.form.layout]
		},
		pickingText() {
			if (this.picking.status)
				return this.$t('Click the value that fills the status chip.')
			return this.picking.step === 'label' ? this.$t('Click, inside an item of the list, the value that names each row.') : this.$t('Now click, inside an item, the value each row shows.')
		},
	},
	watch: {
		// never before a test worked, and not while its answer is the one of another request
		builtText() {
			clearTimeout(this.timer)
			if (this.testedRequest !== null && !this.stale)
				this.timer = setTimeout(this.preview, PREVIEW_AFTER_MS)
		},
	},
	beforeUnmount() {
		clearTimeout(this.timer)
		// an answer that comes after this is nobody's
		this.serial++
	},
	methods: {
		blankPair,
		blankRow,
		blankStatus,
		forced(pair) {
			return isSecretName(pair.name)
		},
		secretOf(entry) {
			return entry.secret || isSecretName(entry.name)
		},
		// A name the core takes for a secret makes its value one, and it stays one when the name changes: what was typed in the password
		// field must not turn into a fixed text of the recipe.
		rename(pair, name) {
			pair.name = name
			if (isSecretName(name))
				pair.secret = true
		},
		// what was typed as a secret does not become a text that everyone reads, and a text does not become a secret unseen
		setSecret(entry, secret) {
			entry.secret = secret
			entry.value = ''
		},
		// the placeholder of a secret the box has, as long as it will keep it
		keptText(entry) {
			return this.editing && !this.secretsAgain && this.widget.inputs_set?.[entry.input] === true ? this.$t('saved — leave empty to keep') : ''
		},
		// the parameters typed with an address or a path: added, and none that is there is replaced
		addQuery(query) {
			for (const [name, value] of query) {
				if (!this.form.query.some(pair => pair.name === name))
					this.form.query.push({ ...blankPair(), name, value, secret: isSecretName(name) })
			}
		},
		// A whole address typed in the field of the base is split only while there is no path: a path that is there (a saved one, the
		// one of an imported recipe, one typed first) is never replaced, and the base then stays as typed, which the core takes with the
		// start of a path in it.
		leaveBase() {
			const split = this.baseTyped && this.form.path === '' ? splitBase(this.base) : null
			this.baseTyped = false
			if (!split)
				return
			this.base = split.base
			this.form.path = split.path
			this.addQuery(split.query)
		},
		leavePath() {
			const split = splitPath(this.form.path)
			if (!split)
				return
			this.form.path = split.path
			this.addQuery(split.query)
		},
		change() {
			return { base: this.address, insecure_tls: this.insecure, recipe: this.built, secrets: secretsOf(this.form) }
		},
		// what the core says, as it says it
		reason(error) {
			if (error?.secretsAgain)
				this.again = true
			if (error?.status === 413)
				return this.$t('The recipe or the answer is too large for the box.')
			if (error?.status === 0)
				return this.$t('The box did not answer.')
			return error?.message || this.$t('The box refused, without saying why.')
		},
		draw(card) {
			const view = widgetView(card, this.$i18n?.locale ?? 'en_us', key => this.$t(key))
			this.source = { load: () => Promise.resolve(view) }
			this.previewError = ''
		},
		// the only call that makes the box read the address
		async test() {
			if (!this.canTest)
				return
			this.testing = true
			this.error = ''
			const request = this.asked
			const sent = this.builtText
			try {
				const { response, card } = await testWidget(this.change(), this.editing ? this.widget.id : undefined)
				clearTimeout(this.timer)
				this.serial++
				this.answer = response !== null && typeof response === 'object' ? markRaw(response) : response
				this.hasAnswer = true
				this.testedRequest = request
				this.draw(card)
				// the rows changed while the box was reading
				if (sent !== this.builtText && !this.stale)
					this.timer = setTimeout(this.preview, PREVIEW_AFTER_MS)
			} catch (error) {
				this.error = this.reason(error)
			} finally {
				this.testing = false
			}
		},
		// the card the recipe makes of the answer already received: the box sends nothing
		async preview() {
			if (this.stale)
				return
			const serial = ++this.serial
			try {
				const card = await previewWidget(this.built, this.answer)
				if (serial === this.serial)
					this.draw(card)
			} catch (error) {
				if (serial === this.serial)
					this.previewError = this.reason(error)
			}
		},
		async save() {
			if (!this.canSave)
				return
			this.saving = true
			this.error = ''
			try {
				// an import makes a new widget, always
				if (this.editing)
					await updateWidget(this.widget.id, this.change())
				else
					await createWidget(this.change())
			} catch (error) {
				this.error = this.reason(error)
				this.saving = false
				return
			}
			// the window of the widgets and the two homes read again when they hear it
			this.$EventBus.$emit(events.API_WIDGETS_CHANGED)
			this.$emit('close')
		},
		removeRow(index) {
			if (this.picking?.row === this.form.rows[index])
				this.picking = null
			this.form.rows.splice(index, 1)
		},
		// a click on the answer
		pick({ kind, path, value }) {
			this.note = ''
			if (this.picking)
				return this.pickInside(kind, path, value)
			if (this.form.rows.length >= this.maxRows) {
				this.note = this.$t('This layout holds {max} rows at most.', { max: this.maxRows })
				return
			}
			if (kind === 'each') {
				this.form.rows.push(listRow(path))
				this.picking = { row: this.form.rows.at(-1), path, step: 'label' }
			} else {
				this.form.rows.push(kind === 'count' ? countRow(path) : leafRow(path, value))
			}
		},
		pickInside(kind, path, value) {
			const { row, status, step } = this.picking
			if (kind !== 'leaf') {
				this.note = this.$t('Click a single value, not a list.')
				return
			}
			if (status) {
				// the switch may have been turned off meanwhile
				if (this.form.status)
					Object.assign(this.form.status, { value: pointerOf(path), format: leafRow(path, value).format })
				this.picking = null
				return
			}
			const list = this.picking.path
			if (path.length <= list.length || list.some((segment, index) => segment !== path[index])) {
				this.note = this.$t('Click a value inside an item of the list.')
				return
			}
			// from the item: the list and the index of the item are left out
			const pointer = pointerOf(path.slice(list.length + 1))
			if (step === 'label') {
				row.label = pointer
				this.picking.step = 'value'
			} else {
				row.value = pointer
				row.format = leafRow(path, value).format
				this.picking = null
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.api-widget-editor {
	.grows {
		flex: 1 1 14rem;
		min-width: 0;
	}

	.answer {
		max-height: 24rem;
		overflow: auto;
		overflow-wrap: anywhere;
	}

	// the card is glass on the dashboard's wallpaper: here it gets a dark ground of its own, in both themes
	.preview {
		padding: 1rem;
		border-radius: 0.75rem;
		background: #1f2937;
		min-height: 6rem;

		&.is-stale {
			opacity: 0.4;
		}
	}
}
</style>
