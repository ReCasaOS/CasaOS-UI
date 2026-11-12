// What every tab of the Fleet page does: read the boxes through loadRows, row by row, again every `intervalMs`
// while the tab is shown; keep the selection by key across reads; run a grouped action on the rows as they are
// when the button is clicked, and keep its results, by row key, until the next action.
// The tab defines `sources`, `build(box, answers)` and `intervalMs`, and may define `pendingRow(box)`: the row a box
// shows while its answers are out, so that one slow box holds up neither the table nor its own line.
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
				}, (boxes) => {
					if (ticket !== this.ticket) {
						return
					}
					if (this.pendingRow) {
						const pending = boxes.map(box => this.pendingRow(box)).filter(p => !this.rows.some(r => r.key === p.key))
						this.rows = [...this.rows, ...pending]
					}
					this.loading = false
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
		isChecked(row) {
			return this.checkedRows.some(r => r.key === row.key)
		},
		toggle(row) {
			this.checkedRows = this.isChecked(row) ? this.checkedRows.filter(r => r.key !== row.key) : [...this.checkedRows, row]
		},
		// the rows of one box that can be checked, and whether all of them are
		actionableOf(rows) {
			return rows.filter(r => r.actionable)
		},
		allChecked(rows) {
			const own = this.actionableOf(rows)
			return own.length > 0 && own.every(r => this.isChecked(r))
		},
		toggleAll(rows) {
			const own = this.actionableOf(rows)
			const keys = new Set(own.map(r => r.key))
			this.checkedRows = this.allChecked(rows) ? this.checkedRows.filter(r => !keys.has(r.key)) : [...this.checkedRows.filter(r => !keys.has(r.key)), ...own]
		},
		// what an empty cell says: the source failed on a box that is there, or nothing to say
		blank(row, source) {
			return row.online && row.errors.includes(source) ? this.$t('Could not be read') : '—'
		},
		// One call per row, a result per row; then the list is read again. Resolves to the results, by key.
		async act(call, rows = this.selected) {
			this.results = Object.fromEntries(rows.map(r => [r.key, { state: 'running', message: '' }]))
			const done = await runBulk(rows, call)
			this.results = { ...this.results, ...Object.fromEntries(done) }
			this.poller.now()
			return done
		},
	},
}
