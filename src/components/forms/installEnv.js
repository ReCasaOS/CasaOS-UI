// A compose installed with its .env, and a compose installed as written. The .env travels as the
// top-level `x-casaos-env` string of the install body: AppManagement takes it out before it loads
// the text, checks the compose with its values and writes it as the app's .env.
import { parse } from 'yaml'

// the name a compose project may take (docker compose's rule)
export const APP_NAME = /^[a-z0-9][\w-]*$/

// withInstallEnv appends the .env to compose text; the text is left as it is when there is none.
// A JSON string is a YAML scalar, and appending keeps the anchors a re-serialisation would lose.
export function withInstallEnv(compose, env) {
	if (!env || !env.trim())
		return compose
	return `${compose.replace(/\s*$/, '')}\nx-casaos-env: ${JSON.stringify(env)}\n`
}

// composeInfo reads what installing as written needs to know: the project name, and whether the
// text has an x-casaos section. Throws on text that is not compose.
export function composeInfo(compose) {
	const doc = parse(compose)
	if (!doc || typeof doc !== 'object' || !doc.services || typeof doc.services !== 'object')
		throw new Error('not a compose file: no services')
	return { name: typeof doc.name === 'string' ? doc.name : '', hasCasaOS: doc['x-casaos'] !== undefined }
}

// asWritten is the text installed as written: a name in front when it has none, a title for the
// dashboard when it has no x-casaos section; nothing else of it changes.
export function asWritten(compose, name) {
	const info = composeInfo(compose)
	let text = compose
	if (!info.name)
		text = `name: ${name}\n${text}`
	if (!info.hasCasaOS)
		text = `${text.replace(/\s*$/, '')}\nx-casaos: ${JSON.stringify({ title: { custom: info.name || name } })}\n`
	return text
}
