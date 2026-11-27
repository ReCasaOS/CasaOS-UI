<template>
	<div class="modal-card api-widgets-modal touch-targets">
		<header class="modal-card-head">
			<h3 class="title is-header">
				{{ $t('API widgets') }}
			</h3>
		</header>

		<section class="modal-card-body">
			<p class="settings-intro mb-3">
				{{ $t('Cards of the dashboard that the box fills by reading an address you choose.') }}
			</p>

			<!-- a list that could not be read is not shown as a box without a widget -->
			<b-message v-if="failed" class="mb-3" data-widgets-failed size="is-small" type="is-danger">
				{{ failed }}
			</b-message>

			<template v-if="loaded">
				<b-message v-if="!config" class="mb-3" data-widgets-config-unread size="is-small" type="is-warning">
					{{ $t('The dashboard\'s settings could not be read: a widget cannot be shown or hidden for now.') }}
				</b-message>
				<p v-if="!widgets.length" class="is-size-7 mb-3" data-widgets-none>
					{{ $t('No widget yet. Add one, or import a recipe.') }}
				</p>
				<!-- every text of a widget comes from a recipe or from an address: text only, never markup -->
				<div v-for="widget in widgets" :key="widget.id" :data-widget="widget.id" class="settings-card is-flex is-flex-wrap-wrap is-align-items-center is-gap-1">
					<div class="widget-text is-flex-grow-1">
						<div class="has-text-weight-semibold" data-widget-name>
							{{ nameOf(widget) }}
						</div>
						<div class="is-size-7 _has-text-gray" data-widget-base>
							{{ widget.base }}
						</div>
						<div v-if="widget.error" class="is-size-7 has-text-danger" data-widget-error>
							{{ $t('Last read failed: {error}', { error: widget.error }) }}
						</div>
					</div>
					<!-- the key draws the switch again from what is saved when a change could not be saved -->
					<b-switch :key="redraw" :disabled="busy || !config" :model-value="shown(widget)" @update:model-value="show(widget, $event)">
						<span aria-hidden="true">{{ $t('Show') }}</span>
						<span class="is-sr-only">{{ $t('Show {name}', { name: nameOf(widget) }) }}</span>
					</b-switch>
					<div class="is-flex is-flex-wrap-wrap is-gap-1">
						<b-button :aria-label="$t('Edit {name}', { name: nameOf(widget) })" :disabled="busy" data-widget-edit rounded size="is-small" @click="$emit('edit', widget)">
							{{ $t('Edit') }}
						</b-button>
						<b-button :aria-label="$t('Export {name}', { name: nameOf(widget) })" :disabled="busy" data-widget-export rounded size="is-small" @click="$emit('export', widget)">
							{{ $t('Export') }}
						</b-button>
						<b-button :aria-label="$t('Delete {name}', { name: nameOf(widget) })" :disabled="busy" data-widget-delete rounded size="is-small" type="is-danger" @click="remove(widget)">
							{{ $t('Delete') }}
						</b-button>
					</div>
				</div>
			</template>

			<div class="is-flex is-flex-wrap-wrap is-gap-1 mt-3">
				<b-button :disabled="!canAdd" data-widgets-add rounded type="is-primary" @click="$emit('edit', null)">
					{{ $t('Add a widget') }}
				</b-button>
				<b-button :disabled="!canAdd" data-widgets-import rounded @click="$refs.file.click()">
					{{ $t('Import a recipe') }}
				</b-button>
				<!-- opened by the button above, which is the one a keyboard and a screen reader meet -->
				<input ref="file" accept=".json,application/json" aria-hidden="true" class="is-hidden" data-widgets-file tabindex="-1" type="file" @change="pick">
			</div>
			<p v-if="full" class="is-size-7 mt-2" data-widgets-full>
				{{ $t('A box holds 12 widgets at most: delete one to add another.') }}
			</p>
			<b-loading :is-full-page="false" :model-value="!loaded && !failed" />
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button :label="$t('Close')" rounded @click="$emit('close')" />
		</footer>
	</div>
</template>

<script>
import escape from 'lodash/escape'
import { widgetKey } from '@/components/apiWidgets/format'
import events from '@/events/events'
import { deleteWidget, listWidgets } from '@/service/apiWidgets'

// the dashboard's saved choice of widgets, a list of { name, show } that both homes read and write
const CONFIG = 'widgets_config'
// the core's own limits
const MAX_WIDGETS = 12
const MAX_RECIPE_BYTES = 16 * 1024
// the id the core gives: nothing else goes into a key of the settings or into an address
const WIDGET_ID = /^[a-z0-9]{8}$/
const text = value => (typeof value === 'string' ? value : '')

/**
 * The API widgets of the box: the list, the show switch, and the way to the editor. The window edits nothing itself: it emits `edit` (the
 * widget as the core lists it, or null for a new one), `export` (the widget) and `import` (the text of a recipe file of 16 KiB at most).
 *
 * The show switch and the deletion write the saved choice of the dashboard, read fresh each time so that an order chosen on a home meanwhile
 * is kept, and API_WIDGETS_CHANGED is said on the bus only once that write is over: the homes read the choice again when they hear it.
 */
export default {
	name: 'ApiWidgetsModal',
	emits: ['close', 'edit', 'import', 'export'],
	data() {
		// config: the saved choice as last read or written, null while it cannot be read
		return { loaded: false, failed: '', widgets: [], config: null, busy: false, redraw: 0, serial: 0 }
	},
	computed: {
		full() {
			return this.loaded && this.widgets.length >= MAX_WIDGETS
		},
		// an import always makes a new widget, as Add does
		canAdd() {
			return this.loaded && !this.full && !this.busy
		},
	},
	mounted() {
		this.load()
		// the editor saved a widget: the list is read again
		this.$EventBus.$on(events.API_WIDGETS_CHANGED, this.load)
	},
	beforeUnmount() {
		this.serial++
		this.$EventBus.$off(events.API_WIDGETS_CHANGED, this.load)
	},
	methods: {
		async load() {
			const serial = ++this.serial
			let list
			let failed = ''
			try {
				list = (await listWidgets())?.widgets
			} catch (error) {
				if (error?.status === 404)
					failed = this.$t('This box does not know the API widgets yet: update it.')
				else
					failed = error?.message ? this.$t('The widgets could not be loaded: {error}', { error: error.message }) : this.$t('The widgets could not be loaded.')
			}
			const config = failed ? null : await this.readConfig().catch(() => null)
			if (serial !== this.serial)
				return
			const widgets = []
			for (const widget of Array.isArray(list) ? list : []) {
				if (WIDGET_ID.test(text(widget?.id)) && !widgets.some(known => known.id === widget.id))
					widgets.push({ ...widget, base: text(widget.base), error: text(widget.error) })
			}
			this.failed = failed
			this.widgets = widgets
			this.config = config
			this.loaded = !failed
		},
		// a widget without a name is called by its id
		nameOf(widget) {
			return text(widget.recipe?.name) || widget.id
		},
		// a widget the saved choice does not name is shown
		shown(widget) {
			return this.config?.find(item => item?.name === widgetKey(widget.id))?.show !== false
		},
		// the saved choice, as the box has it now; a choice that was never saved is an empty one
		async readConfig() {
			const res = await this.$api.users.getCustomStorage(CONFIG)
			if (res.status === 200 && Array.isArray(res.data?.data))
				return res.data.data
			if (res.status === 200 && res.data === '')
				return []
			throw new Error('not a list')
		},
		// reads the saved choice, changes it and saves it; rejects when it could not be read or saved, and then nothing is written
		async writeConfig(change) {
			const list = change(await this.readConfig())
			const res = await this.$api.users.setCustomStorage(CONFIG, list)
			if (res.data?.success !== 200)
				throw new Error('not saved')
			this.config = list
		},
		// toasts and dialogs draw their message as HTML
		say(message) {
			this.$buefy.toast.open({ message: escape(message), type: 'is-danger', duration: 5000 })
		},
		async show(widget, show) {
			const key = widgetKey(widget.id)
			this.busy = true
			try {
				// only this entry changes: the others, and the order, stay as they are saved
				await this.writeConfig(list => list.some(item => item?.name === key) ? list.map(item => item?.name === key ? { ...item, show } : item) : [...list, { name: key, show }])
				this.$EventBus.$emit(events.API_WIDGETS_CHANGED)
			} catch {
				this.redraw++
				this.say(this.$t('The dashboard\'s settings could not be saved.'))
			} finally {
				this.busy = false
			}
		},
		remove(widget) {
			this.$buefy.dialog.confirm({
				message: this.$t('Delete the widget {name}? Its card leaves the dashboard.', { name: escape(this.nameOf(widget)) }),
				type: 'is-danger',
				confirmText: this.$t('Delete'),
				cancelText: this.$t('Cancel'),
				onConfirm: () => this.removeNow(widget),
			})
		},
		async removeNow(widget) {
			const key = widgetKey(widget.id)
			this.busy = true
			try {
				try {
					await deleteWidget(widget.id)
				} catch (error) {
					this.say(error?.message || this.$t('The widget could not be deleted.'))
					return
				}
				this.widgets = this.widgets.filter(known => known.id !== widget.id)
				// the widget is gone whatever comes of this: an entry left behind is one the homes neither show nor offer
				await this.writeConfig(list => list.filter(item => item?.name !== key)).catch(() => {})
				this.$EventBus.$emit(events.API_WIDGETS_CHANGED)
			} finally {
				this.busy = false
			}
		},
		pick(event) {
			const file = event.target.files?.[0]
			// the same file can be chosen again
			event.target.value = ''
			if (!file)
				return
			// a recipe is 16 KiB at most for the core: a larger file is not read at all
			if (file.size > MAX_RECIPE_BYTES)
				return this.say(this.$t('This file is too large for a recipe: 16 KiB at most.'))
			const reader = new FileReader()
			reader.onload = () => this.$emit('import', String(reader.result))
			reader.onerror = () => this.say(this.$t('The file could not be read.'))
			reader.readAsText(file)
		},
	},
}
</script>

<style lang="scss" scoped>
// a long address wraps inside its card
.widget-text {
	min-width: 0;
	overflow-wrap: anywhere;
}
</style>
