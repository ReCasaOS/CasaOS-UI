// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportWidget, readImport } from './share'

const recipe = {
	recasaos_widget: 1,
	name: 'My <b>NAS</b>',
	path: '/api',
	query: { limit: '5' },
	headers: { 'x-api-key': { input: 'api_key' }, 'X-Note': '<img src=x onerror=alert(1)>' },
	inputs: [{ id: 'api_key', label: 'API key' }],
	base_hint: 'http://IP:2283',
	layout: 'rows',
	rows: [{ label: 'a', value: '/a', format: 'text' }],
	refresh: 300,
}
const widget = { id: 'ab12cd34', base: 'http://192.168.1.10:2283', insecure_tls: true, recipe, inputs_set: { api_key: true }, error: '' }

let vm
let blobs
let clicked
beforeEach(() => {
	vm = {
		$t: (key, params) => (params ? key.replace(/\{(\w+)\}/g, (_, k) => params[k]) : key),
		$buefy: { toast: { open: vi.fn() }, dialog: { confirm: vi.fn() } },
	}
	blobs = []
	clicked = []
	vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
		blobs.push(blob)
		return 'blob:recipe'
	})
	vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
	vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
		clicked.push({ href: this.href, download: this.download })
	})
})
afterEach(() => vi.restoreAllMocks())

describe('the export of a widget', () => {
	it('shows the fixed texts of the recipe, as text, before anything is downloaded', () => {
		exportWidget(vm, widget)
		expect(vm.$buefy.dialog.confirm).toHaveBeenCalledTimes(1)
		const { message } = vm.$buefy.dialog.confirm.mock.calls[0][0]
		expect(message).toContain('query.limit: 5')
		expect(message).toContain('base_hint: http://IP:2283')
		expect(message).toContain('headers.X-Note: &lt;img src=x onerror=alert(1)&gt;')
		expect(message).toContain('My &lt;b&gt;NAS&lt;/b&gt;')
		expect(message.replace(/<br>/g, '')).not.toContain('<')
		// a secret is not a fixed text: its place is not even listed
		expect(message).not.toContain('x-api-key')
		expect(clicked).toEqual([])
		expect(blobs).toEqual([])
	})

	it('downloads the recipe alone, in a file named after the widget, once confirmed', async () => {
		exportWidget(vm, widget)
		vm.$buefy.dialog.confirm.mock.calls[0][0].onConfirm()
		expect(clicked).toEqual([{ href: 'blob:recipe', download: 'my-b-nas-b.recasaos-widget.json' }])
		expect(blobs[0].type).toBe('application/json')
		const text = await blobs[0].text()
		expect(JSON.parse(text)).toEqual(recipe)
		expect(text).not.toMatch(/192\.168|insecure_tls|inputs_set|ab12cd34/)
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:recipe')
	})

	it('says so when the recipe holds no fixed text', () => {
		exportWidget(vm, { ...widget, recipe: { ...recipe, query: {}, headers: {}, base_hint: '' } })
		expect(vm.$buefy.dialog.confirm.mock.calls[0][0].message).toContain('It holds no fixed text.')
	})
})

describe('the reading of an imported file', () => {
	it('gives the recipe', () => {
		expect(readImport(vm, JSON.stringify(recipe))).toEqual(recipe)
		expect(vm.$buefy.toast.open).not.toHaveBeenCalled()
	})

	it.each([
		['{ not json', 'This file is not JSON.'],
		['{"recasaos_widget":2}', 'This file is not the recipe of an API widget.'],
	])('says why a file is not taken, and gives nothing', (text, sentence) => {
		expect(readImport(vm, text)).toBeNull()
		expect(vm.$buefy.toast.open.mock.calls[0][0]).toMatchObject({ message: sentence, type: 'is-danger' })
	})
})
