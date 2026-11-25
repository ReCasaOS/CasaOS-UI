import { describe, expect, it } from 'vitest'
import { bcp47, defaultUnits, kind, placeLabel, weekday } from './weather'

describe('the weather\'s words and icons', () => {
	it('names a WMO code, with the night\'s icon after sunset', () => {
		expect(kind(0)).toEqual({ icon: 'weather-sunny', label: 'Clear sky' })
		expect(kind(0, false).icon).toBe('weather-night')
		expect(kind(3, false).icon).toBe('weather-cloudy')
		expect(kind(82).label).toBe('Heavy rain')
		expect(kind(1234)).toEqual({ icon: 'weather-cloudy', label: 'Weather' })
	})

	it('starts the United States in °F and every other language in °C', () => {
		expect(defaultUnits('en_us')).toBe('imperial')
		expect(defaultUnits('fr_fr')).toBe('metric')
		expect(defaultUnits('en_gb')).toBe('metric')
	})

	it('names the day of the place, whatever the browser\'s time zone', () => {
		expect(bcp47('pt_br')).toBe('pt-BR')
		expect(weekday('2026-11-25', 'en_us')).toBe('Wed')
		expect(weekday('2026-11-29', 'fr_fr')).toBe('dim.')
	})

	it('names a place with what Open-Meteo knows of it', () => {
		expect(placeLabel({ name: 'Vinhedo', region: 'São Paulo', country: 'Brazil' })).toBe('Vinhedo, São Paulo, Brazil')
		expect(placeLabel({ name: 'Paris' })).toBe('Paris')
	})
})
