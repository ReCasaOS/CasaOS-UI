// What every tab of the Fleet page does: read the boxes through loadRows, row by row, again every `intervalMs`
// while the tab is shown; keep the selection by key across reads; run a grouped action on the rows as they are
// when the button is clicked, and keep its results, by row key, until the next action.
// The tab defines `sources`, `build(box, answers)` and `intervalMs`.
import { runBulk } from './bulk'
import { loadRows } from './fleetLoader'
import { createPoller } from '@/components/Stats/poller'

export default {
	data() {
		return {
			rows: [],
			loading: true,
			error: false,
			// row key → { state, message }, the last action's
			results: {},
			checkedRows: [],
			// the newest read: an older answer never replaces a newer one
			ticket: 0,
		}
	},
	computed: {
		// the checked rows, as the list has them now: a row that left the list is not acted on
		selected() {
			const keys = new Set(this.checkedRows.map(r => r.key))
			return this.rows.filter(r => r.actionable && keys.has(r.key))
		},
	},
	created() {
		this.poller = createPoller({ run: () => this.load(), intervalMs: this.intervalMs })
	},
	mounted() {
		document.addEventListener('visibilitychange', this.onVisibility)
		this.poller.start()
	},
	beforeUnmount() {
		document.removeEventListener('visibilitychange', this.onVisibility)
		this.poller.stop()
	},
	methods: {
		onVisibility() {
			this.poller.visibilityChanged()
		},
		async load() {
			const ticket = ++this.ticket
			try {
				const all = await loadRows(this.sources, this.build, (row) => {
					if (ticket === this.ticket) {
						this.rows = [...this.rows.filter(r => r.key !== row.key), row]
					}
				})
				if (ticket === this.ticket) {
					this.rows = all
					this.error = false
				}
			} catch {
				if (ticket === this.ticket) {
					this.error = true
				}
			}
			if (ticket === this.ticket) {
				this.loading = false
			}
		},
		retry() {
			this.loading = true
			this.error = false
			this.poller.now()
		},
		// Buefy keeps the checked rows as objects: the same row read again is the same row
		sameRow(a, b) {
			return a.key === b.key
		},
		// One call per row, a result per row; then the list is read again.
		async act(call, rows = this.selected) {
			this.results = Object.fromEntries(rows.map(r => [r.key, { state: 'running', message: '' }]))
			const done = await runBulk(rows, call)
			this.results = { ...this.results, ...Object.fromEntries(done) }
			this.poller.now()
		},
	},
}
