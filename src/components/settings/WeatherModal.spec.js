// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import WeatherModal from './WeatherModal.vue'

vi.mock('lodash/debounce', () => ({ default: fn => Object.assign(fn, { cancel: () => {} }) }))

const answer = data => vi.fn(() => Promise.resolve({ data: { success: 200, data } }))
const VINHEDO = { name: 'Vinhedo', region: 'São Paulo', country: 'Brazil', latitude: -23.03, longitude: -46.97 }

async function open(sys, locale = 'fr_fr') {
	const wrapper = mount(WeatherModal, {
		global: {
			plugins: [Buefy],
			mocks: {
				$t: (key, params) => (params ? key.replace(/\{(\w+)\}/g, (_, k) => params[k]) : key),
				$i18n: { locale },
				$api: { sys: { getWeather: answer({ enabled: false, place: null, units: 'metric', forecast: null }), setWeather: answer({}), findWeatherPlaces: answer([VINHEDO]), ...sys } },
			},
		},
	})
	await flushPromises()
	return wrapper
}

describe('the weather settings', () => {
	it('finds a place, turns the weather on with it, and saves it', async () => {
		const setWeather = answer({})
		const findWeatherPlaces = answer([VINHEDO])
		const wrapper = await open({ setWeather, findWeatherPlaces }, 'pt_br')
		expect(wrapper.find('[data-weather-switch] input').element.disabled).toBe(true)

		wrapper.vm.search('Vinhedo')
		await flushPromises()
		expect(findWeatherPlaces).toHaveBeenCalledWith('Vinhedo', 'pt')
		expect(wrapper.vm.found[0].label).toBe('Vinhedo, São Paulo, Brazil')

		wrapper.vm.choose(wrapper.vm.found[0])
		await flushPromises()
		expect(wrapper.find('[data-weather-place]').text()).toBe('Vinhedo, São Paulo, Brazil')
		await wrapper.find('[data-weather-save]').trigger('click')
		await flushPromises()

		expect(setWeather).toHaveBeenCalledWith({ enabled: true, place: VINHEDO, units: 'metric' })
		expect(wrapper.emitted('close')).toHaveLength(1)
	})

	it('asks nothing for one letter', async () => {
		const findWeatherPlaces = answer([VINHEDO])
		const wrapper = await open({ findWeatherPlaces })
		await wrapper.vm.search('V ')
		expect(findWeatherPlaces).not.toHaveBeenCalled()
		expect(wrapper.vm.found).toEqual([])
	})

	it('starts in °F in American English until a place is saved', async () => {
		expect((await open({}, 'en_us')).vm.units).toBe('imperial')
		expect((await open({ getWeather: answer({ enabled: true, place: VINHEDO, units: 'metric' }) }, 'en_us')).vm.units).toBe('metric')
	})

	it('says why the core refused, and stays open', async () => {
		const setWeather = vi.fn(() => Promise.reject(Object.assign(new Error('400'), { response: { data: { message: 'invalid weather settings: choose a place first' } } })))
		const wrapper = await open({ setWeather })
		await wrapper.find('[data-weather-save]').trigger('click')
		await flushPromises()
		expect(wrapper.text()).toContain('The weather settings could not be saved: invalid weather settings: choose a place first')
		expect(wrapper.emitted('close')).toBeUndefined()
	})
})
