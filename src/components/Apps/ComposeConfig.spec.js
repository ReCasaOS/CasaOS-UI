// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import ComposeConfig from './ComposeConfig.vue'

const { parseComposeItem, outputConfigDataCommands, makeArray, volumeAutoCheck, parseComposeYaml } = ComposeConfig.methods

const composeYaml = `name: jellyfin
services:
  jellyfin:
    image: jellyfin/jellyfin:latest
    ports:
      - "8096:8096"
      - "8920:8920"
    cpu_shares: 90
    deploy:
      resources:
        limits:
          memory: 2048M
          cpus: '2'
`

// The editor round trip: YAML in, parseComposeItem to the form model, the form
// model back out through outputConfigDataCommands, YAML out.
function editorModel(yamlText = composeYaml) {
	const parseContext = {
		makeArray,
		volumeAutoCheck,
		volumes: {},
		totalMemory: 4096,
		configData: { 'x-casaos': { title: { en_us: 'jellyfin' } } },
	}
	const source = YAML.parse(yamlText)
	const services = {}
	for (const key of Object.keys(source.services))
		services[key] = parseComposeItem.call(parseContext, source.services[key])
	return { name: source.name, services }
}

function emitYaml(configData, yamlText = composeYaml) {
	let emitted = ''
	outputConfigDataCommands.call(
		{ dockerComposeCommands: yamlText, $emit: (_event, value) => (emitted = value) },
		configData,
	)
	return YAML.parse(emitted)
}

function limits(configData, yamlText) {
	return emitYaml(configData, yamlText).services.jellyfin.deploy.resources.limits
}

describe('composeConfig cpu limit', () => {
	it('keeps an existing cpus limit through a round trip', () => {
		const model = editorModel()
		expect(model.services.jellyfin.deploy.resources.limits.cpus).toBe('2')
		expect(limits(model)).toMatchObject({ cpus: '2', memory: '2048M' })
	})

	it('writes a limit the user typed', () => {
		const model = editorModel()
		model.services.jellyfin.deploy.resources.limits.cpus = '1.5'
		expect(limits(model).cpus).toBe('1.5')
	})

	it('removes the limit when the field is cleared', () => {
		const model = editorModel()
		model.services.jellyfin.deploy.resources.limits.cpus = ''
		expect(limits(model)).not.toHaveProperty('cpus')
		expect(limits(model).memory).toBe('2048M')
	})

	it.each(['0', '-2', 'two', ' '])('treats %s as no limit', (value) => {
		const model = editorModel()
		model.services.jellyfin.deploy.resources.limits.cpus = value
		expect(limits(model)).not.toHaveProperty('cpus')
	})

	it('leaves the cpu shares weight alone', () => {
		const model = editorModel()
		expect(emitYaml(model).services.jellyfin.cpu_shares).toBe(90)
	})

	// merge() merges arrays by index, so the output path blanks the source arrays
	// first. A removed port must not come back from the file being edited.
	it('does not resurrect a removed port', () => {
		const model = editorModel()
		model.services.jellyfin.ports.pop()
		expect(emitYaml(model).services.jellyfin.ports).toHaveLength(1)
	})
})

// App Name is a required field, and a stack somebody wrote by hand carries no
// `x-casaos` for it to be filled from -- so its settings could not be saved at all
// until a name was invented, and renaming one started from an empty box rather than
// from the name the dashboard was already showing on the card.
describe('the app name of a hand-written stack', () => {
	const handWritten = `name: gluetun-stack
services:
  gluetun:
    image: qmcgaw/gluetun:latest
  qbittorrent:
    image: lscr.io/linuxserver/qbittorrent:latest
`

	function load(yamlText) {
		const context = {
			makeArray,
			volumeAutoCheck,
			parseComposeItem,
			volumes: {},
			totalMemory: 4096,
			current_service: '',
			configData: { 'name': '', 'services': {}, 'x-casaos': { title: { custom: '' } } },
		}
		parseComposeYaml.call(context, yamlText)
		return context.configData
	}

	it('falls back to the compose project name', () => {
		const configData = load(handWritten)
		expect(configData['x-casaos'].title.custom).toBe('gluetun-stack')
	})

	it('leaves a declared name alone', () => {
		const configData = load(`name: jellyfin
services:
  jellyfin:
    image: jellyfin/jellyfin:latest
x-casaos:
  title:
    en_us: Jellyfin Media Server
`)
		expect(configData['x-casaos'].title.custom).toBe('')
		expect(configData['x-casaos'].title.en_us).toBe('Jellyfin Media Server')
	})
})

// A stack somebody started by hand can build a service from its Dockerfile. That service
// may name no image, and the form must neither invent one nor drop the build on the way out.
const builtYaml = `name: jarvis
services:
  jarvis:
    build: .
    env_file: .env
  redis:
    image: redis:7
`

describe('composeConfig service built from a Dockerfile', () => {
	it('keeps the build section in the form model', () => {
		const model = editorModel(builtYaml)
		expect(model.services.jarvis.build).toBe('.')
		expect(model.services.jarvis.image).toBeUndefined()
	})

	it('writes the build back, and no image for it', () => {
		const out = emitYaml(editorModel(builtYaml), builtYaml)
		expect(out.services.jarvis.build).toBe('.')
		expect(out.services.jarvis).not.toHaveProperty('image')
		expect(out.services.redis.image).toBe('redis:7')
		expect(out.services.redis).not.toHaveProperty('build')
	})
})
