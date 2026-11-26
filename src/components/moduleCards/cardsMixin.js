import { cardList } from './moduleCards'
import events from '@/events/events'
import { getCards } from '@/service/moduleCards'

// the list is read again this often, and when the Modules window installs or removes a module
const CARDS_EVERY_MS = 5 * 60 * 1000

/**
 * The list of the modules that have a card, for the two homes: the administrator's only (another account, or one whose role is not confirmed,
 * asks nothing). A list that cannot be read leaves the cards that are shown as they are. A component can define `cardsRead()`, called when a
 * list has been read.
 */
export const cardsMixin = {
	data() {
		return { moduleCards: [], cardsTimer: 0, cardsSerial: 0 }
	},
	computed: {
		cardsAllowed() {
			return this.$store.getters.isAdmin === true && this.$store.state.roleConfirmed !== false
		},
	},
	watch: {
		cardsAllowed: 'loadCards',
	},
	mounted() {
		this.loadCards()
		this.cardsTimer = setInterval(this.loadCards, CARDS_EVERY_MS)
		this.$EventBus?.$on?.(events.MODULES_CHANGED, this.loadCards)
	},
	beforeUnmount() {
		clearInterval(this.cardsTimer)
		this.cardsSerial++
		this.$EventBus?.$off?.(events.MODULES_CHANGED, this.loadCards)
	},
	methods: {
		async loadCards() {
			const serial = ++this.cardsSerial
			if (!this.cardsAllowed) {
				this.moduleCards = []
				return
			}
			try {
				const cards = cardList((await getCards()).data?.data)
				if (serial !== this.cardsSerial)
					return
				this.moduleCards = cards
			} catch {
				return
			}
			this.cardsRead?.()
		},
	},
}
