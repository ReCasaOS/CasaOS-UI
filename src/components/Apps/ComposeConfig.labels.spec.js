// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import YAML from 'yaml'
import ComposeConfig from './ComposeConfig.vue'

vi.mock('@/service/appInfo', () => ({ default: { supports: vi.fn().mockResolvedValue(false) } }))

const { parseComposeItem, outputConfigDataCommands, makeArray, volumeAutoCheck, labelProblemsOf } = ComposeConfig.methods

const withLabels = `name: demo
services:
  web:
    image: nginx:latest
    labels:
      traefik.enable: "true"
      traefik.http.routers.demo.rule: Host(\`demo.lan\`)
      icon: http://store/icon.png
      casaos: casaos
`

// The editor round trip, as in ComposeConfig.spec.js, with or without the AppManagement
// that checks labels
function editorModel(yamlText, labelsSupported) {
	const context = { makeArray, volumeAutoCheck, volumes: {}, totalMemory: 4096, labelsSupported, configData: { 'x-casaos': { title: { en_us: 'demo' } } } }
	const source = YAML.parse(yamlText)
	const services = {}
	for (const key of Object.keys(source.services))
		services[key] = parseComposeItem.call(context, source.services[key])
	return { name: source.name, services }
}

function emitYaml(configData, yamlText) {
	let emitted = ''
	outputConfigDataCommands.call({ dockerComposeCommands: yamlText, $emit: (_event, value) => (emitted = value) }, configData)
	return YAML.parse(emitted)
}

describe('composeConfig labels with an AppManagement that checks them', () => {
	it('shows the user\'s labels and keeps the system\'s out of the form', () => {
		const model = editorModel(withLabels, true)
		expect(model.services.web.labels).toEqual([
			{ container: 'traefik.enable', host: 'true' },
			{ container: 'traefik.http.routers.demo.rule', host: 'Host(`demo.lan`)' },
		])
	})

	it('writes the labels back unchanged, the system\'s included', () => {
		const out = emitYaml(editorModel(withLabels, true), withLabels)
		expect(out.services.web.labels).toEqual([
			'icon=http://store/icon.png',
			'casaos=casaos',
			'traefik.enable=true',
			'traefik.http.routers.demo.rule=Host(`demo.lan`)',
		])
		expect(out.services.web).not.toHaveProperty('hiddenLabels')
	})

	it('writes an added label, and none a user removed', () => {
		const model = editorModel(withLabels, true)
		model.services.web.labels.splice(0, 1)
		model.services.web.labels.push({ container: 'homepage.group', host: 'Media' })
		const out = emitYaml(model, withLabels)
		expect(out.services.web.labels).toEqual([
			'icon=http://store/icon.png',
			'casaos=casaos',
			'traefik.http.routers.demo.rule=Host(`demo.lan`)',
			'homepage.group=Media',
		])
	})

	it('writes no labels key when every label is gone', () => {
		const text = 'name: demo\nservices:\n  web:\n    image: nginx\n    labels:\n      a: "1"\n'
		const model = editorModel(text, true)
		model.services.web.labels = []
		expect(emitYaml(model, text).services.web).not.toHaveProperty('labels')
	})

	it('adds labels to a service that had none', () => {
		const text = 'name: demo\nservices:\n  web:\n    image: nginx\n'
		const model = editorModel(text, true)
		expect(model.services.web.labels).toEqual([])
		model.services.web.labels.push({ container: 'a.b', host: 'c' })
		expect(emitYaml(model, text).services.web.labels).toEqual(['a.b=c'])
	})

	it('tells what is wrong with a row, not with what the file had', () => {
		const context = { knownLabels: { web: { 'legacy key': 'x' } } }
		const labels = [{ container: 'legacy key', host: 'x' }, { container: 'casaos', host: 'casaos' }]
		expect(labelProblemsOf.call(context, 'web', { labels })).toHaveLength(1)
	})
})

describe('composeConfig labels with an AppManagement that does not check them', () => {
	it('has no labels field and leaves the file\'s labels alone', () => {
		for (const supported of [false, undefined]) {
			const model = editorModel(withLabels, supported)
			expect(model.services.web).not.toHaveProperty('labels')
			expect(emitYaml(model, withLabels).services.web.labels).toEqual({
				'traefik.enable': 'true',
				'traefik.http.routers.demo.rule': 'Host(`demo.lan`)',
				'icon': 'http://store/icon.png',
				'casaos': 'casaos',
			})
		}
	})
})
