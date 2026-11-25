<template>
	<div class="modal-card weather-modal touch-targets">
		<header class="modal-card-head">
			<h3 class="title is-header">
				{{ $t('Weather') }}
			</h3>
		</header>

		<section class="modal-card-body">
			<p class="settings-intro mb-3">
				{{ $t('The weather of a place you choose, at the top right of the new dashboard. The box asks Open-Meteo every 30 minutes, with the coordinates of that place only; the place you search for is sent to Open-Meteo too.') }}
			</p>

			<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">
				{{ error }}
			</b-message>

			<template v-if="loaded">
				<div class="settings-card">
					<b-field class="mb-3">
						<b-switch v-model="enabled" :disabled="saving || !place" data-weather-switch>
							{{ $t('Show the weather on the dashboard') }}
						</b-switch>
					</b-field>

					<b-field :label="$t('Place')">
						<b-autocomplete v-model="query" :data="found" :disabled="saving" :loading="searching"
							:placeholder="place ? placeText(place) : $t('Search a town or a city')" clearable data-weather-search
							field="label" keep-first @select="choose" @typing="search">
							<template #empty>
								<span v-if="query.trim().length >= 2 && !searching">{{ $t('No place of that name') }}</span>
							</template>
						</b-autocomplete>
					</b-field>
					<p v-if="place" class="is-size-7 mb-3" data-weather-place>
						{{ placeText(place) }}
					</p>

					<b-field :label="$t('Units')">
						<b-radio-button v-model="units" :disabled="saving" native-value="metric" size="is-small">
							°C, km/h
						</b-radio-button>
						<b-radio-button v-model="units" :disabled="saving" native-value="imperial" size="is-small">
							°F, mph
						</b-radio-button>
					</b-field>
				</div>
			</template>
			<b-loading :is-full-page="false" :model-value="!loaded && !error" />
		</section>

		<footer class="modal-card-foot is-flex is-justify-content-flex-end">
			<b-button :label="$t('Cancel')" rounded @click="$emit('close')" />
			<b-button :disabled="!loaded || saving" :label="$t('Save')" :loading="saving" data-weather-save rounded type="is-primary" @click="save" />
		</footer>
	</div>
</template>

<script>
import debounce from 'lodash/debounce'
import { defaultUnits, placeLabel } from '@/components/weather/weather'

export const SEARCH_WAIT_MS = 400

export default {
	name: 'WeatherModal',
	emits: ['close'],
	data() {
		return { loaded: false, enabled: false, place: null, units: 'metric', query: '', found: [], searching: false, saving: false, error: '' }
	},
	created() {
		this.search = debounce(this.find, SEARCH_WAIT_MS)
	},
	mounted() {
		this.load()
	},
	beforeUnmount() {
		this.search.cancel()
	},
	methods: {
		async load() {
			try {
				const { enabled, place, units } = (await this.$api.sys.getWeather()).data.data
				this.enabled = enabled
				this.place = place
				this.units = place ? units : defaultUnits(this.$i18n.locale)
				this.loaded = true
			} catch (error) {
				this.error = this.$t('The weather settings could not be loaded: {error}', { error: this.messageOf(error) })
			}
		},
		async find(text) {
			if (text.trim().length < 2) {
				this.found = []
				return
			}
			this.searching = true
			try {
				const places = (await this.$api.sys.findWeatherPlaces(text.trim(), this.$i18n.locale.slice(0, 2))).data.data || []
				this.found = places.map(place => ({ ...place, label: placeLabel(place) }))
			} catch (error) {
				this.found = []
				this.error = this.$t('Open-Meteo could not be asked: {error}', { error: this.messageOf(error) })
			} finally {
				this.searching = false
			}
		},
		choose(option) {
			if (!option) {
				return
			}
			const place = { ...option }
			delete place.label
			this.place = place
			this.enabled = true
			this.$nextTick(() => {
				this.query = ''
			})
		},
		placeText(place) {
			return placeLabel(place)
		},
		async save() {
			this.saving = true
			this.error = ''
			try {
				await this.$api.sys.setWeather({ enabled: this.enabled && !!this.place, place: this.place, units: this.units })
				this.$emit('close')
			} catch (error) {
				this.error = this.$t('The weather settings could not be saved: {error}', { error: this.messageOf(error) })
			} finally {
				this.saving = false
			}
		},
		messageOf(error) {
			return error?.response?.data?.message || error?.message || ''
		},
	},
}
</script>
