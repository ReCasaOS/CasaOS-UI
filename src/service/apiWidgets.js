import { api } from './service.js'
import { isWidgetId } from '@/components/apiWidgets/ids'

// The dashboard's API widgets (core, /v1/sys/widgets), owner only. A change is { base, insecure_tls, recipe, secrets }; no secret ever
// comes back, only whether each input is filled. Every call answers the `data` of the core's answer, and a refusal is an Error with the
// HTTP `status` (0 when the box did not answer; 413 is a body that is too large), the core's `message` ('' when it gave none) and
// `secretsAgain`: the address or the request changed, and every input must be filled again.
const PREFIX = '/sys/widgets'

// The id of a widget is a path element of the core's routes: only the core's own rule goes into an address.
function widgetId(id) {
	if (!isWidgetId(id))
		throw new Error('not the id of a widget')
	return id
}

async function answer(call) {
	let response
	try {
		response = await call()
	} catch (error) {
		const status = error?.response?.status ?? 0
		const body = error?.response?.data
		const refusal = new Error(typeof body?.message === 'string' ? body.message : '')
		refusal.status = status
		refusal.secretsAgain = status === 400 && body?.data?.secrets_again === true
		throw refusal
	}
	return response.data.data
}

// { widgets: [{ id, base, insecure_tls, recipe, inputs_set: { input: bool }, error }] }
export const listWidgets = () => answer(() => api.get(PREFIX))

// both answer the widget as the list has it
export const createWidget = change => answer(() => api.post(PREFIX, change))
export async function updateWidget(id, change) {
	const url = `${PREFIX}/${widgetId(id)}`
	return answer(() => api.put(url, change))
}

export async function deleteWidget(id) {
	const url = `${PREFIX}/${widgetId(id)}`
	return answer(() => api.delete(url))
}

// The card, read by the box. A read that failed is still a card, with its `error`.
export async function widgetCard(id) {
	const url = `${PREFIX}/${widgetId(id)}/card`
	return answer(() => api.get(url))
}

// Reads the address of a change, which may be a draft, and writes nothing: { response, card }. With the `id` of the widget that is being
// changed, the inputs left out take its secrets.
export async function testWidget(change, id) {
	const body = id === undefined ? change : { ...change, id: widgetId(id) }
	return answer(() => api.post(`${PREFIX}/test`, body))
}

// The card a recipe makes of an answer already read by a test. The box sends nothing.
export const previewWidget = (recipe, response) => answer(() => api.post(`${PREFIX}/preview`, { recipe, response }))
