// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import ApiWidgetEditor from './ApiWidgetEditor.vue'
import { FORMAT_LABELS, LEVEL_LABELS, OP_LABELS } from './recipe'
import en from '@/assets/lang/en_US.json'
import fr from '@/assets/lang/fr_FR.json'
import pt from '@/assets/lang/pt_BR.json'
import events from '@/events/events'
import { createWidget, previewWidget, testWidget, updateWidget } from '@/service/apiWidgets'

vi.mock('@/service/apiWidgets', () => ({ createWidget: vi.fn(), updateWidget: vi.fn(), testWidget: vi.fn(), previewWidget: vi.fn() }))

const ID = 'ab12cd34'
const recipe = {
	recasaos_widget: 1,
	name: 'Immich',
	path: '/api/server/statistics',
	query: { limit: '5' },
	headers: { 'x-api-key': { input: 'api_key' }, 'Accept': 'application/json' },
	inputs: [{ id: 'api_key', label: 'API key' }],
	base_hint: 'http://IP:2283',
	layout: 'figures',
	rows: [{ label: 'Photos', value: '/photos', format: 'number' }],
	refresh: 3600,
}
const view = { id: ID, base: 'http://192.168.1.10:2283', insecure_tls: false, recipe, inputs_set: { api_key: true }, error: '' }
const answer = { photos: 12, videos: 3, note: '<script>alert(1)</script>', when: '2026-11-27T10:00:00Z', items: [{ name: 'one', state: 'up' }, { name: 'two', state: 'down' }] }
const card = { title: 'Immich', layout: 'figures', rows: [{ label: 'Photos', value: { kind: 'number', number: 12 } }], more: 0, refresh: 3600 }
const refusal = (status, message = '', secretsAgain = false) => Object.assign(new Error(message), { status, secretsAgain })

const CardStub = { name: 'ModuleCard', props: ['module', 'source'], render: () => h('div', { class: 'card-stub' }) }

let emitted
function open(props = {}) {
	return mount(ApiWidgetEditor, {
		props,
		global: {
			plugins: [Buefy],
			stubs: { ModuleCard: CardStub },
			mocks: {
				$t: (key, params) => (params ? key.replace(/\{(\w+)\}/g, (_, k) => params[k]) : key),
				$i18n: { locale: 'en_us' },
				$EventBus: { $emit: (...args) => emitted.push(args) },
			},
		},
	})
}

// a Buefy field puts what it is given on its wrapper or on its control
function control(wrapper, selector) {
	const found = wrapper.find(selector)
	return ['INPUT', 'SELECT', 'TEXTAREA'].includes(found.element.tagName) ? found : found.find('input, select, textarea')
}
const type = (wrapper, selector, value) => control(wrapper, selector).setValue(value)
const press = (wrapper, selector) => wrapper.find(selector).trigger('click')
const disabled = (wrapper, selector) => wrapper.find(selector).attributes('disabled') !== undefined
async function test(wrapper) {
	await press(wrapper, '[data-editor-test]')
	await flushPromises()
}
async function fresh() {
	const wrapper = open()
	await type(wrapper, '[data-editor-name]', 'Mine')
	await type(wrapper, '[data-editor-base]', 'http://192.168.1.10:8080')
	await type(wrapper, '[data-editor-path]', '/api')
	return wrapper
}
async function wait(ms) {
	vi.advanceTimersByTime(ms)
	await flushPromises()
}
const leaf = (wrapper, name) => wrapper.findAll('[data-json-leaf]').find(found => found.text().startsWith(`${name} `))
const rows = wrapper => wrapper.findAll('[data-row]')
const pairs = (wrapper, field) => wrapper.findAll(`[data-pairs="${field}"] [data-pair]`)

beforeEach(() => {
	// flushPromises keeps the real clock
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
	emitted = []
	for (const call of [createWidget, updateWidget, testWidget, previewWidget])
		call.mockReset()
	testWidget.mockResolvedValue({ response: answer, card })
	previewWidget.mockResolvedValue(card)
	createWidget.mockResolvedValue({ id: ID })
	updateWidget.mockResolvedValue({ id: ID })
})
afterEach(() => vi.useRealTimers())

describe('the test of an address', () => {
	it('needs a name, an address and a path, and asks the box once per press', async () => {
		const wrapper = open()
		expect(disabled(wrapper, '[data-editor-test]')).toBe(true)
		await type(wrapper, '[data-editor-name]', 'Mine')
		await type(wrapper, '[data-editor-base]', ' http://192.168.1.10:8080 ')
		expect(disabled(wrapper, '[data-editor-test]')).toBe(true)
		await type(wrapper, '[data-editor-path]', '/api/my files/été')
		expect(disabled(wrapper, '[data-editor-test]')).toBe(false)
		await test(wrapper)
		expect(testWidget).toHaveBeenCalledTimes(1)
		// a new widget has no id; the path leaves percent-encoded
		expect(testWidget.mock.calls[0]).toEqual([{
			base: 'http://192.168.1.10:8080',
			insecure_tls: false,
			recipe: { recasaos_widget: 1, name: 'Mine', path: '/api/my%20files/%C3%A9t%C3%A9', layout: 'rows', rows: [], refresh: 300 },
			secrets: {},
		}, undefined])
	})

	it('shows the answer as a tree of text, and the card the core made of it', async () => {
		const wrapper = await fresh()
		expect(wrapper.find('[data-editor-answer]').exists()).toBe(false)
		expect(wrapper.findComponent(CardStub).exists()).toBe(false)
		await test(wrapper)
		expect(leaf(wrapper, 'photos').text()).toBe('photos 12')
		expect(leaf(wrapper, 'note').text()).toBe('note "<script>alert(1)</script>"')
		expect(wrapper.find('script').exists()).toBe(false)
		const drawn = await wrapper.findComponent(CardStub).props('source').load()
		expect(drawn).toMatchObject({ title: 'Immich', layout: 'figures', rows: [{ label: 'Photos', value: '12' }] })
	})

	it.each([
		[refusal(400, 'refused: <b>localhost</b> is the box itself'), 'refused: <b>localhost</b> is the box itself'],
		[refusal(413, 'the body is too large'), 'The recipe or the answer is too large for the box.'],
		[refusal(0), 'The box did not answer.'],
		[refusal(500), 'The box refused, without saying why.'],
	])('says why it failed, as text, and shows no answer', async (error, sentence) => {
		const wrapper = await fresh()
		testWidget.mockRejectedValue(error)
		await test(wrapper)
		expect(wrapper.find('[data-editor-error]').text()).toBe(sentence)
		expect(wrapper.find('[data-editor-error] b').exists()).toBe(false)
		expect(wrapper.find('[data-editor-answer]').exists()).toBe(false)
		// nor a preview, whatever is changed next
		await type(wrapper, '[data-editor-name]', 'Other')
		await wait(600)
		expect(previewWidget).not.toHaveBeenCalled()
	})

	it('sends the certificate switch', async () => {
		const wrapper = await fresh()
		await control(wrapper, '[data-editor-insecure]').setValue(true)
		await test(wrapper)
		expect(testWidget.mock.calls[0][0].insecure_tls).toBe(true)
	})
})

describe('the preview', () => {
	it('does not start before a first test that worked', async () => {
		const wrapper = open({ widget: view })
		await type(wrapper, '[data-row-label]', 'Pictures')
		await wait(600)
		expect(previewWidget).not.toHaveBeenCalled()
		expect(testWidget).not.toHaveBeenCalled()
	})

	it('evaluates again the answer it has, 500 ms after the last change, and never reads the address', async () => {
		const wrapper = open({ widget: view })
		await test(wrapper)
		expect(testWidget).toHaveBeenCalledTimes(1)
		for (let n = 0; n < 10; n++) {
			await type(wrapper, '[data-row-label]', `Pictures ${n}`)
			await wait(100)
		}
		expect(previewWidget).not.toHaveBeenCalled()
		await wait(400)
		expect(testWidget).toHaveBeenCalledTimes(1)
		expect(previewWidget).toHaveBeenCalledTimes(1)
		const [sent, response] = previewWidget.mock.calls[0]
		expect(sent.rows[0].label).toBe('Pictures 9')
		expect(response).toEqual(answer)
	})

	it('draws the card of the last evaluation', async () => {
		const wrapper = open({ widget: view })
		await test(wrapper)
		previewWidget.mockResolvedValue({ ...card, rows: [{ label: 'Pictures', value: { kind: 'number', number: 12 } }] })
		await type(wrapper, '[data-row-label]', 'Pictures')
		await wait(500)
		expect((await wrapper.findComponent(CardStub).props('source').load()).rows[0].label).toBe('Pictures')
	})

	it('says what the core refuses of the rows, as text, beside the card', async () => {
		const wrapper = open({ widget: view })
		await test(wrapper)
		previewWidget.mockRejectedValue(refusal(400, 'invalid widget: rows[0].label must be 1 to 40 characters'))
		await type(wrapper, '[data-row-label]', '')
		await wait(500)
		expect(wrapper.find('[data-editor-preview-error]').text()).toBe('invalid widget: rows[0].label must be 1 to 40 characters')
	})

	it.each([
		['the address', wrapper => type(wrapper, '[data-editor-base]', 'http://192.168.1.11:2283')],
		['the path', wrapper => type(wrapper, '[data-editor-path]', '/api/other')],
		['the certificate switch', wrapper => control(wrapper, '[data-editor-insecure]').setValue(true)],
		['a parameter', wrapper => type(pairs(wrapper, 'query')[0], '[data-pair-value]', '6')],
		['a header', wrapper => type(pairs(wrapper, 'headers')[1], '[data-pair-value]', 'text/plain')],
		['basic', wrapper => control(wrapper, '[data-editor-basic]').setValue(true)],
	])('is greyed, with "Test again", once %s changes, and evaluates nothing until then', async (_, change) => {
		const wrapper = open({ widget: view })
		await test(wrapper)
		expect(wrapper.find('[data-editor-stale]').exists()).toBe(false)
		await change(wrapper)
		await type(wrapper, '[data-row-label]', 'Pictures')
		await wait(600)
		expect(wrapper.find('[data-editor-stale]').text()).toBe('Test again')
		expect(wrapper.find('[data-editor-preview]').classes()).toContain('is-stale')
		expect(previewWidget).not.toHaveBeenCalled()
		expect(testWidget).toHaveBeenCalledTimes(1)
	})

	it('is greyed once a secret is typed again: the answer was read with another one', async () => {
		const wrapper = open({ widget: view })
		await test(wrapper)
		await type(pairs(wrapper, 'headers')[0], '[data-pair-value]', 'another-key')
		await type(wrapper, '[data-row-label]', 'Pictures')
		await wait(600)
		expect(wrapper.find('[data-editor-stale]').text()).toBe('Test again')
		expect(wrapper.find('[data-editor-preview]').classes()).toContain('is-stale')
		expect(previewWidget).not.toHaveBeenCalled()
		// as it was at the test: the answer holds again
		await type(pairs(wrapper, 'headers')[0], '[data-pair-value]', '')
		expect(wrapper.find('[data-editor-stale]').exists()).toBe(false)
	})

	it('asks nothing once the window is closed', async () => {
		const wrapper = open({ widget: view })
		await test(wrapper)
		await type(wrapper, '[data-row-label]', 'Pictures')
		wrapper.unmount()
		await wait(600)
		expect(previewWidget).not.toHaveBeenCalled()
	})
})

describe('a click on the answer', () => {
	it('adds a simple row for a value, with its pointer and a guessed format', async () => {
		const wrapper = await fresh()
		await test(wrapper)
		await leaf(wrapper, 'photos').trigger('click')
		await leaf(wrapper, 'when').trigger('click')
		await leaf(wrapper, 'note').trigger('click')
		expect(rows(wrapper)).toHaveLength(3)
		await press(wrapper, '[data-editor-save]')
		expect(createWidget.mock.calls[0][0].recipe.rows).toEqual([
			{ label: 'photos', value: '/photos', format: 'number' },
			{ label: 'when', value: '/when', format: 'date' },
			{ label: 'note', value: '/note', format: 'text' },
		])
	})

	it('counts an array', async () => {
		const wrapper = await fresh()
		await test(wrapper)
		await press(wrapper, '[data-json-count]')
		await press(wrapper, '[data-editor-save]')
		expect(createWidget.mock.calls[0][0].recipe.rows).toEqual([{ label: 'items', value: '/items', format: 'count' }])
	})

	it('makes one row per item: the array, then the label and the value clicked inside an item, as pointers from the item', async () => {
		const wrapper = await fresh()
		await test(wrapper)
		await press(wrapper, '[data-json-each]')
		expect(wrapper.find('[data-editor-picking]').exists()).toBe(true)
		// a value outside the list is not taken
		await leaf(wrapper, 'photos').trigger('click')
		expect(rows(wrapper)).toHaveLength(1)
		// the items are at the third level: the first one is opened
		await wrapper.findAll('[data-editor-answer] [data-json-toggle]').find(toggle => toggle.find('.json-key').text() === '0').trigger('click')
		await leaf(wrapper, 'name').trigger('click')
		await leaf(wrapper, 'state').trigger('click')
		expect(wrapper.find('[data-editor-picking]').exists()).toBe(false)
		await press(wrapper, '[data-editor-save]')
		expect(createWidget.mock.calls[0][0].recipe.rows).toEqual([{ each: '/items', label: '/name', value: '/state', format: 'text', limit: 5 }])
	})

	it('takes the root itself when it is an array: each is "", and it is sent', async () => {
		testWidget.mockResolvedValue({ response: [{ name: 'one' }, { name: 'two' }], card })
		const wrapper = await fresh()
		await test(wrapper)
		await press(wrapper, '[data-json-each]')
		await leaf(wrapper, 'name').trigger('click')
		await leaf(wrapper, 'name').trigger('click')
		await press(wrapper, '[data-editor-save]')
		const [row] = createWidget.mock.calls[0][0].recipe.rows
		expect(row).toEqual({ each: '', label: '/name', value: '/name', format: 'text', limit: 5 })
		expect(JSON.stringify(row)).toContain('"each":""')
	})

	it('adds no row beyond what the layout holds, and says so', async () => {
		const wrapper = open({ widget: { ...view, recipe: { ...recipe, rows: Array.from({ length: 4 }, (_, n) => ({ label: `r${n}`, value: '/photos', format: 'number' })) } } })
		await test(wrapper)
		await leaf(wrapper, 'photos').trigger('click')
		expect(rows(wrapper)).toHaveLength(4)
		expect(wrapper.find('[data-editor-note]').text()).toBe('This layout holds 4 rows at most.')
		expect(disabled(wrapper, '[data-row-add]')).toBe(true)
	})
})

describe('the settings of a row', () => {
	it('offers a unit for a text and a number only', async () => {
		const wrapper = open({ widget: view })
		expect(wrapper.find('[data-row-unit]').exists()).toBe(true)
		await type(wrapper, '[data-row-format]', 'bytes')
		expect(wrapper.find('[data-row-unit]').exists()).toBe(false)
		await type(wrapper, '[data-row-format]', 'text')
		expect(wrapper.find('[data-row-unit]').exists()).toBe(true)
	})

	it('offers a bar for a share only, and three rules at most', async () => {
		const wrapper = open({ widget: view })
		expect(wrapper.find('[data-row-bar]').exists()).toBe(false)
		await type(wrapper, '[data-row-format]', 'percent')
		await control(wrapper, '[data-row-bar]').setValue(true)
		for (let n = 0; n < 3; n++)
			await press(wrapper, '[data-rule-add]')
		expect(disabled(wrapper, '[data-rule-add]')).toBe(true)
		await type(wrapper, '[data-rule-op]', 'gt')
		await type(wrapper, '[data-rule-to]', '90')
		await type(wrapper, '[data-rule-level]', 'danger')
		await type(wrapper, '[data-rule-text]', 'FULL')
		await wrapper.findAll('[data-rule-remove]')[2].trigger('click')
		await wrapper.findAll('[data-rule-remove]')[1].trigger('click')
		await press(wrapper, '[data-editor-save]')
		expect(updateWidget.mock.calls[0][1].recipe.rows).toEqual([{ label: 'Photos', value: '/photos', format: 'percent', bar: true, rules: [{ op: 'gt', to: 90, level: 'danger', text: 'FULL' }] }])
	})

	it('adds a row by hand, removes one, and fills the status chip from a click', async () => {
		const wrapper = open({ widget: view })
		await test(wrapper)
		await press(wrapper, '[data-row-add]')
		expect(rows(wrapper)).toHaveLength(2)
		await rows(wrapper)[0].find('[data-row-remove]').trigger('click')
		expect(rows(wrapper)).toHaveLength(1)
		await control(wrapper, '[data-editor-status]').setValue(true)
		await press(wrapper, '[data-status-pick]')
		await leaf(wrapper, 'videos').trigger('click')
		expect(rows(wrapper)).toHaveLength(1)
		await press(wrapper, '[data-editor-save]')
		expect(updateWidget.mock.calls[0][1].recipe.status).toEqual({ value: '/videos', format: 'number' })
	})
})

describe('a secret', () => {
	it('is a header or a parameter marked so: typed in a password field, sent apart, never in the recipe', async () => {
		const wrapper = await fresh()
		await press(wrapper, '[data-pairs="headers"] [data-pair-add]')
		const [header] = pairs(wrapper, 'headers')
		await type(header, '[data-pair-name]', 'X-Thing')
		expect(control(header, '[data-pair-value]').attributes('type')).toBe('text')
		await control(header, '[data-pair-secret]').setValue(true)
		expect(control(header, '[data-pair-value]').attributes('type')).toBe('password')
		expect(disabled(wrapper, '[data-editor-test]')).toBe(true)
		await type(header, '[data-pair-value]', 'typed-secret')
		await test(wrapper)
		const [change] = testWidget.mock.calls[0]
		expect(change.recipe.headers).toEqual({ 'X-Thing': { input: 'x_thing' } })
		expect(change.recipe.inputs).toEqual([{ id: 'x_thing', label: 'X-Thing' }])
		expect(change.secrets).toEqual({ x_thing: 'typed-secret' })
		expect(JSON.stringify(change.recipe)).not.toContain('typed-secret')
	})

	it('is forced for a name the core refuses as a fixed text', async () => {
		const wrapper = await fresh()
		await press(wrapper, '[data-pairs="query"] [data-pair-add]')
		const [parameter] = pairs(wrapper, 'query')
		await type(parameter, '[data-pair-name]', 'apikey')
		const box = control(parameter, '[data-pair-secret]')
		expect(box.element.checked).toBe(true)
		expect(box.attributes('disabled')).toBeDefined()
		expect(control(parameter, '[data-pair-value]').attributes('type')).toBe('password')
	})

	it('stays one when its name becomes a harmless one: what was typed never turns into a fixed text', async () => {
		const wrapper = await fresh()
		await press(wrapper, '[data-pairs="query"] [data-pair-add]')
		const [parameter] = pairs(wrapper, 'query')
		await type(parameter, '[data-pair-name]', 'apikey')
		await type(parameter, '[data-pair-value]', 'typed-secret')
		await type(parameter, '[data-pair-name]', 'limit')
		expect(control(parameter, '[data-pair-value]').attributes('type')).toBe('password')
		expect(control(parameter, '[data-pair-secret]').element.checked).toBe(true)
		await test(wrapper)
		const [change] = testWidget.mock.calls[0]
		expect(change.recipe.query).toEqual({ limit: { input: 'limit' } })
		expect(JSON.stringify(change.recipe)).not.toContain('typed-secret')
		expect(change.secrets).toEqual({ limit: 'typed-secret' })
	})

	it('is forgotten when its box is unticked: what was typed does not become a fixed text', async () => {
		const wrapper = await fresh()
		await press(wrapper, '[data-pairs="headers"] [data-pair-add]')
		const [header] = pairs(wrapper, 'headers')
		await type(header, '[data-pair-name]', 'X-Thing')
		await control(header, '[data-pair-secret]').setValue(true)
		await type(header, '[data-pair-value]', 'typed-secret')
		await control(header, '[data-pair-secret]').setValue(false)
		expect(control(header, '[data-pair-value]').element.value).toBe('')
	})

	it('of basic is its password, always; its user may be one', async () => {
		const wrapper = await fresh()
		await control(wrapper, '[data-editor-basic]').setValue(true)
		expect(control(wrapper, '[data-basic-password]').attributes('type')).toBe('password')
		await type(wrapper, '[data-basic-user]', 'admin')
		await type(wrapper, '[data-basic-password]', 'pw')
		await test(wrapper)
		const [change] = testWidget.mock.calls[0]
		expect(change.recipe.basic).toEqual({ user: 'admin', password: { input: 'basic_password' } })
		expect(change.secrets).toEqual({ basic_password: 'pw' })
	})
})

describe('the change of a widget', () => {
	const secret = wrapper => control(pairs(wrapper, 'headers')[0], '[data-pair-value]')

	it('shows the widget, and never a secret: the field is empty and says that one is saved', () => {
		const wrapper = open({ widget: view })
		expect(control(wrapper, '[data-editor-base]').element.value).toBe('http://192.168.1.10:2283')
		expect(secret(wrapper).element.value).toBe('')
		expect(secret(wrapper).attributes('type')).toBe('password')
		expect(secret(wrapper).attributes('placeholder')).toBe('saved — leave empty to keep')
		expect(wrapper.find('[data-editor-secrets-again]').exists()).toBe(false)
		expect(disabled(wrapper, '[data-editor-save]')).toBe(false)
	})

	it('does not ask for the secrets again after a change of a label: the request leaves as it was saved, with the id of the widget', async () => {
		const wrapper = open({ widget: view })
		await type(wrapper, '[data-row-label]', 'Pictures')
		await type(wrapper, '[data-editor-name]', 'My photos')
		expect(wrapper.find('[data-editor-secrets-again]').exists()).toBe(false)
		await test(wrapper)
		expect(testWidget.mock.calls[0][1]).toBe(ID)
		await press(wrapper, '[data-editor-save]')
		await flushPromises()
		expect(createWidget).not.toHaveBeenCalled()
		const [id, change] = updateWidget.mock.calls[0]
		expect(id).toBe(ID)
		expect(change).toEqual({
			base: view.base,
			insecure_tls: false,
			recipe: { ...recipe, name: 'My photos', rows: [{ label: 'Pictures', value: '/photos', format: 'number' }] },
			secrets: {},
		})
		expect(Object.keys(change.recipe.headers)).toEqual(Object.keys(recipe.headers))
	})

	it.each([
		['the address', wrapper => type(wrapper, '[data-editor-base]', 'http://192.168.1.11:2283')],
		['the path', wrapper => type(wrapper, '[data-editor-path]', '/api/other')],
		['the certificate switch', wrapper => control(wrapper, '[data-editor-insecure]').setValue(true)],
		['a parameter', wrapper => type(pairs(wrapper, 'query')[0], '[data-pair-value]', '6')],
		['a header', wrapper => type(pairs(wrapper, 'headers')[1], '[data-pair-name]', 'X-Accept')],
	])('asks for every secret again once %s changes, and says why', async (_, change) => {
		const wrapper = open({ widget: view })
		await change(wrapper)
		expect(wrapper.find('[data-editor-secrets-again]').exists()).toBe(true)
		expect(secret(wrapper).attributes('placeholder')).not.toContain('saved')
		expect(disabled(wrapper, '[data-editor-save]')).toBe(true)
		expect(disabled(wrapper, '[data-editor-test]')).toBe(true)
		await secret(wrapper).setValue('new-key')
		expect(disabled(wrapper, '[data-editor-save]')).toBe(false)
		await press(wrapper, '[data-editor-save]')
		expect(updateWidget.mock.calls[0][1].secrets).toEqual({ api_key: 'new-key' })
	})

	it('asks for every secret again when the core says so', async () => {
		const wrapper = open({ widget: view })
		updateWidget.mockRejectedValue(refusal(400, 'invalid widget: the address or the request changed, every input must be filled again', true))
		await press(wrapper, '[data-editor-save]')
		await flushPromises()
		expect(wrapper.find('[data-editor-error]').text()).toContain('every input must be filled again')
		expect(wrapper.find('[data-editor-secrets-again]').exists()).toBe(true)
		expect(secret(wrapper).attributes('placeholder')).not.toContain('saved')
		expect(disabled(wrapper, '[data-editor-save]')).toBe(true)
		expect(emitted).toEqual([])
		expect(wrapper.emitted('close')).toBeUndefined()
	})

	it('closes and says the widgets changed once saved, and not before', async () => {
		const wrapper = open({ widget: view })
		let done
		updateWidget.mockReturnValue(new Promise(resolve => done = resolve))
		await press(wrapper, '[data-editor-save]')
		expect(wrapper.emitted('close')).toBeUndefined()
		expect(emitted).toEqual([])
		done({ id: ID })
		await flushPromises()
		expect(emitted).toEqual([[events.API_WIDGETS_CHANGED]])
		expect(wrapper.emitted('close')).toHaveLength(1)
	})

	it.each([
		[refusal(400, 'invalid widget: refresh must be 60 to 3600 seconds'), 'invalid widget: refresh must be 60 to 3600 seconds'],
		[refusal(413), 'The recipe or the answer is too large for the box.'],
	])('stays open and says what the core refuses', async (error, sentence) => {
		const wrapper = open({ widget: view })
		updateWidget.mockRejectedValue(error)
		await press(wrapper, '[data-editor-save]')
		await flushPromises()
		expect(wrapper.find('[data-editor-error]').text()).toBe(sentence)
		expect(wrapper.emitted('close')).toBeUndefined()
		expect(emitted).toEqual([])
	})

	it('needs a row to be saved', async () => {
		const wrapper = open({ widget: view })
		await press(wrapper, '[data-row-remove]')
		expect(disabled(wrapper, '[data-editor-save]')).toBe(true)
	})
})

describe('a whole address typed in the field of the base', () => {
	it('is split when the field is left: the path and the parameters go to their fields, a key as a secret', async () => {
		const wrapper = open()
		await type(wrapper, '[data-editor-base]', 'https://nas.lan:8443/api/v1/stats?limit=5&apikey=abc')
		await control(wrapper, '[data-editor-base]').trigger('blur')
		expect(control(wrapper, '[data-editor-base]').element.value).toBe('https://nas.lan:8443')
		expect(control(wrapper, '[data-editor-path]').element.value).toBe('/api/v1/stats')
		const [limit, key] = pairs(wrapper, 'query')
		expect([control(limit, '[data-pair-name]').element.value, control(limit, '[data-pair-value]').element.value]).toEqual(['limit', '5'])
		expect(control(key, '[data-pair-name]').element.value).toBe('apikey')
		expect(control(key, '[data-pair-value]').attributes('type')).toBe('password')
		// and it stays one whatever its name becomes
		await type(key, '[data-pair-name]', 'k')
		expect(control(key, '[data-pair-value]').attributes('type')).toBe('password')
	})

	it.each([
		['of a saved widget', () => open({ widget: view })],
		['of an imported recipe', () => open({ recipe })],
	])('never replaces the path %s: the address stays as it is typed, the core takes the start of a path in it', async (_, mounted) => {
		const wrapper = mounted()
		await type(wrapper, '[data-editor-base]', 'http://192.168.1.50:2283/immich?limit=9')
		await control(wrapper, '[data-editor-base]').trigger('blur')
		expect(control(wrapper, '[data-editor-base]').element.value).toBe('http://192.168.1.50:2283/immich?limit=9')
		expect(control(wrapper, '[data-editor-path]').element.value).toBe('/api/server/statistics')
		expect(pairs(wrapper, 'query')).toHaveLength(1)
		expect(control(pairs(wrapper, 'query')[0], '[data-pair-value]').element.value).toBe('5')
	})

	it('never replaces a path typed first on a new widget', async () => {
		const wrapper = open()
		await type(wrapper, '[data-editor-path]', '/mine')
		await type(wrapper, '[data-editor-base]', 'http://192.168.1.50/api/v1')
		await control(wrapper, '[data-editor-base]').trigger('blur')
		expect(control(wrapper, '[data-editor-path]').element.value).toBe('/mine')
		expect(control(wrapper, '[data-editor-base]').element.value).toBe('http://192.168.1.50/api/v1')
	})

	it('adds the parameters of the address and replaces none', async () => {
		const wrapper = open()
		await press(wrapper, '[data-pairs="query"] [data-pair-add]')
		await type(pairs(wrapper, 'query')[0], '[data-pair-name]', 'limit')
		await type(pairs(wrapper, 'query')[0], '[data-pair-value]', '5')
		await type(wrapper, '[data-editor-base]', 'http://192.168.1.50/api?limit=9&page=2')
		await control(wrapper, '[data-editor-base]').trigger('blur')
		expect(pairs(wrapper, 'query').map(pair => control(pair, '[data-pair-value]').element.value)).toEqual(['5', '2'])
	})

	it('is left alone when it was not typed here: a saved base may hold the start of a path', async () => {
		const wrapper = open({ widget: { ...view, base: 'http://192.168.1.10/immich' } })
		await control(wrapper, '[data-editor-base]').trigger('blur')
		expect(control(wrapper, '[data-editor-base]').element.value).toBe('http://192.168.1.10/immich')
		expect(wrapper.find('[data-editor-secrets-again]').exists()).toBe(false)
	})

	it('takes the query typed with the path, too', async () => {
		const wrapper = open()
		await type(wrapper, '[data-editor-path]', '/api/x?limit=5')
		await control(wrapper, '[data-editor-path]').trigger('blur')
		expect(control(wrapper, '[data-editor-path]').element.value).toBe('/api/x')
		expect(pairs(wrapper, 'query')).toHaveLength(1)
	})
})

describe('the import of a recipe', () => {
	it('opens with no address and no secret, the hint as a placeholder, and says what will be sent before any test', async () => {
		const wrapper = open({ recipe })
		const base = control(wrapper, '[data-editor-base]')
		expect(base.element.value).toBe('')
		expect(base.attributes('placeholder')).toBe('http://IP:2283')
		const secret = control(pairs(wrapper, 'headers')[0], '[data-pair-value]')
		expect(secret.element.value).toBe('')
		expect(secret.attributes('placeholder') ?? '').not.toContain('saved')
		const sent = wrapper.find('[data-editor-sent]').text()
		for (const part of ['/api/server/statistics', 'headers.x-api-key', 'headers.Accept', 'application/json', 'query.limit', '5'])
			expect(sent).toContain(part)
		await wait(600)
		for (const call of [testWidget, previewWidget, createWidget, updateWidget])
			expect(call).not.toHaveBeenCalled()
		expect(disabled(wrapper, '[data-editor-test]')).toBe(true)
		expect(disabled(wrapper, '[data-editor-save]')).toBe(true)
	})

	it('writes what a recipe says as text', () => {
		const wrapper = open({ recipe: { ...recipe, name: '<img src=x>', headers: { 'X-A': '<b>bold</b>' }, rows: [{ label: '<i>x</i>', value: '/a' }] } })
		expect(wrapper.find('img, b, i').exists()).toBe(false)
		expect(wrapper.find('[data-editor-sent]').text()).toContain('<b>bold</b>')
	})

	it('takes no secret from the file: a fixed text under a secret name is left out, asked for, and stays a secret under another name', async () => {
		const unsafe = { ...recipe, headers: { 'X-Api-Key': 'file-text' }, query: { token: 'file-text' }, basic: { user: 'admin', password: 'file-text' }, inputs: undefined }
		const wrapper = open({ recipe: unsafe })
		const [header] = pairs(wrapper, 'headers')
		const [parameter] = pairs(wrapper, 'query')
		for (const field of [control(header, '[data-pair-value]'), control(parameter, '[data-pair-value]'), control(wrapper, '[data-basic-password]')]) {
			expect(field.element.value).toBe('')
			expect(field.attributes('type')).toBe('password')
		}
		expect(wrapper.html()).not.toContain('file-text')
		await type(wrapper, '[data-editor-base]', 'http://192.168.1.10:2283')
		expect(disabled(wrapper, '[data-editor-test]')).toBe(true)
		await type(header, '[data-pair-value]', 'real-key')
		await type(parameter, '[data-pair-value]', 'real-token')
		await type(wrapper, '[data-basic-password]', 'real-pass')
		await type(header, '[data-pair-name]', 'X-Api-Ke')
		expect(control(header, '[data-pair-value]').attributes('type')).toBe('password')
		await test(wrapper)
		const [change] = testWidget.mock.calls[0]
		expect(change.recipe.headers).toEqual({ 'X-Api-Ke': { input: 'x_api_ke' } })
		expect(change.recipe.query).toEqual({ token: { input: 'token' } })
		expect(change.recipe.basic).toEqual({ user: 'admin', password: { input: 'basic_password' } })
		expect(JSON.stringify(change.recipe)).not.toMatch(/file-text|real-/)
		expect(change.secrets).toEqual({ x_api_ke: 'real-key', token: 'real-token', basic_password: 'real-pass' })
	})

	it('always makes a new widget, tested without an id', async () => {
		const wrapper = open({ recipe })
		await type(wrapper, '[data-editor-base]', 'http://192.168.1.10:2283')
		await type(pairs(wrapper, 'headers')[0], '[data-pair-value]', 'my-key')
		await test(wrapper)
		expect(testWidget.mock.calls[0][1]).toBeUndefined()
		await press(wrapper, '[data-editor-save]')
		await flushPromises()
		expect(updateWidget).not.toHaveBeenCalled()
		expect(createWidget).toHaveBeenCalledWith({ base: 'http://192.168.1.10:2283', insecure_tls: false, recipe, secrets: { api_key: 'my-key' } })
		expect(emitted).toEqual([[events.API_WIDGETS_CHANGED]])
	})

	it('has no summary for a widget made or changed here', () => {
		expect(open().find('[data-editor-sent]').exists()).toBe(false)
		expect(open({ widget: view }).find('[data-editor-sent]').exists()).toBe(false)
	})
})

describe('the fields of the editor', () => {
	it('have each a name for a screen reader', () => {
		const wrapper = open({ widget: { ...view, recipe: { ...recipe, basic: { user: 'a', password: { input: 'api_key' } }, status: { value: '/a' }, rows: [{ each: '/items', label: '/name', value: '/state', limit: 3, rules: [{ op: 'eq', to: 'up', level: 'ok' }] }] } } })
		const fields = wrapper.findAll('input, select')
		expect(fields.length).toBeGreaterThan(20)
		for (const field of fields) {
			const named = field.attributes('aria-label') || field.element.closest('label')?.textContent.trim()
			expect(named, field.html()).toBeTruthy()
		}
		for (const button of wrapper.findAll('button'))
			expect(button.text() || button.attributes('aria-label'), button.html()).toBeTruthy()
	})
})

describe('the texts of the editor', () => {
	it('are in the three languages', () => {
		const here = name => readFileSync(new URL(name, import.meta.url), 'utf8')
		const sources = ['ApiWidgetEditor.vue', 'ApiWidgetRow.vue', 'JsonTree.vue', 'recipe.js', 'share.js'].map(here).join('\n')
		// the names of the formats, of the comparisons and of the levels
		const keys = new Set([...Object.values(FORMAT_LABELS), ...Object.values(OP_LABELS), ...Object.values(LEVEL_LABELS)])
		// what is said through $t, and the sentences recipe.js throws
		for (const [, , key] of sources.matchAll(/(?:\$t\(|new Error\()(['"])((?:\\.|(?!\1).)+)\1/g))
			keys.add(key.replace(/\\'/g, '\''))
		expect(keys.size).toBeGreaterThan(60)
		for (const key of keys) {
			expect(en[key], key).toBe(key)
			expect(fr[key], key).toBeTruthy()
			expect(pt[key], key).toBeTruthy()
		}
	})
})
