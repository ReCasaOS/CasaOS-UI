// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ModuleCard from './ModuleCard.vue'
import { actUrl as act, getCard } from '@/service/moduleCards'
import fr from '@/assets/lang/fr_FR.json'

vi.mock('@/service/moduleCards', async importOriginal => ({ ...(await importOriginal()), getCard: vi.fn(), actUrl: vi.fn() }))

const ROUTE = '/v1/wake_on_lan'
const entry = { name: 'wake-on-lan', title: 'Wake-on-LAN', route: ROUTE, foreign: false, owner: '' }
function description(extra = {}) {
	return {
		schema: 1,
		title: 'Wake machines',
		icon: 'network-outline',
		status: { level: 'ok', text: '3 machines' },
		rows: [{ label: 'NAS', value: 'asleep', level: 'warning' }],
		actions: [{ label: 'Wake all', method: 'POST', path: '/wake-all', body: { all: true }, confirm: 'Wake <b>every</b> machine?' }, { label: 'Ping', method: 'POST', path: '/ping' }],
		link: { label: 'Open', path: '/ui' },
		refresh: 30,
		...extra,
	}
}
const http = status => Object.assign(new Error(`status ${status}`), { status, data: null })

let confirm
let toast
function mountCard(props = {}, translate = key => key) {
	return mount(ModuleCard, {
		props: { module: entry, ...props },
		global: {
			plugins: [Buefy],
			mocks: {
				$t: (key, params) => (params ? translate(key).replace(/\{(\w+)\}/g, (_, name) => params[name]) : translate(key)),
				$buefy: { dialog: { confirm }, toast: { open: toast } },
			},
		},
	})
}

beforeEach(() => {
	confirm = vi.fn()
	toast = vi.fn()
	getCard.mockReset()
	act.mockReset()
	getCard.mockResolvedValue({ data: description() })
	act.mockResolvedValue({ data: { message: 'Sent' } })
})
afterEach(() => {
	vi.useRealTimers()
	Object.defineProperty(document, 'hidden', { value: false, configurable: true })
})

describe('a card of a module', () => {
	it('shows the card that the module describes, with the link in a new tab', async () => {
		const wrapper = mountCard()
		await flushPromises()
		expect(getCard).toHaveBeenCalledWith(ROUTE)
		expect(wrapper.text()).toContain('Wake machines')
		expect(wrapper.find('.module-card-status').text()).toBe('3 machines')
		expect(wrapper.find('.module-card-status').classes()).toContain('is-ok')
		expect(wrapper.text()).toContain('NAS')
		expect(wrapper.text()).toContain('asleep')
		const link = wrapper.find('a.module-card-link')
		expect(link.attributes()).toMatchObject({ href: `${ROUTE}/ui`, target: '_blank', rel: 'noopener noreferrer' })
		expect(wrapper.findAll('button').map(b => b.text())).toEqual(['Wake all', 'Ping'])
		expect(wrapper.emitted('loaded')[0][0]).toEqual({ name: 'wake-on-lan', icon: 'network-outline' })
	})

	it('shows the owner of a module that is not ReCasaOS\'s', async () => {
		const wrapper = mountCard({ module: { ...entry, foreign: true, owner: 'inkly' } })
		await flushPromises()
		expect(wrapper.find('.module-card-owner').text()).toBe('by inkly')
		expect((await mountCardOwn()).find('.module-card-owner').exists()).toBe(false)
	})

	it('shows its text as text, never as markup', async () => {
		getCard.mockResolvedValue({ data: description({ title: '<img src=x onerror=alert(1)>', rows: [{ label: '<b>a</b>', value: '<i>b</i>' }] }) })
		const wrapper = mountCard()
		await flushPromises()
		expect(wrapper.find('img').exists()).toBe(false)
		expect(wrapper.html()).not.toContain('<b>a</b>')
		expect(wrapper.html()).not.toContain('<i>b</i>')
		expect(wrapper.text()).toContain('<b>a</b>')
	})

	it('says it is unavailable for now when the answer is not valid JSON, is slow, is a 5xx, or is a description that is refused', async () => {
		for (const failure of [() => Promise.reject(new Error('answer too long')), () => Promise.reject(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' })), () => Promise.reject(http(500)), () => Promise.reject(http(502)), () => Promise.resolve({ data: description({ evil: 1 }) }), () => Promise.resolve({ data: 'text' })]) {
			getCard.mockImplementation(failure)
			const wrapper = mountCard()
			await flushPromises()
			expect(wrapper.find('.module-card-unavailable').text()).toBe('This card is unavailable for now')
			expect(wrapper.findAll('button')).toHaveLength(0)
			expect(wrapper.text()).toContain('Wake-on-LAN')
			wrapper.unmount()
		}
		expect(toast).not.toHaveBeenCalled()
	})

	it.each([401, 403, 404])('disappears, with no word of it, when the module answers %i', async (status) => {
		getCard.mockRejectedValue(http(status))
		const wrapper = mountCard()
		await flushPromises()
		expect(wrapper.find('.module-card').exists()).toBe(false)
		expect(wrapper.text()).toBe('')
		expect(wrapper.emitted('gone')).toEqual([['wake-on-lan']])
		expect(toast).not.toHaveBeenCalled()
	})

	it('disappears when a card that was shown is then answered 404 (the module was stopped)', async () => {
		vi.useFakeTimers()
		const wrapper = mountCard()
		await flushPromises()
		expect(wrapper.find('.module-card').exists()).toBe(true)
		getCard.mockRejectedValue(http(404))
		await vi.advanceTimersByTimeAsync(30000)
		expect(wrapper.find('.module-card').exists()).toBe(false)
		// and it does not ask again
		getCard.mockClear()
		await vi.advanceTimersByTimeAsync(600000)
		expect(getCard).not.toHaveBeenCalled()
	})
})

function mountCardOwn() {
	const wrapper = mountCard()
	return flushPromises().then(() => wrapper)
}

describe('the actions of a card', () => {
	const click = (wrapper, label) => wrapper.findAll('button').find(b => b.text() === label).trigger('click')

	it('sends an action with no confirmation at once, once, disabled while it is sent, then says the answer and reads the card again', async () => {
		let answer
		act.mockReturnValue(new Promise((resolve) => {
			answer = resolve
		}))
		const wrapper = mountCard()
		await flushPromises()
		await click(wrapper, 'Ping')
		await click(wrapper, 'Ping')
		await click(wrapper, 'Wake all')
		expect(act).toHaveBeenCalledTimes(1)
		expect(act).toHaveBeenCalledWith(ROUTE, `${ROUTE}/ping`, {})
		expect(confirm).not.toHaveBeenCalled()
		expect(wrapper.findAll('button').every(b => b.attributes('disabled') !== undefined)).toBe(true)
		getCard.mockClear()
		answer({ data: { message: 'Pinged <b>3</b>' } })
		await flushPromises()
		// the toast renders HTML: the text of the module is escaped
		expect(toast).toHaveBeenCalledWith({ message: 'Pinged &lt;b&gt;3&lt;/b&gt;', type: 'is-success' })
		expect(getCard).toHaveBeenCalledTimes(1)
		expect(wrapper.findAll('button').every(b => b.attributes('disabled') === undefined)).toBe(true)
	})

	it('sends nothing before the confirmation, once after it, and shows the text of the module as text in the dialog', async () => {
		const wrapper = mountCard()
		await flushPromises()
		await click(wrapper, 'Wake all')
		await click(wrapper, 'Wake all')
		await click(wrapper, 'Ping')
		expect(confirm).toHaveBeenCalledTimes(1)
		expect(confirm.mock.calls[0][0].message).toBe('Wake &lt;b&gt;every&lt;/b&gt; machine?')
		expect(act).not.toHaveBeenCalled()

		confirm.mock.calls[0][0].onConfirm()
		confirm.mock.calls[0][0].onConfirm()
		await flushPromises()
		expect(act).toHaveBeenCalledTimes(1)
		expect(act).toHaveBeenCalledWith(ROUTE, `${ROUTE}/wake-all`, { all: true })
	})

	it('sends nothing when the confirmation is declined, and the buttons work again', async () => {
		const wrapper = mountCard()
		await flushPromises()
		await click(wrapper, 'Wake all')
		confirm.mock.calls[0][0].onCancel()
		await wrapper.vm.$nextTick()
		expect(act).not.toHaveBeenCalled()
		expect(wrapper.findAll('button').every(b => b.attributes('disabled') === undefined)).toBe(true)
		await click(wrapper, 'Wake all')
		expect(confirm).toHaveBeenCalledTimes(2)
	})

	it('says the message of a failed action, or the generic sentence, and reads the card again', async () => {
		const wrapper = mountCard()
		await flushPromises()
		act.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 500, data: { message: 'No such machine' } }))
		await click(wrapper, 'Ping')
		await flushPromises()
		expect(toast).toHaveBeenLastCalledWith({ message: 'No such machine', type: 'is-danger' })

		act.mockRejectedValueOnce(new Error('timeout'))
		await click(wrapper, 'Ping')
		await flushPromises()
		expect(toast).toHaveBeenLastCalledWith({ message: 'The module did not answer. Try again.', type: 'is-danger' })
		expect(getCard).toHaveBeenCalledTimes(3)
	})

	it('says nothing when a successful action has no message', async () => {
		act.mockResolvedValue({ data: {} })
		const wrapper = mountCard()
		await flushPromises()
		await click(wrapper, 'Ping')
		await flushPromises()
		expect(toast).not.toHaveBeenCalled()
	})
})

describe('the reading of a card, again and again', () => {
	it('reads at the pace of the card, and not while the tab is hidden; it reads when the tab is seen again', async () => {
		vi.useFakeTimers()
		const wrapper = mountCard()
		await flushPromises()
		expect(getCard).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(29000)
		expect(getCard).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(1000)
		expect(getCard).toHaveBeenCalledTimes(2)

		Object.defineProperty(document, 'hidden', { value: true, configurable: true })
		await vi.advanceTimersByTimeAsync(300000)
		expect(getCard).toHaveBeenCalledTimes(2)
		Object.defineProperty(document, 'hidden', { value: false, configurable: true })
		document.dispatchEvent(new Event('visibilitychange'))
		await flushPromises()
		expect(getCard).toHaveBeenCalledTimes(3)
		wrapper.unmount()
	})

	it('asks again a minute later when the module did not answer, and stops for good when the card is gone from the screen', async () => {
		vi.useFakeTimers()
		getCard.mockRejectedValue(http(500))
		const wrapper = mountCard()
		await flushPromises()
		await vi.advanceTimersByTimeAsync(60000)
		expect(getCard).toHaveBeenCalledTimes(2)
		wrapper.unmount()
		await vi.advanceTimersByTimeAsync(600000)
		expect(getCard).toHaveBeenCalledTimes(2)
	})

	it('does not show an answer that arrives after the card is gone', async () => {
		let answer
		getCard.mockReturnValue(new Promise((resolve) => {
			answer = resolve
		}))
		const wrapper = mountCard()
		wrapper.unmount()
		answer({ data: description() })
		await flushPromises()
		expect(wrapper.emitted('loaded')).toBeUndefined()
	})
})

describe('the texts of the card', () => {
	it('are French once', async () => {
		getCard.mockRejectedValue(http(500))
		const wrapper = mountCard({ module: { ...entry, foreign: true, owner: 'inkly' } }, key => fr[key] ?? key)
		await flushPromises()
		expect(wrapper.find('.module-card-unavailable').text()).toBe('Cette carte est indisponible pour le moment')
		expect(wrapper.find('.module-card-owner').text()).toBe('par inkly')
	})
})

describe('a card that leaves the screen, or is given to another module', () => {
	const click = (wrapper, label) => wrapper.findAll('button').find(b => b.text() === label).trigger('click')

	it('does not read again, nor start a timer, when it is unmounted while an action is on its way', async () => {
		vi.useFakeTimers()
		let answer
		act.mockReturnValue(new Promise((resolve) => {
			answer = resolve
		}))
		const wrapper = mountCard()
		await flushPromises()
		await click(wrapper, 'Ping')
		wrapper.unmount()
		getCard.mockClear()
		answer({ data: { message: 'late' } })
		await flushPromises()
		await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
		expect(getCard).not.toHaveBeenCalled()
		expect(vi.getTimerCount()).toBe(0)
	})

	it('closes its dialog when it is unmounted, and sends nothing if the dialog is answered after that', async () => {
		const dialog = { close: vi.fn() }
		confirm.mockReturnValue(dialog)
		const wrapper = mountCard()
		await flushPromises()
		await click(wrapper, 'Wake all')
		wrapper.unmount()
		expect(dialog.close).toHaveBeenCalled()
		confirm.mock.calls[0][0].onConfirm()
		await flushPromises()
		expect(act).not.toHaveBeenCalled()
	})

	it('draws nothing of the old module, and sends nothing to its route, when it is given to another one', async () => {
		let answer
		const other = { name: 'second', title: 'Second', route: '/v1/second', foreign: false, owner: '' }
		const wrapper = mountCard()
		await flushPromises()
		expect(wrapper.text()).toContain('Wake machines')
		getCard.mockReturnValue(new Promise((resolve) => {
			answer = resolve
		}))
		await wrapper.setProps({ module: other })
		expect(wrapper.text()).toBe('')
		answer({ data: description({ title: 'Other card', actions: [{ label: 'Go', method: 'POST', path: '/go' }] }) })
		await flushPromises()
		expect(getCard).toHaveBeenLastCalledWith('/v1/second')
		expect(wrapper.text()).toContain('Other card')
		expect(wrapper.text()).not.toContain('Wake machines')
		await click(wrapper, 'Go')
		expect(act).toHaveBeenCalledWith('/v1/second', '/v1/second/go', {})
	})

	it('shows only the word when a read fails, and not the status of the card as it was', async () => {
		vi.useFakeTimers()
		const wrapper = mountCard()
		await flushPromises()
		expect(wrapper.find('.module-card-status').exists()).toBe(true)
		getCard.mockRejectedValue(http(500))
		await vi.advanceTimersByTimeAsync(30000)
		expect(wrapper.find('.module-card-status').exists()).toBe(false)
		expect(wrapper.findAll('button')).toHaveLength(0)
		expect(wrapper.find('.module-card-unavailable').exists()).toBe(true)
	})
})

describe('a card that is given what reads it (an API widget)', () => {
	const widget = { name: 'custom:ab12cd34', id: 'ab12cd34', title: 'My router' }
	const row = (label, value, extra = {}) => ({ label, value, level: '', bar: null, action: null, ...extra })
	const view = (extra = {}) => ({ title: 'Router', icon: 'network-outline', status: { level: 'ok', text: 'UP' }, rows: [row('Clients', '12')], actions: [], link: { label: 'Open', url: 'https://router.example/' }, layout: 'rows', more: 0, refresh: 300, ...extra })
	const sourced = (load, props = {}) => mountCard({ module: widget, source: { load }, ...props })

	it('draws what its source gives, asks no module, and opens the link in a new tab', async () => {
		const load = vi.fn().mockResolvedValue(view())
		const wrapper = sourced(load)
		await flushPromises()
		expect(load).toHaveBeenCalledTimes(1)
		expect(getCard).not.toHaveBeenCalled()
		expect(wrapper.find('.widget-title').text()).toBe('Router')
		expect(wrapper.find('.module-card-status').text()).toBe('UP')
		expect(wrapper.find('.module-card-rows li').text()).toContain('Clients')
		expect(wrapper.find('.module-card-rows li').text()).toContain('12')
		expect(wrapper.find('.module-card-rows').classes()).not.toContain('is-figures')
		expect(wrapper.find('[role="progressbar"]').exists()).toBe(false)
		expect(wrapper.find('.module-card-more').exists()).toBe(false)
		expect(wrapper.find('a.module-card-link').attributes()).toMatchObject({ href: 'https://router.example/', target: '_blank', rel: 'noopener noreferrer' })
		expect(wrapper.emitted('loaded')[0][0]).toEqual({ name: 'custom:ab12cd34', icon: 'network-outline' })
	})

	it('draws the figures, four at most, a bar under a row that has one, and how many rows were left out', async () => {
		const rows = [row('CPU', '42%', { bar: 42, level: 'warning' }), row('Zero', '0%', { bar: 0 }), row('Up', '3 days'), row('Four', '4'), row('Five', '5')]
		const wrapper = sourced(vi.fn().mockResolvedValue(view({ layout: 'figures', rows, more: 3 })))
		await flushPromises()
		expect(wrapper.find('.module-card-rows').classes()).toContain('is-figures')
		expect(wrapper.findAll('.module-card-rows li')).toHaveLength(4)
		const bars = wrapper.findAll('[role="progressbar"]')
		expect(bars).toHaveLength(2)
		expect(bars[0].attributes()).toMatchObject({ 'aria-valuenow': '42', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'CPU' })
		expect(bars[0].classes()).toContain('is-warning')
		expect(bars[0].find('span').attributes('style')).toContain('width: 42%')
		expect(bars[1].attributes('aria-valuenow')).toBe('0')
		expect(wrapper.find('.module-card-more').text()).toBe('+3')
	})

	it('shows a value as text, never as markup', async () => {
		const wrapper = sourced(vi.fn().mockResolvedValue(view({ title: '<img src=x>', status: { level: 'info', text: '<img src=x>' }, rows: [row('<b>a</b>', '<img src=x>')] })))
		await flushPromises()
		expect(wrapper.find('img').exists()).toBe(false)
		expect(wrapper.find('.module-card-rows b').exists()).toBe(false)
		expect(wrapper.find('.module-card-value').text()).toBe('<img src=x>')
	})

	it('never draws a button, whatever the view holds', async () => {
		const action = { label: 'Run', url: '/v1/x/run', body: {}, confirm: '' }
		const wrapper = sourced(vi.fn().mockResolvedValue(view({ actions: [action], rows: [row('A', '1', { action })] })))
		await flushPromises()
		expect(wrapper.find('.module-card-rows li').exists()).toBe(true)
		expect(wrapper.findAll('button')).toHaveLength(0)
		expect(act).not.toHaveBeenCalled()
	})

	it('leaves when its read is a 404, and only then', async () => {
		const gone = sourced(vi.fn().mockRejectedValue(http(404)))
		await flushPromises()
		expect(gone.emitted('gone')[0]).toEqual(['custom:ab12cd34'])
		expect(gone.find('.module-card').exists()).toBe(false)

		for (const status of [401, 403, 500, 0]) {
			const wrapper = sourced(vi.fn().mockRejectedValue(http(status)))
			await flushPromises()
			expect(wrapper.emitted('gone')).toBeUndefined()
			expect(wrapper.find('.module-card-unavailable').exists()).toBe(true)
		}
	})

	it('says it is unavailable under the name of the widget when the view is null, and reads again after a minute', async () => {
		vi.useFakeTimers()
		const load = vi.fn().mockResolvedValue(null)
		const wrapper = sourced(load)
		await flushPromises()
		expect(wrapper.find('.widget-title').text()).toBe('My router')
		expect(wrapper.find('.module-card-unavailable').text()).toBe('This card is unavailable for now')
		expect(wrapper.find('.module-card-status').exists()).toBe(false)
		load.mockResolvedValue(view())
		await vi.advanceTimersByTimeAsync(59000)
		expect(load).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(1000)
		expect(load).toHaveBeenCalledTimes(2)
		expect(wrapper.find('.widget-title').text()).toBe('Router')
	})

	it('reads again at the rhythm of the view, not while the tab is hidden, and not once it has left', async () => {
		vi.useFakeTimers()
		const load = vi.fn().mockResolvedValue(view({ refresh: 120 }))
		const wrapper = sourced(load)
		await flushPromises()
		await vi.advanceTimersByTimeAsync(119000)
		expect(load).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(1000)
		expect(load).toHaveBeenCalledTimes(2)
		Object.defineProperty(document, 'hidden', { value: true, configurable: true })
		await vi.advanceTimersByTimeAsync(600000)
		expect(load).toHaveBeenCalledTimes(2)
		Object.defineProperty(document, 'hidden', { value: false, configurable: true })
		document.dispatchEvent(new Event('visibilitychange'))
		await flushPromises()
		expect(load).toHaveBeenCalledTimes(3)
		wrapper.unmount()
		await vi.advanceTimersByTimeAsync(600000)
		expect(load).toHaveBeenCalledTimes(3)
	})

	it('reads at once from a new source, and keeps what it shows meanwhile', async () => {
		const wrapper = sourced(vi.fn().mockResolvedValue(view()))
		await flushPromises()
		let answer
		const load = vi.fn(() => new Promise((resolve) => {
			answer = resolve
		}))
		await wrapper.setProps({ source: { load } })
		expect(load).toHaveBeenCalledTimes(1)
		expect(wrapper.find('.widget-title').text()).toBe('Router')
		answer(view({ title: 'Router 2' }))
		await flushPromises()
		expect(wrapper.find('.widget-title').text()).toBe('Router 2')
	})

	it('hands the same to the home that draws it as a panel', async () => {
		const action = { label: 'Run', url: '/v1/x/run', body: {}, confirm: '' }
		const rows = [row('1', 'a', { action }), row('2', 'b'), row('3', 'c'), row('4', 'd'), row('5', 'e')]
		let given
		mount(ModuleCard, {
			props: { module: widget, variant: 'panel', source: { load: () => Promise.resolve(view({ layout: 'figures', rows, actions: [action] })) } },
			slots: {
				default: (props) => {
					given = props
					return ''
				},
			},
			global: { plugins: [Buefy], mocks: { $t: key => key } },
		})
		await flushPromises()
		expect(given.state).toBe('ok')
		expect(given.card.rows).toHaveLength(4)
		expect(given.card.rows.every(item => item.action === null)).toBe(true)
		expect(given.card.actions).toEqual([])
	})
})
