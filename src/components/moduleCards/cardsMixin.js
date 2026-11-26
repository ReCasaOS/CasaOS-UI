import { cardList, cardView } from './moduleCards'
import events from '@/events/events'
import { getCard, getCards } from '@/service/moduleCards'

// the list is read again this often, and when the Modules window installs or removes a module
const CARDS_EVERY_MS = 5 * 60 * 1000

/**
 * The modules that have a card, for the two homes. The administrator's only: another account, or one whose role is not confirmed, asks nothing.
 *
 * The core lists every module that is installed and running, and most have no card. A module is in `moduleCards` (so on the home, and in the
 * widgets settings) only once its card was read, and was a valid one, in this session; a module whose first read is a 401, a 403, a 404, a text
 * that is not JSON or a description that is refused stays out of both, and nothing is saved for it. A card that goes (401, 403, 404 when it is
 * read again) leaves too, and is asked again once at the next reading of the list. A list that cannot be read leaves things as they are.
 *
 * A component can define `cardsBefore()` (awaited before the list is read), `cardsToProbe(list)` (the modules worth a first read, all of them
 * by default) and `cardsRead()` (called when a list has been read).
 */
export const cardsMixin = {
	data() {
		return { moduleCards: [], proven: [], cardsTimer: 0, cardsSerial: 0, cardsStale: false }
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
		this.cardsTimer = setInterval(this.cardsTick, CARDS_EVERY_MS)
		document.addEventListener('visibilitychange', this.cardsVisible)
		this.$EventBus?.$on?.(events.MODULES_CHANGED, this.loadCards)
	},
	beforeUnmount() {
		clearInterval(this.cardsTimer)
		document.removeEventListener('visibilitychange', this.cardsVisible)
		this.cardsSerial++
		this.$EventBus?.$off?.(events.MODULES_CHANGED, this.loadCards)
	},
	methods: {
		// a hidden tab asks nothing: the list is read when it is seen again
		cardsTick() {
			if (document.hidden)
				this.cardsStale = true
			else
				this.loadCards()
		},
		cardsVisible() {
			if (!document.hidden && this.cardsStale) {
				this.cardsStale = false
				this.loadCards()
			}
		},
		// a card that the module no longer gives: it leaves, and the next reading of the list asks it again
		cardGone(name) {
			this.proven = this.proven.filter(item => item !== name)
			this.moduleCards = this.moduleCards.filter(card => card.name !== name)
		},
		async loadCards() {
			const serial = ++this.cardsSerial
			if (!this.cardsAllowed) {
				this.moduleCards = []
				this.proven = []
				return
			}
			let list
			try {
				await this.cardsBefore?.()
				list = cardList((await getCards()).data?.data)
			} catch {
				return
			}
			if (serial !== this.cardsSerial)
				return
			const proven = this.proven.filter(name => list.some(card => card.name === name))
			const toProbe = (this.cardsToProbe ? this.cardsToProbe(list) : list).filter(card => !proven.includes(card.name))
			const found = await Promise.all(toProbe.map(async (card) => {
				try {
					return cardView((await getCard(card.route)).data, card.route) ? card.name : ''
				} catch {
					return ''
				}
			}))
			if (serial !== this.cardsSerial)
				return
			this.proven = [...proven, ...found.filter(Boolean)]
			this.moduleCards = list.filter(card => this.proven.includes(card.name))
			this.cardsRead?.()
		},
	},
}
