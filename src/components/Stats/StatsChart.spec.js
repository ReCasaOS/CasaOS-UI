// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HOSTILE, aSeries, makePoints } from './__fixtures__/contract'
import StatsChart from './StatsChart.vue'
import { buildCharts } from './statsData'
import i18n from '@/plugins/i18n'

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
// apexcharts cannot draw in happy-dom: a component that keeps what it is given
vi.mock('vue3-apexcharts', () => ({ __esModule: true, default: { name: 'ApexStub', props: ['options', 'series', 'type', 'height'], render: () => null } }))

const FROM = 1760000000
const t = (key, params = {}) => key.replace(/\{(\w+)\}/g, (m, name) => params[name] ?? m)
const chartOf = (response, id = 'network', opts = {}) => buildCharts(response, { t, ...opts }).find(c => c.id === id)
const network = (opts, response = aSeries()) => chartOf(response, 'network', opts)

let wrapper
async function mountChart(props = {}) {
	wrapper = mount(StatsChart, {
		props: { chart: network(), zoom: null, cursor: null, locale: 'en', range: 'live', ...props },
		attachTo: document.body,
		global: { plugins: [Buefy, i18n] },
	})
	await flushPromises()
	return wrapper
}
const apex = () => wrapper.findComponent({ name: 'ApexStub' })
const legend = () => wrapper.findAll('.stats-legend button')
function press(target, key, type = 'keydown') {
	const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true })
	target.element.dispatchEvent(event)
	return event
}

afterEach(() => wrapper?.unmount())

describe('the chart card', () => {
	it('has no apexcharts group (it would push one card\'s options onto the others) and its own id', async () => {
		const a = await mountChart()
		const optionsA = apex().props('options')
		a.unmount()
		await mountChart({ chart: chartOf(aSeries(), 'disk') })
		const optionsB = apex().props('options')
		expect(optionsA.chart.group).toBeUndefined()
		expect(optionsB.chart.group).toBeUndefined()
		expect(optionsB.chart.id).not.toBe(optionsA.chart.id)
	})

	it('draws the shared crosshair at the time of the cursor, and none without one', async () => {
		await mountChart()
		expect(apex().props('options').annotations).toEqual({})
		await wrapper.setProps({ cursor: FROM + 15 })
		expect(apex().props('options').annotations.xaxis).toHaveLength(1)
		expect(apex().props('options').annotations.xaxis[0]).toMatchObject({ x: (FROM + 15) * 1000, borderWidth: 1 })
		await wrapper.setProps({ cursor: null })
		expect(apex().props('options').annotations).toEqual({})
	})

	it('forgets an Escape pressed down when the figure loses the focus', async () => {
		await mountChart({ cursor: FROM + 15 })
		const figure = wrapper.find('figure')
		press(figure, 'Escape', 'keydown')
		await wrapper.setProps({ cursor: null })
		figure.element.dispatchEvent(new Event('blur'))
		const onDocument = vi.fn()
		document.addEventListener('keyup', onDocument)
		press(figure, 'Escape', 'keyup')
		document.removeEventListener('keyup', onDocument)
		expect(onDocument).toHaveBeenCalledTimes(1)
	})

	it('passes the series that are shown, not the hidden ones, and the legend says which is hidden', async () => {
		await mountChart({ chart: network({ hidden: new Set(['network/tx:eth0']) }) })
		expect(apex().props('series').map(s => s.name)).toEqual(['Received · eth0'])
		expect(legend().map(b => b.attributes('aria-pressed'))).toEqual(['true', 'false'])
		expect(legend().map(b => b.find('.stats-legend-name').text())).toEqual(['Received · eth0', 'Sent · eth0'])
	})

	it('emits toggle with the key when a legend entry is pressed', async () => {
		await mountChart()
		await legend()[1].trigger('click')
		expect(wrapper.emitted('toggle')).toEqual([['network/tx:eth0']])
		expect(legend()[0].attributes('type')).toBe('button')
	})

	it('shows the value at the cursor, and the last value without one', async () => {
		await mountChart()
		const values = () => wrapper.findAll('.stats-legend-value').map(v => v.text())
		expect(values()).toEqual(['30 B/s', '30 B/s'])
		await wrapper.setProps({ cursor: FROM + 15 })
		expect(values()).toEqual(['4 B/s', '4 B/s'])
		await wrapper.setProps({ cursor: null })
		expect(values()).toEqual(['30 B/s', '30 B/s'])
	})

	it('emits zoom when apexcharts zooms, and asks for x zoom by dragging', async () => {
		await mountChart()
		const { zoomed } = apex().props('options').chart.events
		zoomed({}, { xaxis: { min: 1000, max: 2000 } })
		zoomed({}, { xaxis: { min: Number.NaN, max: 2000 } })
		expect(wrapper.emitted('zoom')).toEqual([[{ min: 1000, max: 2000 }]])
		expect(apex().props('options').chart.zoom).toMatchObject({ enabled: true, type: 'x', autoSelected: 'zoom' })
		// the wheel must keep scrolling the page
		expect(apex().props('options').chart.zoom.allowMouseWheelZoom).toBe(false)
	})

	it('applies the zoom window of the page to the x axis', async () => {
		await mountChart({ zoom: { min: 5, max: 9 } })
		expect(apex().props('options').xaxis).toMatchObject({ min: 5, max: 9 })
	})

	it('emits the time of the point under the mouse, and null when it leaves', async () => {
		await mountChart()
		const { mouseMove, mouseLeave } = apex().props('options').chart.events
		mouseMove({}, {}, { dataPointIndex: 3 })
		mouseMove({}, {}, { dataPointIndex: -1 })
		mouseLeave()
		expect(wrapper.emitted('cursor')).toEqual([[FROM + 15], [null]])
	})

	describe('keyboard', () => {
		it('moves the cursor by one point, to the ends, and starts from the end without one', async () => {
			await mountChart({ cursor: FROM + 15 })
			const figure = wrapper.find('figure')
			expect(figure.attributes('tabindex')).toBe('0')
			press(figure, 'ArrowRight')
			press(figure, 'ArrowLeft')
			press(figure, 'Home')
			press(figure, 'End')
			expect(wrapper.emitted('cursor')).toEqual([[FROM + 20], [FROM + 10], [FROM], [FROM + 5 * 179]])
			await wrapper.setProps({ cursor: null })
			press(figure, 'ArrowLeft')
			expect(wrapper.emitted('cursor').at(-1)).toEqual([FROM + 5 * 179])
		})

		it('does not go past the ends', async () => {
			await mountChart({ cursor: FROM + 5 * 179 })
			press(wrapper.find('figure'), 'ArrowRight')
			expect(wrapper.emitted('cursor').at(-1)).toEqual([FROM + 5 * 179])
		})

		it('escape with a cursor clears it and goes no further', async () => {
			await mountChart({ cursor: FROM + 15 })
			const onDocument = vi.fn()
			document.addEventListener('keyup', onDocument)
			press(wrapper.find('figure'), 'Escape', 'keyup')
			document.removeEventListener('keyup', onDocument)
			expect(wrapper.emitted('cursor')).toEqual([[null]])
			expect(onDocument).not.toHaveBeenCalled()
		})

		it('escape without a cursor goes on to the window', async () => {
			await mountChart()
			const onDocument = vi.fn()
			document.addEventListener('keyup', onDocument)
			press(wrapper.find('figure'), 'Escape', 'keydown')
			press(wrapper.find('figure'), 'Escape', 'keyup')
			document.removeEventListener('keyup', onDocument)
			expect(wrapper.emitted('cursor')).toBeUndefined()
			expect(onDocument).toHaveBeenCalledTimes(1)
		})

		it('escape pressed down with a cursor holds back the release too', async () => {
			await mountChart({ cursor: FROM + 15 })
			const onDocument = vi.fn()
			document.addEventListener('keyup', onDocument)
			press(wrapper.find('figure'), 'Escape', 'keydown')
			await wrapper.setProps({ cursor: null })
			press(wrapper.find('figure'), 'Escape', 'keyup')
			document.removeEventListener('keyup', onDocument)
			expect(onDocument).not.toHaveBeenCalled()
		})
	})

	it('names the figure and gives the caption', async () => {
		await mountChart({ chart: chartOf(aSeries(), 'cpu') })
		expect(wrapper.find('figure').attributes('role')).toBe('img')
		expect(wrapper.find('figure').attributes('aria-label')).toBe('Processor: % of one core · 2 cores allocated')
		expect(wrapper.find('.stats-chart-caption').text()).toBe('% of one core · 2 cores allocated')
	})

	describe('the table', () => {
		it('is hidden until asked for, then shows the five columns', async () => {
			await mountChart()
			expect(wrapper.find('table').exists()).toBe(false)
			const toggle = wrapper.find('.stats-table-toggle')
			expect(toggle.attributes('aria-expanded')).toBe('false')
			expect(toggle.text()).toBe('Show as a table')
			await toggle.trigger('click')
			expect(toggle.attributes('aria-expanded')).toBe('true')
			expect(wrapper.find('table caption').text()).toBe('Network')
			expect(wrapper.findAll('thead th').map(th => th.text())).toEqual(['Series', 'Last', 'Min', 'Average', 'Max'])
			expect(wrapper.findAll('thead th').every(th => th.attributes('scope') === 'col')).toBe(true)
			expect(wrapper.find('tbody th').attributes('scope')).toBe('row')
			expect(wrapper.find('tbody tr').findAll('td').map(td => td.text())).toEqual(['30 B/s', '1 B/s', '24 B/s', '50 B/s'])
		})

		it('writes a dash for a series that has no value at all', async () => {
			const response = aSeries({ series: [{ chart: 'network', name: 'rx:eth0', unit: 'bytes_per_second', points: makePoints({ from: FROM, fn: () => null, count: 10 }) }] })
			await mountChart({ chart: network({}, response) })
			await wrapper.find('.stats-table-toggle').trigger('click')
			expect(wrapper.find('tbody tr').findAll('td').map(td => td.text())).toEqual(['-', '-', '-', '-'])
		})
	})

	it('shows a service text as text in the legend and the table', async () => {
		const response = aSeries({ series: [{ chart: 'network', name: `rx:${HOSTILE}`, unit: 'bytes_per_second', points: makePoints({ from: FROM }) }] })
		await mountChart({ chart: network({}, response) })
		await wrapper.find('.stats-table-toggle').trigger('click')
		expect(wrapper.find('img').exists()).toBe(false)
		expect(wrapper.find('.stats-legend-name').text()).toContain(HOSTILE)
		expect(wrapper.find('tbody th').text()).toContain(HOSTILE)
	})

	it('says there is no data and draws nothing for an empty chart', async () => {
		const response = aSeries({ series: [{ chart: 'network', name: 'rx:eth0', unit: 'bytes_per_second', points: makePoints({ from: FROM, fn: () => null }) }] })
		await mountChart({ chart: network({}, response) })
		expect(wrapper.text()).toContain('No data for this period')
		expect(apex().exists()).toBe(false)
	})

	it('draws nothing when every series is hidden', async () => {
		await mountChart({ chart: network({ hidden: new Set(['network/rx:eth0', 'network/tx:eth0']) }) })
		expect(apex().exists()).toBe(false)
		expect(legend()).toHaveLength(2)
	})
})
