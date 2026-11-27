// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ApiWidgetsModal from './ApiWidgetsModal.vue'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'
import pt from '@/assets/lang/pt_BR.json'
import createEventBus from '@/events/eventBus'
import events from '@/events/events'
import { deleteWidget, listWidgets } from '@/service/apiWidgets'

vi.mock('@/service/apiWidgets', () => ({ listWidgets: vi.fn(), deleteWidget: vi.fn() }))

const A = 'ab12cd34'
const B = 'zz99zz99'
const listed = (id, name, extra = {}) => ({ id, base: `https://${id}.example.org`, insecure_tls: false, recipe: { name }, inputs_set: {}, error: '', ...extra })
const refusal = (status, message = '') => Object.assign(new Error(message), { status })
const builtIn = [{ name: 'Clock', show: true }, { name: 'module:wake-on-lan', show: false }]

// what the box has saved: read fresh by every call, as the real one is
let stored
let getCustomStorage
let setCustomStorage
let emitted
let handlers
let confirm
let toast
async function open(bus) {
	const wrapper = mount(ApiWidgetsModal, {
		global: {
			plugins: [Buefy],
			mocks: {
				$t: (key, params) => (params ? key.replace(/\{(\w+)\}/g, (_, k) => params[k]) : key),
				$api: { users: { getCustomStorage, setCustomStorage } },
				$EventBus: bus ?? {
					$emit: (...args) => emitted.push(args),
					$on: (event, fn) => {
						handlers[event] = fn
					},
					$off: vi.fn(),
				},
				$buefy: { dialog: { confirm }, toast: { open: toast } },
			},
		},
	})
	await flushPromises()
	return wrapper
}

const rows = wrapper => wrapper.findAll('[data-widget]')
const row = (wrapper, id) => wrapper.find(`[data-widget="${id}"]`)
const toggle = (wrapper, id) => row(wrapper, id).find('input[type=checkbox]')
const saved = () => setCustomStorage.mock.calls.at(-1)[1]

beforeEach(() => {
	stored = [builtIn[0], { name: `custom:${B}`, show: false }, builtIn[1], { name: `custom:${A}`, show: true }]
	getCustomStorage = vi.fn(() => Promise.resolve({ status: 200, data: { data: stored.map(item => ({ ...item })) } }))
	setCustomStorage = vi.fn((key, data) => {
		stored = data
		return Promise.resolve({ data: { success: 200, data } })
	})
	emitted = []
	handlers = {}
	confirm = vi.fn()
	toast = vi.fn()
	listWidgets.mockReset()
	deleteWidget.mockReset()
	listWidgets.mockResolvedValue({ widgets: [listed(A, 'My router'), listed(B, 'Solar', { error: 'the address answered 503' })] })
	deleteWidget.mockResolvedValue(null)
})

describe('the list of the API widgets window', () => {
	it('shows each widget with its name, its address and why its last read failed', async () => {
		const wrapper = await open()
		expect(rows(wrapper)).toHaveLength(2)
		expect(row(wrapper, A).find('[data-widget-name]').text()).toBe('My router')
		expect(row(wrapper, A).find('[data-widget-base]').text()).toBe(`https://${A}.example.org`)
		expect(row(wrapper, A).find('[data-widget-error]').exists()).toBe(false)
		expect(row(wrapper, B).find('[data-widget-error]').text()).toBe('Last read failed: the address answered 503')
		expect(wrapper.find('[data-widgets-failed]').exists()).toBe(false)
	})

	it('writes what a widget says as text, never as markup', async () => {
		listWidgets.mockResolvedValue({ widgets: [listed(A, '<img src=x onerror=alert(1)>', { base: 'https://x/<b>', error: '<i>no</i>' })] })
		const wrapper = await open()
		expect(row(wrapper, A).find('[data-widget-name]').text()).toBe('<img src=x onerror=alert(1)>')
		expect(row(wrapper, A).find('[data-widget-base]').text()).toBe('https://x/<b>')
		expect(row(wrapper, A).find('[data-widget-error]').text()).toBe('Last read failed: <i>no</i>')
		expect(wrapper.find('img, b, i').exists()).toBe(false)
	})

	it('believes only the widgets with an id of the core, each once', async () => {
		listWidgets.mockResolvedValue({ widgets: [null, 'x', listed('../../x', 'path'), listed('AB12CD34', 'upper'), listed(A, 7), listed(A, 'twice')] })
		const wrapper = await open()
		expect(rows(wrapper)).toHaveLength(1)
		// a widget without a name is called by its id
		expect(row(wrapper, A).find('[data-widget-name]').text()).toBe(A)
	})

	it('says there is no widget yet, which is not what a failure says', async () => {
		listWidgets.mockResolvedValue({ widgets: [] })
		const wrapper = await open()
		expect(wrapper.find('[data-widgets-none]').exists()).toBe(true)
		expect(wrapper.find('[data-widgets-failed]').exists()).toBe(false)
	})

	it('says the box needs an update when the core does not know the widgets (404)', async () => {
		listWidgets.mockRejectedValue(refusal(404))
		const wrapper = await open()
		expect(wrapper.find('[data-widgets-failed]').text()).toBe('This box does not know the API widgets yet: update it.')
		expect(wrapper.find('[data-widgets-none]').exists()).toBe(false)
		expect(wrapper.find('[data-widgets-add]').attributes('disabled')).toBeDefined()
		expect(wrapper.find('[data-widgets-import]').attributes('disabled')).toBeDefined()
	})

	it.each([
		[refusal(500, 'the store <b>is</b> locked'), 'The widgets could not be loaded: the store <b>is</b> locked'],
		[refusal(0), 'The widgets could not be loaded.'],
	])('says that the list could not be loaded, and shows no empty list', async (error, sentence) => {
		listWidgets.mockRejectedValue(error)
		const wrapper = await open()
		expect(wrapper.find('[data-widgets-failed]').text()).toBe(sentence)
		expect(wrapper.find('[data-widgets-failed] b').exists()).toBe(false)
		expect(wrapper.find('[data-widgets-none]').exists()).toBe(false)
		expect(rows(wrapper)).toHaveLength(0)
	})

	it('reads the list again when a widget changes elsewhere, and no longer once closed', async () => {
		const wrapper = await open()
		listWidgets.mockResolvedValue({ widgets: [listed(A, 'Renamed')] })
		handlers[events.API_WIDGETS_CHANGED]()
		await flushPromises()
		expect(rows(wrapper)).toHaveLength(1)
		expect(row(wrapper, A).find('[data-widget-name]').text()).toBe('Renamed')
		wrapper.unmount()
		expect(wrapper.vm.$EventBus.$off).toHaveBeenCalledWith(events.API_WIDGETS_CHANGED, handlers[events.API_WIDGETS_CHANGED])
	})
})

describe('the show switch of an API widget', () => {
	it('is what the saved choice says, and a widget the choice does not name is shown', async () => {
		stored = [builtIn[0], { name: `custom:${B}`, show: false }]
		const wrapper = await open()
		expect(toggle(wrapper, A).element.checked).toBe(true)
		expect(toggle(wrapper, B).element.checked).toBe(false)
		expect(setCustomStorage).not.toHaveBeenCalled()
	})

	it('names its widget for a screen reader', async () => {
		const wrapper = await open()
		expect(row(wrapper, A).find('label.switch').text()).toContain('Show My router')
	})

	it('writes only the show of its widget, in the choice as it is saved now, then says the widgets changed', async () => {
		const wrapper = await open()
		// the classic home moved a widget since the window was opened
		stored = [builtIn[1], { name: `custom:${A}`, show: true }, { name: `custom:${B}`, show: false }, builtIn[0]]
		let done
		setCustomStorage.mockImplementationOnce((key, data) => new Promise((resolve) => {
			done = () => {
				stored = data
				resolve({ data: { success: 200, data } })
			}
		}))
		await toggle(wrapper, A).setValue(false)
		await flushPromises()
		expect(setCustomStorage).toHaveBeenCalledTimes(1)
		expect(setCustomStorage.mock.calls[0][0]).toBe('widgets_config')
		expect(saved()).toEqual([builtIn[1], { name: `custom:${A}`, show: false }, { name: `custom:${B}`, show: false }, builtIn[0]])
		// not before the choice is saved: a home would read the old one. And no second change meanwhile
		expect(emitted).toEqual([])
		expect(toggle(wrapper, B).element.disabled).toBe(true)
		done()
		await flushPromises()
		expect(emitted).toEqual([[events.API_WIDGETS_CHANGED]])
		expect(toggle(wrapper, A).element.checked).toBe(false)
		expect(toggle(wrapper, B).element.disabled).toBe(false)
	})

	it('hears its own word on the bus of the dashboard: the list is read once more, and the switch is what was saved', async () => {
		const bus = createEventBus()
		const heard = vi.fn()
		bus.$on(events.API_WIDGETS_CHANGED, heard)
		const wrapper = await open(bus)
		expect(listWidgets).toHaveBeenCalledTimes(1)
		await toggle(wrapper, A).setValue(false)
		await flushPromises()
		expect(heard).toHaveBeenCalledTimes(1)
		expect(listWidgets).toHaveBeenCalledTimes(2)
		expect(setCustomStorage).toHaveBeenCalledTimes(1)
		expect(toggle(wrapper, A).element.checked).toBe(false)
		expect(toggle(wrapper, B).element.disabled).toBe(false)
		// a closed window hears nothing more
		wrapper.unmount()
		bus.$emit(events.API_WIDGETS_CHANGED)
		await flushPromises()
		expect(listWidgets).toHaveBeenCalledTimes(2)
	})

	it('adds its widget at the end of a choice that does not name it', async () => {
		stored = [...builtIn]
		const wrapper = await open()
		await toggle(wrapper, B).setValue(false)
		await flushPromises()
		expect(saved()).toEqual([...builtIn, { name: `custom:${B}`, show: false }])
	})

	it.each([
		['cannot be read', () => getCustomStorage.mockRejectedValue(new Error('network'))],
		['is not a list', () => getCustomStorage.mockResolvedValue({ status: 200, data: { data: 'x' } })],
		['cannot be saved', () => setCustomStorage.mockRejectedValue(new Error('network'))],
		['is refused', () => setCustomStorage.mockResolvedValue({ data: { success: 500 } })],
	])('says so and announces nothing when the saved choice %s, and goes back to what is saved', async (_, breakIt) => {
		const wrapper = await open()
		breakIt()
		await toggle(wrapper, A).setValue(false)
		await flushPromises()
		expect(emitted).toEqual([])
		expect(toast).toHaveBeenCalledTimes(1)
		expect(toast.mock.calls[0][0].message).toBe('The dashboard&#39;s settings could not be saved.')
		expect(toggle(wrapper, A).element.checked).toBe(true)
	})

	it('cannot be used while the saved choice could not be read, and the window says so', async () => {
		getCustomStorage.mockRejectedValue(new Error('network'))
		const wrapper = await open()
		expect(rows(wrapper)).toHaveLength(2)
		expect(toggle(wrapper, A).element.disabled).toBe(true)
		expect(wrapper.find('[data-widgets-config-unread]').exists()).toBe(true)
	})

	it('takes a choice that was never saved as an empty one', async () => {
		getCustomStorage.mockResolvedValue({ status: 200, data: '' })
		const wrapper = await open()
		expect(toggle(wrapper, A).element.checked).toBe(true)
		await toggle(wrapper, A).setValue(false)
		await flushPromises()
		expect(saved()).toEqual([{ name: `custom:${A}`, show: false }])
	})
})

describe('the deletion of an API widget', () => {
	const press = wrapper => row(wrapper, A).find('[data-widget-delete]').trigger('click')

	it('asks first, with the name written as text, and deletes nothing before the answer', async () => {
		listWidgets.mockResolvedValue({ widgets: [listed(A, '<img src=x>')] })
		const wrapper = await open()
		await press(wrapper)
		expect(confirm).toHaveBeenCalledTimes(1)
		expect(confirm.mock.calls[0][0].message).toBe('Delete the widget &lt;img src=x&gt;? Its card leaves the dashboard.')
		expect(deleteWidget).not.toHaveBeenCalled()
		expect(setCustomStorage).not.toHaveBeenCalled()
	})

	it('deletes the widget, takes its entry out of the choice as it is saved now, then says the widgets changed', async () => {
		const wrapper = await open()
		await press(wrapper)
		stored = [builtIn[1], { name: `custom:${A}`, show: true }, { name: `custom:${B}`, show: false }, builtIn[0]]
		const order = []
		deleteWidget.mockImplementation(async () => order.push('delete'))
		setCustomStorage.mockImplementation(async (key, data) => {
			order.push('save')
			return { data: { success: 200, data } }
		})
		confirm.mock.calls[0][0].onConfirm()
		await flushPromises()
		expect(deleteWidget).toHaveBeenCalledWith(A)
		expect(order).toEqual(['delete', 'save'])
		expect(saved()).toEqual([builtIn[1], { name: `custom:${B}`, show: false }, builtIn[0]])
		expect(emitted).toEqual([[events.API_WIDGETS_CHANGED]])
		expect(row(wrapper, A).exists()).toBe(false)
		expect(row(wrapper, B).exists()).toBe(true)
	})

	it.each([
		[refusal(500, 'the store <b>is</b> locked'), 'the store &lt;b&gt;is&lt;/b&gt; locked'],
		[refusal(0), 'The widget could not be deleted.'],
	])('says what the core says when it refuses, and changes nothing', async (error, sentence) => {
		const wrapper = await open()
		deleteWidget.mockRejectedValue(error)
		await press(wrapper)
		confirm.mock.calls[0][0].onConfirm()
		await flushPromises()
		expect(toast).toHaveBeenCalledTimes(1)
		expect(toast.mock.calls[0][0].message).toBe(sentence)
		expect(setCustomStorage).not.toHaveBeenCalled()
		expect(emitted).toEqual([])
		expect(row(wrapper, A).exists()).toBe(true)
	})

	it('still says the widgets changed when the widget is deleted and the choice could not be saved', async () => {
		const wrapper = await open()
		await press(wrapper)
		setCustomStorage.mockRejectedValue(new Error('network'))
		confirm.mock.calls[0][0].onConfirm()
		await flushPromises()
		expect(emitted).toEqual([[events.API_WIDGETS_CHANGED]])
		expect(row(wrapper, A).exists()).toBe(false)
	})
})

describe('what the API widgets window hands to the editor', () => {
	const many = count => ({ widgets: Array.from({ length: count }, (_, index) => listed(`widget${String(index).padStart(2, '0')}`, `Widget ${index}`)) })
	const file = (size, text = 'x') => new File([text.padEnd(size, ' ')], 'recipe.json', { type: 'application/json' })
	async function pick(wrapper, chosen) {
		const input = wrapper.find('[data-widgets-file]')
		Object.defineProperty(input.element, 'files', { value: [chosen], configurable: true })
		await input.trigger('change')
	}

	it('asks for the editor with the widget to edit, and with nothing for a new one', async () => {
		const wrapper = await open()
		await row(wrapper, B).find('[data-widget-edit]').trigger('click')
		await wrapper.find('[data-widgets-add]').trigger('click')
		expect(wrapper.emitted('edit')).toHaveLength(2)
		expect(wrapper.emitted('edit')[0][0]).toMatchObject({ id: B, base: `https://${B}.example.org`, recipe: { name: 'Solar' } })
		expect(wrapper.emitted('edit')[1]).toEqual([null])
	})

	it('asks for the export of a widget', async () => {
		const wrapper = await open()
		await row(wrapper, A).find('[data-widget-export]').trigger('click')
		expect(wrapper.emitted('export')).toHaveLength(1)
		expect(wrapper.emitted('export')[0][0]).toMatchObject({ id: A, recipe: { name: 'My router' } })
	})

	it('has real buttons, each naming its widget', async () => {
		const wrapper = await open()
		for (const [button, label] of [['edit', 'Edit My router'], ['export', 'Export My router'], ['delete', 'Delete My router']]) {
			const element = row(wrapper, A).find(`[data-widget-${button}]`).element
			expect(element.tagName).toBe('BUTTON')
			expect(element.getAttribute('aria-label')).toBe(label)
		}
		expect(wrapper.find('[data-widgets-add]').element.tagName).toBe('BUTTON')
		expect(wrapper.find('[data-widgets-import]').element.tagName).toBe('BUTTON')
	})

	it('offers to add and to import below 12 widgets, and at 12 says why it does not', async () => {
		listWidgets.mockResolvedValue(many(11))
		const below = await open()
		expect(below.find('[data-widgets-add]').attributes('disabled')).toBeUndefined()
		expect(below.find('[data-widgets-import]').attributes('disabled')).toBeUndefined()
		expect(below.find('[data-widgets-full]').exists()).toBe(false)

		listWidgets.mockResolvedValue(many(12))
		const full = await open()
		expect(full.find('[data-widgets-add]').attributes('disabled')).toBeDefined()
		expect(full.find('[data-widgets-import]').attributes('disabled')).toBeDefined()
		expect(full.find('[data-widgets-full]').text()).toBe('A box holds 12 widgets at most: delete one to add another.')
		await full.find('[data-widgets-add]').trigger('click')
		expect(full.emitted('edit')).toBeUndefined()
	})

	it('hands the text of a chosen recipe to the editor, up to 16 KiB', async () => {
		const wrapper = await open()
		// 16 KiB to the byte: the é takes two
		const recipe = file(16383, '{"name":"é"}')
		expect(recipe.size).toBe(16384)
		await pick(wrapper, recipe)
		await vi.waitFor(() => expect(wrapper.emitted('import')).toHaveLength(1))
		const text = wrapper.emitted('import')[0][0]
		expect(text.startsWith('{"name":"é"}')).toBe(true)
		expect(toast).not.toHaveBeenCalled()
		// the same file can be chosen again
		expect(wrapper.find('[data-widgets-file]').element.value).toBe('')
	})

	it('refuses a file over 16 KiB without reading it', async () => {
		const read = vi.spyOn(FileReader.prototype, 'readAsText')
		const wrapper = await open()
		await pick(wrapper, file(16385))
		await flushPromises()
		expect(read).not.toHaveBeenCalled()
		expect(wrapper.emitted('import')).toBeUndefined()
		expect(toast.mock.calls[0][0].message).toBe('This file is too large for a recipe: 16 KiB at most.')
		read.mockRestore()
	})
})

describe('the texts of the API widgets window', () => {
	it('are in the three languages, with what they name', async () => {
		const keys = [
			'API widgets',
			'Cards of the dashboard that the box fills by reading an address you choose.',
			'This box does not know the API widgets yet: update it.',
			'The widgets could not be loaded: {error}',
			'The widgets could not be loaded.',
			'The dashboard\'s settings could not be read: a widget cannot be shown or hidden for now.',
			'The dashboard\'s settings could not be saved.',
			'No widget yet. Add one, or import a recipe.',
			'Last read failed: {error}',
			'Show {name}',
			'Edit {name}',
			'Export {name}',
			'Delete {name}',
			'Export',
			'Add a widget',
			'Import a recipe',
			'A box holds 12 widgets at most: delete one to add another.',
			'Delete the widget {name}? Its card leaves the dashboard.',
			'The widget could not be deleted.',
			'This file is too large for a recipe: 16 KiB at most.',
			'The file could not be read.',
		]
		for (const key of keys) {
			expect(en[key], key).toBe(key)
			for (const lang of [fr, pt]) {
				expect(lang[key], key).toBeTruthy()
				expect(lang[key], key).not.toBe(key)
				for (const param of key.match(/\{\w+\}/g) || [])
					expect(lang[key], key).toContain(param)
			}
		}
		// the words the window shares with the rest of the dashboard
		for (const key of ['Show', 'Edit', 'Delete', 'Cancel', 'Close'])
			expect(en[key], key).toBe(key)
	})
})
