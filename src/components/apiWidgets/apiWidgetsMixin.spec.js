// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { apiWidgetsMixin } from './apiWidgetsMixin'
import events from '@/events/events'
import { listWidgets, widgetCard } from '@/service/apiWidgets'

vi.mock('@/service/apiWidgets', () => ({ listWidgets: vi.fn(), widgetCard: vi.fn() }))

const listed = (id, name) => ({ id, base: 'https://example.org', insecure_tls: false, recipe: { name }, inputs_set: {}, error: '' })
const http = status => Object.assign(new Error('refused'), { status })
const wait = () => new Promise(resolve => setTimeout(resolve, 5))

let store
let handlers
let off
function host({ role = 'admin', options = {}, locale = 'fr_fr' } = {}) {
	store = reactive({ state: { roleConfirmed: true }, getters: { isAdmin: role === 'admin' } })
	handlers = {}
	off = vi.fn()
	return mount({ mixins: [apiWidgetsMixin], render: () => null, ...options }, {
		global: {
			mocks: {
				$store: store,
				$t: key => `t:${key}`,
				$i18n: reactive({ locale }),
				$EventBus: {
					$on: (event, fn) => {
						handlers[event] = fn
					},
					$off: off,
				},
			},
		},
	})
}

beforeEach(() => {
	listWidgets.mockReset()
	widgetCard.mockReset()
	listWidgets.mockResolvedValue({ widgets: [listed('ab12cd34', 'My router'), listed('zz99zz99', 'Second')] })
	widgetCard.mockResolvedValue({ title: 'Router', rows: [{ label: 'CPU', value: { kind: 'percent', number: 42.5 }, bar: 42.5 }], link: 'https://example.org/' })
})
afterEach(() => {
	vi.useRealTimers()
	Object.defineProperty(document, 'hidden', { value: false, configurable: true })
})

describe('the API widgets of a home', () => {
	it('lists the widgets of the administrator, each with its key, its name and what reads its card', async () => {
		const wrapper = host()
		await flushPromises()
		expect(listWidgets).toHaveBeenCalledTimes(1)
		expect(wrapper.vm.apiWidgets.map(({ name, id, title }) => ({ name, id, title }))).toEqual([{ name: 'custom:ab12cd34', id: 'ab12cd34', title: 'My router' }, { name: 'custom:zz99zz99', id: 'zz99zz99', title: 'Second' }])
		// no card is read before a card is drawn
		expect(widgetCard).not.toHaveBeenCalled()

		const view = await wrapper.vm.apiWidgets[0].source.load()
		expect(widgetCard).toHaveBeenCalledWith('ab12cd34')
		expect(view.title).toBe('Router')
		// the numbers are written in the language of the page, and the fixed words are the page's
		expect(view.rows[0].value).toBe(new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 }).format(0.425))
		expect(view.rows[0].bar).toBe(43)
		expect(view.link).toEqual({ label: 't:Open', url: 'https://example.org/' })
	})

	it('writes the numbers in the language the page has when the card is read', async () => {
		const wrapper = host()
		await flushPromises()
		wrapper.vm.$i18n.locale = 'en_us'
		expect((await wrapper.vm.apiWidgets[0].source.load()).rows[0].value).toBe('42.5%')
	})

	it('gives the failure of a read to the card, with its status', async () => {
		const wrapper = host()
		await flushPromises()
		widgetCard.mockRejectedValue(http(404))
		await expect(wrapper.vm.apiWidgets[0].source.load()).rejects.toMatchObject({ status: 404 })
		widgetCard.mockResolvedValue({ error: 'timeout' })
		expect(await wrapper.vm.apiWidgets[0].source.load()).toBeNull()
	})

	it.each(['user', ''])('asks nothing for an account whose role is %j', async (role) => {
		const wrapper = host({ role })
		await flushPromises()
		handlers[events.API_WIDGETS_CHANGED]()
		await flushPromises()
		expect(listWidgets).not.toHaveBeenCalled()
		expect(wrapper.vm.apiWidgets).toEqual([])
	})

	it('asks nothing while the role is not confirmed, asks once it is, and empties the list of an account that is no longer the administrator', async () => {
		const wrapper = host()
		store.state.roleConfirmed = false
		await flushPromises()
		expect(wrapper.vm.apiWidgets).toEqual([])
		const before = listWidgets.mock.calls.length
		store.state.roleConfirmed = true
		await flushPromises()
		expect(listWidgets).toHaveBeenCalledTimes(before + 1)
		expect(wrapper.vm.apiWidgets).toHaveLength(2)
		store.getters.isAdmin = false
		await flushPromises()
		expect(wrapper.vm.apiWidgets).toEqual([])
	})

	it('has no widget, and says nothing, when the core does not know the route (404)', async () => {
		const wrapper = host()
		await flushPromises()
		expect(wrapper.vm.apiWidgets).toHaveLength(2)
		listWidgets.mockRejectedValue(http(404))
		handlers[events.API_WIDGETS_CHANGED]()
		await flushPromises()
		// no $buefy here: a toast would throw
		expect(wrapper.vm.apiWidgets).toEqual([])
	})

	it.each([500, 0])('keeps the widgets it has, and says nothing, when the list answers %i', async (status) => {
		const apiWidgetsRead = vi.fn()
		const wrapper = host({ options: { methods: { apiWidgetsRead } } })
		await flushPromises()
		const before = wrapper.vm.apiWidgets
		expect(before).toHaveLength(2)
		apiWidgetsRead.mockClear()
		listWidgets.mockRejectedValue(http(status))
		handlers[events.API_WIDGETS_CHANGED]()
		await flushPromises()
		expect(wrapper.vm.apiWidgets).toEqual(before)
		// nothing was read: the home is not told that a list came
		expect(apiWidgetsRead).not.toHaveBeenCalled()
	})

	it('reads the list all the same when what the home does before it fails, whatever that failure says', async () => {
		const wrapper = host({ options: { methods: { apiWidgetsBefore: () => Promise.reject(http(404)) } } })
		await flushPromises()
		expect(wrapper.vm.apiWidgets).toHaveLength(2)
	})

	it('believes only a list of widgets with the id of the core, each once', async () => {
		for (const data of [null, 'x', {}, { widgets: 'x' }]) {
			listWidgets.mockResolvedValue(data)
			const wrapper = host()
			await flushPromises()
			expect(wrapper.vm.apiWidgets).toEqual([])
		}
		listWidgets.mockResolvedValue({ widgets: [null, 'x', listed('AB12CD34', 'upper'), listed('short', 'short'), listed('../../x', 'path'), { id: 'ab12cd34' }, listed('ab12cd34', 'twice'), listed('zz99zz99', 7)] })
		const wrapper = host()
		await flushPromises()
		expect(wrapper.vm.apiWidgets.map(({ name, title }) => [name, title])).toEqual([['custom:ab12cd34', ''], ['custom:zz99zz99', '']])
	})

	it('reads the list again when the widgets change, after the home has read what it needs', async () => {
		const order = []
		const wrapper = host({
			options: {
				methods: {
					apiWidgetsBefore(changed) {
						order.push(`before ${changed}`)
						return new Promise(resolve => setTimeout(resolve)).then(() => order.push('before done'))
					},
					apiWidgetsRead() {
						order.push(`read ${this.apiWidgets.length}`)
					},
				},
			},
		})
		await wait()
		expect(order).toEqual(['before false', 'before done', 'read 2'])
		listWidgets.mockImplementation(() => {
			order.push('list')
			return Promise.resolve({ widgets: [listed('ab12cd34', 'Renamed')] })
		})
		handlers[events.API_WIDGETS_CHANGED]({ some: 'payload' })
		await wait()
		expect(order.slice(3)).toEqual(['before true', 'before done', 'list', 'read 1'])
		expect(wrapper.vm.apiWidgets.map(entry => entry.title)).toEqual(['Renamed'])
	})

	it('keeps what reads a card across the readings of the list, and renews it when the widgets change', async () => {
		vi.useFakeTimers()
		const wrapper = host()
		await flushPromises()
		const first = wrapper.vm.apiWidgets[0].source
		await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
		expect(listWidgets).toHaveBeenCalledTimes(2)
		expect(wrapper.vm.apiWidgets[0].source).toBe(first)
		handlers[events.API_WIDGETS_CHANGED]()
		await flushPromises()
		expect(wrapper.vm.apiWidgets[0].source).not.toBe(first)
	})

	it('reads the list every five minutes, not while the tab is hidden, and not once the home has left', async () => {
		vi.useFakeTimers()
		const wrapper = host()
		await flushPromises()
		await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
		expect(listWidgets).toHaveBeenCalledTimes(2)
		Object.defineProperty(document, 'hidden', { value: true, configurable: true })
		await vi.advanceTimersByTimeAsync(20 * 60 * 1000)
		expect(listWidgets).toHaveBeenCalledTimes(2)
		Object.defineProperty(document, 'hidden', { value: false, configurable: true })
		document.dispatchEvent(new Event('visibilitychange'))
		await flushPromises()
		expect(listWidgets).toHaveBeenCalledTimes(3)
		wrapper.unmount()
		await vi.advanceTimersByTimeAsync(20 * 60 * 1000)
		expect(listWidgets).toHaveBeenCalledTimes(3)
		expect(off).toHaveBeenCalledWith(events.API_WIDGETS_CHANGED, expect.any(Function))
	})

	it('takes a widget away when its card says it is gone', async () => {
		const wrapper = host()
		await flushPromises()
		wrapper.vm.apiWidgetGone('custom:ab12cd34')
		expect(wrapper.vm.apiWidgets.map(entry => entry.name)).toEqual(['custom:zz99zz99'])
	})

	it('drops the answer of a reading that a newer one has passed', async () => {
		let slow
		listWidgets.mockReturnValueOnce(new Promise((resolve) => {
			slow = resolve
		}))
		const wrapper = host()
		await flushPromises()
		listWidgets.mockResolvedValue({ widgets: [listed('zz99zz99', 'Second')] })
		handlers[events.API_WIDGETS_CHANGED]()
		await flushPromises()
		slow({ widgets: [listed('ab12cd34', 'Old')] })
		await flushPromises()
		expect(wrapper.vm.apiWidgets.map(entry => entry.title)).toEqual(['Second'])
	})
})
