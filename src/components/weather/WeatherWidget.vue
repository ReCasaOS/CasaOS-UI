<template>
	<!-- The dashboard's weather (CasaOS#188): now in the top bar, five days in its menu. Nothing at all while off,
		before the first forecast, or when the core cannot say. -->
	<b-dropdown v-if="forecast" :mobile-modal="false" aria-role="dialog" class="weather-widget" data-weather position="is-bottom-left">
		<template #trigger>
			<button :aria-label="summary" :title="summary" class="weather-now" type="button">
				<b-icon :icon="now.icon" size="is-small" />
				<span class="weather-temp">{{ degrees(forecast.current.temperature) }}</span>
				<span class="weather-place">{{ place.name }}</span>
			</button>
		</template>
		<b-dropdown-item :focusable="false" class="weather-card" custom>
			<div class="weather-head">
				<b-icon :icon="now.icon" custom-size="mdi-36px" />
				<div>
					<div class="weather-big">{{ degrees(forecast.current.temperature) }}</div>
					<div>{{ $t(now.label) }}</div>
					<div class="weather-dim weather-where">{{ placeName }}</div>
				</div>
			</div>
			<div class="weather-facts weather-dim">
				<span>{{ $t('Humidity') }} {{ Math.round(forecast.current.humidity) }} %</span>
				<span>{{ $t('Wind') }} {{ Math.round(forecast.current.wind) }} {{ windUnit }}</span>
			</div>
			<ul class="weather-days">
				<li v-for="day in forecast.days" :key="day.date" :title="$t(kindOf(day.code).label)" data-weather-day>
					<span class="weather-day-name">{{ dayName(day.date) }}</span>
					<b-icon :icon="kindOf(day.code).icon" size="is-small" />
					<span class="weather-rain weather-dim">{{ Math.round(day.rain) }} %</span>
					<span class="weather-range">{{ degrees(day.max) }} <span class="weather-dim">{{ degrees(day.min) }}</span></span>
				</li>
			</ul>
			<p class="weather-foot weather-dim">
				<span v-if="error" data-weather-stale>{{ $t('Last updated {time}', { time: updatedAt }) }} · </span>
				<a href="https://open-meteo.com/" rel="noopener noreferrer" target="_blank">{{ $t('Weather data by Open-Meteo') }}</a>
			</p>
		</b-dropdown-item>
	</b-dropdown>
</template>

<script>
import { bcp47, kind, placeLabel, weekday } from './weather'

// the core reads Open-Meteo every 30 minutes; asking more often only reads its cache
export const RELOAD_MS = 10 * 60 * 1000

export default {
	name: 'weather-widget',
	data() {
		return { forecast: null, place: null, units: 'metric', error: '', timer: null }
	},
	computed: {
		now() {
			return kind(this.forecast.current.code, this.forecast.current.day)
		},
		placeName() {
			return placeLabel(this.place)
		},
		windUnit() {
			return this.units === 'imperial' ? 'mph' : 'km/h'
		},
		summary() {
			return `${this.$t(this.now.label)}, ${this.degrees(this.forecast.current.temperature)}, ${this.placeName}`
		},
		updatedAt() {
			return new Intl.DateTimeFormat(bcp47(this.$i18n.locale), { hour: 'numeric', minute: '2-digit' }).format(new Date(this.forecast.updated))
		},
	},
	mounted() {
		this.load()
		this.$EventBus?.$on('casaUI:weatherChanged', this.load)
	},
	beforeUnmount() {
		this.$EventBus?.$off('casaUI:weatherChanged', this.load)
		clearTimeout(this.timer)
	},
	methods: {
		async load() {
			clearTimeout(this.timer)
			try {
				const { enabled, place, units, forecast, error } = (await this.$api.sys.getWeather()).data.data
				this.place = place
				this.units = units
				this.error = error || ''
				this.forecast = enabled && place ? forecast : null
			} catch {
				// an older core (404), or no answer: the bar stays as it was
				this.forecast = null
			}
			this.timer = setTimeout(this.load, RELOAD_MS)
		},
		degrees(value) {
			return `${Math.round(value)}°`
		},
		kindOf(code) {
			return kind(code)
		},
		dayName(date) {
			return weekday(date, this.$i18n.locale)
		},
	},
}
</script>

<style lang="scss" scoped>
.weather-now {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	height: 2rem;
	padding: 0 0.625rem;
	border: 0;
	border-radius: 1rem;
	background: transparent;
	color: inherit;
	font-size: 0.875rem;
	cursor: pointer;

	&:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	&:focus-visible {
		outline: 2px solid #fff;
	}
}

.weather-temp {
	font-weight: 600;
}

.weather-place {
	max-width: 10rem;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

// above the app cards' badges (z-index 20 and 30), which come later in the dashboard
.weather-widget :deep(.dropdown-menu) {
	z-index: 40;
}

// the dashboard's glass (as its tab bar), not Buefy's plain dark menu (CasaOS#188 asked for it)
.weather-widget :deep(.dropdown-content) {
	border: 1px solid rgba(255, 255, 255, 0.08);
	border-radius: 1rem;
	// darker than the tab bar: a card's text under the menu must not read through
	background: rgba(11, 18, 32, 0.85);
	backdrop-filter: blur(18px);
	color: #f1f5f9;
}

// Buefy's dropdown items do not wrap: a long place name would run out of the card
.weather-widget .weather-card {
	width: 18rem;
	padding: 1rem 1.25rem;
	white-space: normal;
}

.weather-head {
	display: flex;
	align-items: center;
	gap: 0.75rem;
}

.weather-big {
	font-size: 1.75rem;
	font-weight: 600;
	line-height: 1.1;
}

.weather-dim {
	opacity: 0.7;
}

.weather-where {
	font-size: 0.8125rem;
}

.weather-facts {
	display: flex;
	gap: 1rem;
	margin: 0.5rem 0 0.75rem;
	font-size: 0.8125rem;
}

.weather-days li {
	display: grid;
	grid-template-columns: 3rem 1.5rem 3rem 1fr;
	align-items: center;
	padding: 0.25rem 0;
	font-size: 0.875rem;
}

.weather-rain {
	font-size: 0.75rem;
}

.weather-range {
	text-align: right;
}

.weather-foot {
	margin-top: 0.5rem;
	font-size: 0.75rem;

	a {
		color: inherit;
		text-decoration: underline;
	}
}

// a phone keeps the icon and the temperature
@media screen and (max-width: 768px) {
	.weather-place {
		display: none;
	}
}
</style>
