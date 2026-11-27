import { widgetKey, widgetView } from './format'
import events from '@/events/events'
import { listWidgets, widgetCard } from '@/service/apiWidgets'

// the list is read again this often, as the list of the cards of the modules is, and when the Widgets API window changes a widget
const WIDGETS_EVERY_MS = 5 * 60 * 1000
// the id the core gives: nothing else goes into a key of the settings
const WIDGET_ID = /^[a-z0-9]{8}$/

/**
 * The API widgets, for the two homes. The administrator's only: another account, or one whose role is not confirmed, asks nothing.
 *
 * `apiWidgets` holds one entry per widget, in the order of the core: { name: 'custom:<id>', id, title, source }. `title` is the name its
 * recipe has, and `source.load()` reads its card and gives what ModuleCard draws (null for a card whose read failed; it rejects, with the
 * HTTP `status`, when the core refuses). A core that does not know the route answers 404: an empty list. Any other failure of the list
 * keeps the widgets there are, as the cards of the modules do. Nothing is said of either.
 *
 * A component can define `apiWidgetsBefore(changed)`, awaited before the list is read (`changed` is true when the reading comes from
 * API_WIDGETS_CHANGED: what was saved may have been written elsewhere), and `apiWidgetsRead()`, called when a list has been read.
 */
export const apiWidgetsMixin = {
	data() {
		return { apiWidgets: [], apiWidgetsTimer: 0, apiWidgetsSerial: 0, apiWidgetsStale: false }
	},
	computed: {
		// the same account as the cards of the modules (cardsMixin.cardsAllowed)
		apiWidgetsAllowed() {
			return this.$store.getters.isAdmin === true && this.$store.state.roleConfirmed !== false
		},
	},
	watch: {
		apiWidgetsAllowed() {
			this.loadApiWidgets()
		},
	},
	mounted() {
		this.loadApiWidgets()
		this.apiWidgetsTimer = setInterval(this.apiWidgetsTick, WIDGETS_EVERY_MS)
		document.addEventListener('visibilitychange', this.apiWidgetsVisible)
		this.$EventBus?.$on?.(events.API_WIDGETS_CHANGED, this.apiWidgetsChanged)
	},
	beforeUnmount() {
		clearInterval(this.apiWidgetsTimer)
		document.removeEventListener('visibilitychange', this.apiWidgetsVisible)
		this.apiWidgetsSerial++
		this.$EventBus?.$off?.(events.API_WIDGETS_CHANGED, this.apiWidgetsChanged)
	},
	methods: {
		// a hidden tab asks nothing: the list is read when it is seen again
		apiWidgetsTick() {
			if (document.hidden)
				this.apiWidgetsStale = true
			else
				this.loadApiWidgets()
		},
		apiWidgetsVisible() {
			if (!document.hidden && this.apiWidgetsStale) {
				this.apiWidgetsStale = false
				this.loadApiWidgets()
			}
		},
		// the event carries nothing that is read
		apiWidgetsChanged() {
			return this.loadApiWidgets(true)
		},
		// a widget whose card answers 404 was deleted elsewhere
		apiWidgetGone(name) {
			this.apiWidgets = this.apiWidgets.filter(entry => entry.name !== name)
		},
		async loadApiWidgets(changed = false) {
			const serial = ++this.apiWidgetsSerial
			if (!this.apiWidgetsAllowed) {
				this.apiWidgets = []
				return
			}
			try {
				await this.apiWidgetsBefore?.(changed)
			} catch {
				// the home's own reading: its failure says nothing of the widgets
			}
			let widgets = []
			try {
				widgets = (await listWidgets())?.widgets
			} catch (error) {
				// a box that does not answer keeps its widgets; only an older core (404) has none. No word either way
				if (error?.status !== 404)
					return
			}
			if (serial !== this.apiWidgetsSerial)
				return
			const entries = []
			for (const widget of Array.isArray(widgets) ? widgets : []) {
				const id = widget?.id
				if (typeof id !== 'string' || !WIDGET_ID.test(id) || entries.some(entry => entry.id === id))
					continue
				// a widget that changed is read at once, by a new source; a reading of the clock leaves each card to its own rhythm
				const source = (changed ? null : this.apiWidgets.find(entry => entry.id === id)?.source) ?? {
					// the language is the one of the page when the card is read
					load: async () => widgetView(await widgetCard(id), this.$i18n?.locale ?? 'en_us', key => this.$t(key)),
				}
				entries.push({ name: widgetKey(id), id, title: typeof widget.recipe?.name === 'string' ? widget.recipe.name : '', source })
			}
			this.apiWidgets = entries
			this.apiWidgetsRead?.()
		},
	},
}
