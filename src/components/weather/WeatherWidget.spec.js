// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WeatherWidget, { RELOAD_MS } from './WeatherWidget.vue'

const answer = data => vi.fn(() => Promise.resolve({ data: { success: 200, data } }))
const VINHEDO = { name: 'Vinhedo', region: 'São Paulo', country: 'Brazil', latitude: -23.03, longitude: -46.97 }
const FORECAST = {
	current: { temperature: 24.4, humidity: 61, wind: 11.5, code: 2, day: true },
	days: [
		{ date: '2026-11-25', code: 2, min: 15.2, max: 27.1, rain: 10 },
		{ date: '2026-11-26', code: 61, min: 14, max: 22, rain: 80 },
	],
	updated: '2026-11-25T12:00:00Z',
}

async function open(getWeather) {
	const wrapper = mount(WeatherWidget, {
		global: {
			plugins: [Buefy],
			mocks: { $t: (key, params) => (params ? key.replace(/\{(\w+)\}/g, (_, k) => params[k]) : key), $i18n: { locale: 'en_us' }, $api: { sys: { getWeather } } },
		},
	})
	await flushPromises()
	return wrapper
}

afterEach(() => vi.useRealTimers())

describe('the weather in the top bar', () => {
	it('shows the temperature and the place, and the days in its menu', async () => {
		const wrapper = await open(answer({ enabled: true, place: VINHEDO, units: 'metric', forecast: FORECAST }))
		const now = wrapper.find('.weather-now')
		expect(now.text()).toBe('24°Vinhedo')
		expect(now.attributes('aria-label')).toBe('Partly cloudy, 24°, Vinhedo, São Paulo, Brazil')
		const days = wrapper.findAll('[data-weather-day]')
		expect(days).toHaveLength(2)
		expect(days[1].text()).toMatch(/Thu\s*80 %\s*22°\s*14°/)
		expect(wrapper.text()).toContain('Wind 12 km/h')
		expect(wrapper.find('[data-weather-stale]').exists()).toBe(false)
	})

	it('says how old the forecast is when Open-Meteo did not answer since', async () => {
		const wrapper = await open(answer({ enabled: true, place: VINHEDO, units: 'imperial', forecast: FORECAST, error: 'Open-Meteo answered 503' }))
		expect(wrapper.find('[data-weather-stale]').text()).toMatch(/^Last updated/)
		expect(wrapper.text()).toContain('mph')
	})

	it('shows nothing while off, before the first forecast, or on a core without the weather', async () => {
		for (const getWeather of [
			answer({ enabled: false, place: VINHEDO, units: 'metric', forecast: FORECAST }),
			answer({ enabled: true, place: VINHEDO, units: 'metric', forecast: null }),
			vi.fn(() => Promise.reject(Object.assign(new Error('404'), { response: { status: 404 } }))),
		]) {
			const wrapper = await open(getWeather)
			expect(wrapper.find('[data-weather]').exists()).toBe(false)
			wrapper.unmount()
		}
	})

	it('reads the weather again every ten minutes, and not once gone', async () => {
		vi.useFakeTimers()
		const getWeather = answer({ enabled: true, place: VINHEDO, units: 'metric', forecast: FORECAST })
		const wrapper = await open(getWeather)
		await vi.advanceTimersByTimeAsync(RELOAD_MS)
		expect(getWeather).toHaveBeenCalledTimes(2)
		wrapper.unmount()
		await vi.advanceTimersByTimeAsync(RELOAD_MS)
		expect(getWeather).toHaveBeenCalledTimes(2)
	})
})
