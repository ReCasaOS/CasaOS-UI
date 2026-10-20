<template>
	<section :class="{ 'is-wide': chart.wide }" class="stats-chart">
		<h4 class="stats-chart-title">{{ chart.title }}</h4>
		<p v-if="chart.caption" class="stats-chart-caption">{{ chart.caption }}</p>
		<p v-for="code in chart.noteCodes" :key="code" class="stats-chart-caption">{{ noteText(code, $t) }}</p>

		<ul v-if="chart.legend.length" :aria-label="$t('Series')" class="stats-legend">
			<li v-for="(entry, i) in chart.legend" :key="`${i}-${entry.key}`">
				<button :aria-pressed="String(!entry.hidden)"
					:class="{ 'is-hidden': entry.hidden }"
					type="button"
					@click="$emit('toggle', entry.key)">
					<span :class="`kind-${entry.kind}`" :style="{ '--swatch': entry.color }" aria-hidden="true" class="stats-swatch"></span>
					<span class="stats-legend-name">{{ entry.label }}</span>
					<span class="stats-legend-value">{{ entry.hidden ? '-' : valueOf(entry.key) }}</span>
				</button>
			</li>
		</ul>

		<p v-if="chart.empty" class="stats-chart-empty">{{ $t('No data for this period') }}</p>
		<figure v-else
			:aria-label="figureLabel"
			class="stats-figure-box"
			role="img"
			tabindex="0"
			@keydown="onKeydown"
			@blur="escaped = false"
			@keyup="onKeyup">
			<div aria-hidden="true">
				<apex-chart v-if="chart.series.length" :height="height" :options="options" :series="series" type="line" />
			</div>
		</figure>

		<button :aria-expanded="String(showTable)" class="stats-table-toggle" type="button" @click="showTable = !showTable">
			{{ showTable ? $t('Hide the table') : $t('Show as a table') }}
		</button>
		<table v-if="showTable" class="stats-table">
			<caption>{{ chart.title }}</caption>
			<thead>
				<tr>
					<th scope="col">{{ $t('Series') }}</th>
					<th scope="col">{{ $t('Last') }}</th>
					<th scope="col">{{ $t('Min') }}</th>
					<th scope="col">{{ $t('Average') }}</th>
					<th scope="col">{{ $t('Max') }}</th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="row in rows" :key="row.name">
					<th scope="row">{{ row.name }}</th>
					<td>{{ row.last }}</td>
					<td>{{ row.min }}</td>
					<td>{{ row.avg }}</td>
					<td>{{ row.max }}</td>
				</tr>
			</tbody>
		</table>
	</section>
</template>

<script>
import { defineAsyncComponent } from 'vue'
import { chartOptions, noteText, tableRows } from './statsData'
import { formatValue } from './statsFormat'

export default {
	name: 'StatsChart',
	components: {
		ApexChart: defineAsyncComponent(() => import('vue3-apexcharts')),
	},
	props: {
		chart: { type: Object, required: true },
		// {min, max} in milliseconds, the same window for every card, or null
		zoom: { type: Object, default: null },
		// the time (seconds) the person points at, or null
		cursor: { type: Number, default: null },
		height: { type: Number, default: 150 },
		locale: { type: String, default: 'en' },
		range: { type: String, default: 'live' },
		scale: { type: Object, default: null },
	},
	emits: ['zoom', 'cursor', 'toggle'],
	data() {
		return { showTable: false }
	},
	computed: {
		figureLabel() {
			return `${this.chart.title}: ${this.chart.caption}`.replace(/: $/, '')
		},
		rows() {
			return tableRows(this.chart, this.locale)
		},
		// what apexcharts draws: line, area or step, in the order of the legend
		series() {
			return this.chart.series.map(s => ({ name: s.name, type: s.kind === 'area' ? 'area' : 'line', data: s.points }))
		},
		// every time of the chart, once, oldest first (the points the keyboard walks over)
		times() {
			const all = new Set()
			for (const s of this.chart.series) {
				for (const p of s.points) {
					all.add(p.x / 1000)
				}
			}
			return [...all].sort((a, b) => a - b)
		},
		options() {
			const shown = this.chart.series
			const base = chartOptions(this.chart, { zoom: this.zoom, height: this.height, locale: this.locale, range: this.range, scale: this.scale })
			return {
				...base,
				chart: {
					...base.chart,
					zoom: { enabled: true, type: 'x', autoSelected: 'zoom' },
					events: {
						zoomed: (ctx, config) => {
							const min = config?.xaxis?.min
							const max = config?.xaxis?.max
							if (Number.isFinite(min) && Number.isFinite(max) && max > min) {
								this.$emit('zoom', { min, max })
							}
						},
						mouseMove: (event, ctx, config) => {
							const s = this.chart.series[config?.seriesIndex >= 0 ? config.seriesIndex : 0] || this.chart.series[0]
							const x = s?.points[config?.dataPointIndex]?.x
							if (Number.isFinite(x)) {
								this.$emit('cursor', x / 1000)
							}
						},
						mouseLeave: () => this.$emit('cursor', null),
					},
				},
				colors: shown.map(s => s.color),
				stroke: {
					curve: shown.map(s => s.kind === 'step' ? 'stepline' : 'straight'),
					width: shown.map(s => s.kind === 'ref' ? 1 : 2),
					dashArray: shown.map(s => s.kind === 'ref' ? 5 : 0),
				},
				fill: { opacity: shown.map(s => s.kind === 'area' ? 0.35 : 1) },
				// the crosshair every card draws at the time the person points at (apexcharts' own group would push one card's options onto the others)
				annotations: this.cursor === null ? {} : { xaxis: [{ x: this.cursor * 1000, borderColor: '#8a8f98', borderWidth: 1, strokeDashArray: 0 }] },
			}
		},
	},
	methods: {
		noteText,
		valueOf(key) {
			const s = this.chart.series.find(x => x.key === key)
			if (!s) {
				return '-'
			}
			const point = this.cursor === null ? s.cleaned.at(-1) : s.cleaned.find(p => p.t === this.cursor)
			return formatValue(point ? point.avg : null, this.chart.unit, this.locale)
		},
		move(t) {
			this.$emit('cursor', t)
		},
		onKeydown(event) {
			const times = this.times
			if (event.key === 'Escape' || event.key === 'Esc') {
				// with a cursor, the key is for the chart and not for the window
				if (this.cursor !== null) {
					event.stopPropagation()
					this.escaped = true
					this.move(null)
				}
				return
			}
			if (!times.length || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
				return
			}
			event.preventDefault()
			const at = this.cursor === null ? -1 : times.findIndex(t => t >= this.cursor)
			const next = {
				Home: 0,
				End: times.length - 1,
				ArrowLeft: at < 0 ? times.length - 1 : Math.max(0, at - 1),
				ArrowRight: at < 0 ? times.length - 1 : Math.min(times.length - 1, at + 1),
			}[event.key]
			this.move(times[next])
		},
		onKeyup(event) {
			if (event.key !== 'Escape' && event.key !== 'Esc') {
				return
			}
			// the window closes on the release of Escape: hold it back when the press was for the cursor
			if (this.cursor !== null || this.escaped) {
				event.stopPropagation()
				this.escaped = false
				if (this.cursor !== null) {
					this.move(null)
				}
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.stats-chart {
	min-width: 0;
	padding: 0.5rem 0.75rem;
	border-radius: 0.5rem;
	border: 1px solid var(--casa-border);

	&.is-wide {
		grid-column: 1 / -1;
	}
}

.stats-chart-title {
	font-size: 0.8125rem;
	font-weight: 600;
	color: var(--casa-text-strong);
}

.stats-chart-caption,
.stats-chart-empty {
	font-size: 0.75rem;
	color: var(--casa-text-dim);
}

.stats-legend {
	display: flex;
	flex-wrap: wrap;
	gap: 0.25rem 0.75rem;
	margin: 0.25rem 0;

	button {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.125rem 0.25rem;
		border: 0;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		color: var(--casa-text-dim);
		background: transparent;
		cursor: pointer;

		&:focus-visible {
			outline: 2px solid var(--casa-primary, #3b82f6);
		}

		&.is-hidden {
			opacity: 0.5;
			text-decoration: line-through;
		}
	}
}

.stats-swatch {
	width: 0.6rem;
	height: 0.6rem;
	border-radius: 2px;
	background: var(--swatch);

	// a line is thinner than an area, a limit is dashed: the shape says it too
	&.kind-line,
	&.kind-step {
		height: 0.2rem;
	}

	&.kind-ref {
		height: 0;
		background: none;
		border-top: 2px dashed var(--swatch);
	}
}

.stats-legend-value {
	font-weight: 500;
	font-variant-numeric: tabular-nums;
	color: var(--casa-text-strong);
}

.stats-figure-box {
	margin: 0;

	&:focus-visible {
		outline: 2px solid var(--casa-primary, #3b82f6);
		outline-offset: 2px;
	}
}

.stats-table-toggle {
	margin-top: 0.25rem;
	padding: 0;
	border: 0;
	font-size: 0.75rem;
	color: var(--casa-primary, #3b82f6);
	background: transparent;
	cursor: pointer;
}

.stats-table {
	width: 100%;
	margin-top: 0.25rem;
	font-size: 0.75rem;

	caption {
		text-align: left;
		color: var(--casa-text-dim);
	}

	th,
	td {
		padding: 0.125rem 0.25rem;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	th[scope='col']:first-child,
	th[scope='row'] {
		text-align: left;
		overflow-wrap: anywhere;
	}
}
</style>
