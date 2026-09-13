// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// A modal's width lives in a stylesheet keyed on the class the CALLER passes, so
// the two halves are in different files and nothing links them. Three panels
// shipped at Buefy's default 640px because of that: two with `account-modal`, a
// class that had no rule anywhere in the tree, and the app settings panel with
// an empty string -- which meant every rule written for it, including one
// widening it for the Containers tab, applied to nothing. The guard covered
// that one panel; this is the same guard over every `$buefy.modal.open` in the
// tree: a class passed is a class some stylesheet styles. No class at all is
// Buefy's default width, and allowed: most dialogs are fine at 640px, and
// saying nothing is not the same as saying something that does nothing.
//
// Reading the source is the only place this can be checked: a mounted test sees
// the class go in, and no unit test computes a width.

const src = dirname(fileURLToPath(import.meta.url))

function walk(dir, out = []) {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name)
		if (statSync(path).isDirectory())
			walk(path, out)
		else if (/\.(?:vue|scss|css)$/.test(name))
			out.push(path)
	}

	return out
}

const files = new Map(walk(src).map(path => [path, readFileSync(path, 'utf8')]))
const everything = [...files.values()].join('\n')

// the `{ ... }` handed to modal.open, braces balanced
function modalCalls(text) {
	const calls = []
	let from = 0
	for (;;) {
		const start = text.indexOf('modal.open({', from)
		if (start < 0)
			break
		let depth = 0
		let i = text.indexOf('{', start)
		for (; i < text.length; i++) {
			if (text[i] === '{')
				depth++
			if (text[i] === '}' && --depth === 0)
				break
		}
		calls.push(text.slice(start, i + 1))
		from = i
	}

	return calls
}

const sites = []
for (const [path, text] of files) {
	if (!path.endsWith('.vue'))
		continue
	for (const call of modalCalls(text)) {
		if (!/component:/.test(call))
			continue
		const cls = (call.match(/customClass:\s*'([^']*)'/) || [null, ''])[1]
		sites.push({ file: path.slice(src.length + 1), call, cls })
	}
}

describe('the class every modal is opened with', () => {
	it('finds the calls', () => {
		expect(sites.length).toBeGreaterThan(15)
	})

	for (const site of sites.filter(s => s.cls)) {
		it(`${site.file}: ${site.call.slice(11, 50).replace(/\s+/g, ' ')} passes ${site.cls}, which a stylesheet styles`, () => {
			for (const one of site.cls.split(/\s+/))
				expect(everything, `.${one} is styled nowhere`).toMatch(new RegExp(`\\.${one}(?![A-Za-z0-9_-])`))
		})
	}
})

describe('the class the app panel is opened with', () => {
	const section = files.get(join(src, 'components', 'Apps', 'AppSection.vue'))
	const panel = files.get(join(src, 'components', 'Apps', 'AppPanel.vue'))

	// `component: AppPanel` ... `customClass: '<x>'`, per modal.open call
	const opened = [...section.matchAll(/component:\s*AppPanel,[\s\S]{0,400}?customClass:\s*'([^']*)'/g)]
		.map(match => match[1])

	it('is passed at every call site', () => {
		expect(opened.length).toBeGreaterThan(0)
		expect(opened).not.toContain('')
	})

	it('is a class the panel actually styles', () => {
		for (const name of new Set(opened))
			expect(panel).toContain(`.${name} {`)
	})
})
