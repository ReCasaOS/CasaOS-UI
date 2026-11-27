// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWidget, deleteWidget, listWidgets, previewWidget, testWidget, updateWidget, widgetCard } from './apiWidgets.js'
import { instance } from './service.js'

vi.mock('@/router', () => ({ default: { replace() {} } }))
vi.mock('@/store', () => ({ default: { commit() {} } }))

// A fake adapter sees the request as XHR would. Not a vi.fn: a mock that answers a rejected promise fails the test on its own.
const calls = []
let reply
instance.defaults.adapter = (config) => {
	calls.push(config)
	return reply(config)
}

const answers = data => reply = config => Promise.resolve({ data: { success: 200, message: 'ok', data }, status: 200, statusText: 'OK', headers: {}, config })
function refuses(status, data) {
	reply = (config) => {
		const error = new Error(`Request failed with status code ${status}`)
		error.config = config
		error.response = { status, data, headers: {}, config }
		return Promise.reject(error)
	}
}
const sent = () => calls.at(-1)
const ID = 'ab12cd34'
const change = { base: 'http://192.168.1.10:2283', insecure_tls: false, recipe: { name: 'Immich' }, secrets: { api_key: 'k' } }

describe('the client of the API widgets', () => {
	beforeEach(() => calls.splice(0))

	it('reads the list', async () => {
		answers({ widgets: [{ id: ID }] })
		expect(await listWidgets()).toEqual({ widgets: [{ id: ID }] })
		expect([sent().method, sent().url]).toEqual(['get', '/v1/sys/widgets'])
	})

	it('creates, changes and removes a widget', async () => {
		answers({ id: ID })
		expect(await createWidget(change)).toEqual({ id: ID })
		expect([sent().method, sent().url, JSON.parse(sent().data)]).toEqual(['post', '/v1/sys/widgets', change])

		expect(await updateWidget(ID, change)).toEqual({ id: ID })
		expect([sent().method, sent().url, JSON.parse(sent().data)]).toEqual(['put', `/v1/sys/widgets/${ID}`, change])

		await deleteWidget(ID)
		expect([sent().method, sent().url]).toEqual(['delete', `/v1/sys/widgets/${ID}`])
	})

	it('reads the card of a widget', async () => {
		answers({ title: 'Immich', rows: [] })
		expect(await widgetCard(ID)).toEqual({ title: 'Immich', rows: [] })
		expect([sent().method, sent().url]).toEqual(['get', `/v1/sys/widgets/${ID}/card`])
	})

	it('tries a change, with the id of the widget it changes when there is one', async () => {
		answers({ response: { photos: 3 }, card: { rows: [] } })
		expect(await testWidget(change)).toEqual({ response: { photos: 3 }, card: { rows: [] } })
		expect([sent().method, sent().url, JSON.parse(sent().data)]).toEqual(['post', '/v1/sys/widgets/test', change])

		await testWidget(change, ID)
		expect(JSON.parse(sent().data)).toEqual({ ...change, id: ID })
	})

	it('asks for the card of a recipe on an answer it already has', async () => {
		answers({ rows: [] })
		await previewWidget({ name: 'Immich' }, { photos: 3 })
		expect([sent().method, sent().url, JSON.parse(sent().data)]).toEqual(['post', '/v1/sys/widgets/preview', { recipe: { name: 'Immich' }, response: { photos: 3 } }])
	})

	it('never puts in an address what is not the id of a widget', async () => {
		for (const id of ['../users', 'AB12CD34', 'ab12cd3', 'ab12cd345', '', undefined, 3]) {
			for (const call of [() => updateWidget(id, change), () => deleteWidget(id), () => widgetCard(id), () => testWidget(change, id || 'x')])
				await expect(call()).rejects.toThrow('not the id of a widget')
		}
		expect(calls).toEqual([])
	})

	it('keeps the status and the message of a refusal', async () => {
		refuses(400, { success: 400, message: 'the input "api_key" is not filled' })
		await expect(createWidget(change)).rejects.toMatchObject({ status: 400, message: 'the input "api_key" is not filled', secretsAgain: false })

		refuses(404, { success: 404, message: 'no such widget' })
		await expect(widgetCard(ID)).rejects.toMatchObject({ status: 404, message: 'no such widget', secretsAgain: false })
	})

	it('says when every secret must be given again', async () => {
		refuses(400, { success: 400, message: 'the address or the request changed, every input must be filled again', data: { secrets_again: true } })
		await expect(updateWidget(ID, change)).rejects.toMatchObject({ status: 400, secretsAgain: true })

		// only a 400 of the core says it
		refuses(500, { data: { secrets_again: true } })
		await expect(updateWidget(ID, change)).rejects.toMatchObject({ status: 500, secretsAgain: false })
	})

	it('tells a body that is too large, whoever refused it', async () => {
		refuses(413, { success: 413, message: 'the body is too large' })
		await expect(previewWidget({}, {})).rejects.toMatchObject({ status: 413, message: 'the body is too large' })

		// a proxy in front of the box answers a page, not the core's JSON
		refuses(413, '<html>Request Entity Too Large</html>')
		await expect(previewWidget({}, {})).rejects.toMatchObject({ status: 413, message: '', secretsAgain: false })
	})

	it('has no status when the box did not answer', async () => {
		reply = () => Promise.reject(new Error('Network Error'))
		await expect(listWidgets()).rejects.toMatchObject({ status: 0, message: '', secretsAgain: false })
	})
})
