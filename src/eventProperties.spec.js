// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Every property the dashboard reads off a message-bus event, checked against
// the names the services actually publish.
//
// Nothing else checks this. The message bus does not validate what a publisher
// sends against the event type it declared (`// TODO - ensure properties are
// valid` in its websocket service), and a misspelt name on this side is not an
// error anywhere: it reads as `undefined`, and the handler quietly does the
// wrong thing. That is how the update handlers read `name` and `cid` for three
// years, drawing a nameless second card and never removing the real one, and
// how a failed uninstall never reset its spinner because it looked for `id`.
//
// The list is copied from the publishers by hand -- there is no build-time
// path from their Go sources to here -- and a name added on that side is added
// here when the handler that reads it is written.

const DECLARED = new Set([
	// CasaOS-AppManagement, common/message.go
	'app:name',
	'app:title',
	'app:icon',
	'app:progress',
	'app:updated',
	'docker:container:id',
	'docker:container:name',
	'docker:image:name',
	'docker:image:updated',
	'dry_run',
	'message',
	'backup:destination',
	'backup:stamp',
	'backup:kind',
	// CasaOS core, service/notify.go -- set as map keys, not declared
	'file_operate',
	// Sent by this dashboard itself as query parameters, which AppManagement
	// echoes onto every event of that request (route/v2/route.go,
	// PropertiesFromQueryParams).
	'recreate:container:id',
	'rebuild:container:id',
])

function walk(dir, out = []) {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name)
		if (statSync(path).isDirectory())
			walk(path, out)
		else if (/\.(vue|js)$/.test(name) && !name.endsWith('.spec.js'))
			out.push(path)
	}
	return out
}

describe('event properties the dashboard reads', () => {
	const reads = new Map()
	for (const file of walk(__dirname)) {
		const source = readFileSync(file, 'utf8')
		for (const match of source.matchAll(/Properties(?:\['([^']+)'\]|\.([A-Za-z_]\w*))/g)) {
			const name = match[1] ?? match[2]
			if (!reads.has(name))
				reads.set(name, new Set())
			reads.get(name).add(file.slice(__dirname.length + 1).replace(/\\/g, '/'))
		}
	}

	it('finds the reads at all', () => {
		expect(reads.size).toBeGreaterThan(5)
	})

	for (const [name, files] of reads) {
		it(`'${name}' is a name some service publishes (${[...files].join(', ')})`, () => {
			expect(DECLARED.has(name), `${name} is read but nothing sends it`).toBe(true)
		})
	}
})
