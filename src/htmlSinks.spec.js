import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { babelParse, parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

// Buefy shows the message of a toast, a snackbar, a notification and a dialog,
// and the content of a modal, as HTML. The name of an app from a store, an
// error from a service or a file name must not reach one as it is. This reads
// every source of the dashboard, so that any new call has to be written in a
// way that is safe: the message is text and markup of ours, and whatever else
// goes in it goes through lodash's escape.

// what Buefy shows as HTML, by the call that gives it
const SINKS = {
	'toast.open': 'message',
	'snackbar.open': 'message',
	'notification.open': 'message',
	'dialog.alert': 'message',
	'dialog.confirm': 'message',
	'dialog.prompt': 'message',
	'modal.open': 'content',
}
// opens a modal with the options it is given, in the place of the argument
const MODAL_OPENERS = { openWithEscape: 1 }
// and the components that take the same as a prop
const COMPONENTS = ['bnotification', 'bmodal', 'bdialog', 'bsnackbar']
const PROPS = ['message', 'content']
// the file that hands on the options its callers wrote, which are checked as
// calls of modal.open
const HANDS_ON = ['components/VirtualMachines/modalStack.js', 'modalStack.js']

function walk(node, visit) {
	if (Array.isArray(node)) {
		node.forEach(child => walk(child, visit))
	} else if (node && typeof node.type === 'string') {
		visit(node)
		Object.entries(node).forEach(([key, child]) => key !== 'loc' && walk(child, visit))
	}
}

// a key of ours: a text written out, or one of two
function isFixedKey(node) {
	if (node?.type === 'ConditionalExpression') {
		return isFixedKey(node.consequent) && isFixedKey(node.alternate)
	}
	return node?.type === 'StringLiteral' || (node?.type === 'TemplateLiteral' && node.expressions.length === 0)
}

// What a message may be made of: text and markup written out here, a
// translation of a fixed key, and a call of lodash's escape; put together with
// a template, a `+`, a choice between two, or a list mapped and joined. A
// translation takes its parameters under the same rule. Anything else (a
// variable, a field of an answer, another function) is not known to be text.
function isSafe(node, escape) {
	switch (node?.type) {
		case 'StringLiteral':
		case 'NumericLiteral':
			return true
		case 'TemplateLiteral':
			return node.expressions.every(part => isSafe(part, escape))
		case 'BinaryExpression':
			return node.operator === '+' && isSafe(node.left, escape) && isSafe(node.right, escape)
		case 'ConditionalExpression':
			return isSafe(node.consequent, escape) && isSafe(node.alternate, escape)
		case 'LogicalExpression':
			return isSafe(node.left, escape) && isSafe(node.right, escape)
		case 'ArrayExpression':
		// a VNode array (what a notification takes): h(...) calls only, so that no service text becomes HTML
			return node.elements.every(el => el?.type === 'CallExpression' && el.callee.type === 'Identifier' && el.callee.name === 'h')
		case 'CallExpression':
			return isSafeCall(node, escape)
		default:
			return false
	}
}

function isSafeCall(node, escape) {
	const { callee } = node
	if (callee.type === 'Identifier') {
		return callee.name === escape
	}
	if (callee.type !== 'MemberExpression' || callee.computed) {
		return false
	}
	if (callee.property.name === '$t') {
		const [key, params] = node.arguments
		return node.arguments.length <= 2 && isFixedKey(key)
			&& (!params || (params.type === 'ObjectExpression' && params.properties.every(p => p.type === 'ObjectProperty' && !p.computed && isSafe(p.value, escape))))
	}
	// lines.map(line => <safe>).join('<br>'): a list whose every line is safe
	if (callee.property.name === 'join' && node.arguments.every(arg => arg.type === 'StringLiteral')) {
		const list = callee.object
		const each = list.type === 'CallExpression' && list.callee.type === 'MemberExpression' && list.callee.property.name === 'map' && list.arguments.length === 1 ? list.arguments[0] : null
		return each?.type === 'ArrowFunctionExpression' && each.body.type !== 'BlockStatement' && isSafe(each.body, escape)
	}
	return false
}

function scanScript(code, file, found) {
	const { program } = babelParse(code, { sourceType: 'module' })
	// the local name of lodash's escape: any other escape is not that
	const escape = program.body.find(n => n.type === 'ImportDeclaration' && n.source.value === 'lodash/escape')?.specifiers[0]?.local.name

	walk(program, (node) => {
		if (node.type !== 'CallExpression' && node.type !== 'OptionalCallExpression') {
			return
		}
		const { callee } = node
		let kind
		let argument
		let property
		if (callee.type === 'Identifier' && Object.hasOwn(MODAL_OPENERS, callee.name)) {
			kind = callee.name
			argument = node.arguments[MODAL_OPENERS[kind]]
			property = 'content'
		} else if (callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') {
			kind = `${callee.object.property?.name ?? callee.object.name}.${callee.property.name}`
			argument = node.arguments[0]
			property = Object.hasOwn(SINKS, kind) ? SINKS[kind] : undefined
		}
		if (!property) {
			return
		}

		const at = `${file}: ${kind}`
		found.sinks.push(at)
		if (argument?.type !== 'ObjectExpression') {
			found.problems.push(`${at}: the options are not written out where it is called`)
			return
		}
		for (const prop of argument.properties) {
			if (prop.type === 'SpreadElement' && HANDS_ON.includes(file)) {
				continue
			}
			if (prop.type !== 'ObjectProperty' || prop.computed) {
				found.problems.push(`${at}: an option that is a spread, a method or a computed name`)
			} else if ((prop.key.name ?? prop.key.value) === property && !isSafe(prop.value, escape)) {
				found.problems.push(`${at}: ${code.slice(prop.start, prop.end)}`)
			}
		}
	})
}

function scanTemplate(descriptor, file, found) {
	const visit = (node) => {
		if (node.type === 1 && COMPONENTS.includes(node.tag.toLowerCase().replaceAll('-', ''))) {
			found.sinks.push(`${file}: <${node.tag}>`)
			for (const prop of node.props) {
				// a text written out is safe; one that comes from the data is not
				if (prop.type === 7 && prop.name === 'bind' && (!prop.arg || PROPS.includes(prop.arg.content))) {
					found.problems.push(`${file}: <${node.tag}> takes its ${prop.arg?.content ?? 'props'} from the data`)
				}
			}
		}
		node.children?.forEach(visit)
	}
	visit(descriptor.template.ast)

	// a call in the template is not read here: it goes in a method, where it is
	if (/\b(?:toast|snackbar|notification|modal)\.open\(|\bdialog\.(?:alert|confirm|prompt)\(/.test(descriptor.template.content)) {
		found.problems.push(`${file}: a call that opens a message or a modal is written in the template`)
	}
}

// every message and modal that source opens, and what is wrong with them
function scan(file, source) {
	const found = { sinks: [], problems: [] }
	if (file.endsWith('.vue')) {
		const { descriptor } = parse(source, { filename: file })
		for (const script of [descriptor.script, descriptor.scriptSetup]) {
			if (script) {
				scanScript(script.content, file, found)
			}
		}
		if (descriptor.template) {
			scanTemplate(descriptor, file, found)
		}
	} else {
		scanScript(source, file, found)
	}
	return found
}

// every .vue and .js under src, by its path from there; not the tests, nor the generated API clients
function sourcesUnder(folder, prefix = '') {
	const sources = {}
	for (const entry of readdirSync(folder, { withFileTypes: true })) {
		const path = prefix + entry.name
		if (entry.isDirectory()) {
			if (entry.name !== 'openapi' && entry.name !== 'assets') {
				Object.assign(sources, sourcesUnder(join(folder, entry.name), `${path}/`))
			}
		} else if (/\.(?:vue|js)$/.test(entry.name) && !entry.name.endsWith('.spec.js')) {
			sources[path] = readFileSync(join(folder, entry.name), 'utf8')
		}
	}
	return sources
}

describe('the messages Buefy shows as HTML', () => {
	const sources = sourcesUnder(import.meta.dirname)

	it('are text of ours, with whatever else goes in them escaped', () => {
		const sinks = []
		const problems = []
		for (const [file, source] of Object.entries(sources)) {
			const found = scan(file, source)
			sinks.push(...found.sinks)
			problems.push(...found.problems)
		}
		expect(problems).toEqual([])
		// the window opened by an entry, and the messages of the whole dashboard
		expect(sinks).toContain('components/Stats/entry.js: openWithEscape')
		expect(sinks.length).toBeGreaterThanOrEqual(250)
	})

	it('are never written with v-html or innerHTML in the VM and the Statistics files', () => {
		for (const [file, source] of Object.entries(sources)) {
			if (/^components\/(?:VirtualMachines|Stats)\/|^service\/stats\.js$/.test(file)) {
				expect(source, file).not.toMatch(/v-html|v-dompurify-html|innerHTML/)
			}
		}
	})
})

/* eslint-disable no-template-curly-in-string -- the probes below are source text, read by the scanner */
describe('the guard of the messages', () => {
	const imports = 'import escape from \'lodash/escape\'\n'
	const call = (body, file = 'probe.js') => scan(file, imports + body).problems
	const vue = (template, script = '') => `<template><div>${template}</div></template>\n<script>\n${imports}export default { methods: { m() {\n${script}\n} } }\n</script>`

	const unsafe = {
		'a plain error in a toast': 'this.$buefy.toast.open({ message: e.message })',
		'a bare string': 'this.$buefy.toast.open(\'<b>hello</b>\')',
		'a bare template in a snackbar': 'this.$buefy.snackbar.open(`<b>hello</b>`)',
		'options held in a variable': 'this.$buefy.toast.open(options)',
		'the message in a variable': 'this.$buefy.toast.open({ message: title })',
		'the message as a shorthand': 'this.$buefy.toast.open({ message })',
		'the brace on the next line': 'this.$buefy.toast.open(\n\t{\n\t\tmessage: title,\n\t},\n)',
		'a message with a part escaped': 'this.$buefy.toast.open({ message: escape(title) + e.message })',
		'a translation with parameters': 'this.$buefy.toast.open({ message: this.$t(\'{name} is gone\', { name: title }) })',
		'a translation with one parameter of two escaped': 'this.$buefy.toast.open({ message: this.$t(\'{name}: {why}\', { name: escape(title), why: e.message }) })',
		'a template with a value put in as it is': 'this.$buefy.toast.open({ message: `<b>${title}</b>` })',
		'a template with a field of an answer': 'this.$buefy.dialog.alert({ message: `${this.$t(\'Failed\')}<br>${res.data.message}` })',
		'an escaped text or a field of an answer': 'this.$buefy.toast.open({ message: escape(title) || e.message })',
		'a list joined whose lines are not escaped': 'this.$buefy.dialog.confirm({ message: names.map(n => `<li>${n}</li>`).join(\'\') })',
		'a list joined that was built elsewhere': 'this.$buefy.dialog.confirm({ message: lines.join(\'<br>\') })',
		'a list joined with a separator that is not written out': 'this.$buefy.dialog.confirm({ message: names.map(n => escape(n)).join(sep) })',
		'a translation of a key that is not fixed': 'this.$buefy.toast.open({ message: this.$t(key) })',
		'a ternary with one side not safe': 'this.$buefy.toast.open({ message: ok ? this.$t(\'Done\') : e.message })',
		'a notification': 'this.$buefy.notification.open({ message: title })',
		'a dialog': 'this.$buefy.dialog.confirm({ message: title })',
		'an alert with a bare string': 'this.$buefy.dialog.alert(title)',
		'a modal with a content': 'this.$buefy.modal.open({ content: title })',
		'a modal opened by the helper with a content': 'openWithEscape(this.$buefy, { content: title })',
		'a modal opened by the helper with options held': 'openWithEscape(this.$buefy, options)',
		'a spread': 'this.$buefy.toast.open({ ...options })',
		'a computed name': 'this.$buefy.toast.open({ [name]: title })',
		'a call that does not say it is escape': 'this.$buefy.toast.open({ message: other(title) })',
		'a notification with a string and a tag': 'this.$buefy.notification.open({ message: \'<b>\' + name + \'</b>\' })',
		'a notification with an array that holds a string': 'this.$buefy.notification.open({ message: [h("p", name), name] })',
	}

	it.each(Object.entries(unsafe))('catches %s', (_, body) => {
		expect(call(body)).not.toEqual([])
	})

	it('catches an escape that is not lodash\'s', () => {
		expect(scan('probe.js', 'this.$buefy.toast.open({ message: escape(title) })').problems).not.toEqual([])
	})

	it('catches them in the script of a component, and in a template', () => {
		expect(scan('probe.vue', vue('', 'this.$buefy.toast.open({ message: title })')).problems).not.toEqual([])
		expect(scan('probe.vue', vue('<b-notification :message="title" />')).problems).not.toEqual([])
		expect(scan('probe.vue', vue('<BNotification v-bind="shown" />')).problems).not.toEqual([])
		expect(scan('probe.vue', vue('<b-modal :content="html" />')).problems).not.toEqual([])
		expect(scan('probe.vue', vue('<button @click="$buefy.toast.open(\'x\')" />')).problems).not.toEqual([])
	})

	const safe = {
		'an escaped error': 'this.$buefy.toast.open({ message: escape(e.response?.data?.message || e.message), type: \'is-danger\' })',
		'a fixed text': 'this.$buefy.toast.open({ message: this.$t(\'Copied to clipboard\'), type: \'is-success\' })',
		'an escaped translation with parameters': 'this.$buefy.toast.open({ message: escape(this.$t(\'{name} is gone\', { name: title })) })',
		'one of two fixed texts': 'this.$buefy.dialog.confirm({ message: off ? this.$t(\'Off\') : this.$t(\'Reset\') })',
		'a translation of one of two fixed keys': 'this.$buefy.toast.open({ message: this.$t(off ? \'Off\' : \'Reset\') })',
		'a translation whose parameters are escaped or written out': 'this.$buefy.toast.open({ message: this.$t(\'{name} is kept {days} days\', { name: escape(title), days: 30 }) })',
		'a text of ours before an escaped one': `this.$buefy.toast.open({ message: 'Error: ' + escape(title) })`,
		'markup of ours around translations and escaped values': 'this.$buefy.dialog.alert({ message: `${this.$t(\'Kept\')}<br><code>${escape(password)}</code>` })',
		'an escaped text, or a fixed one when there is none': 'this.$buefy.toast.open({ message: escape(e.message) || this.$t(\'Error\') })',
		'a list of escaped lines, mapped and joined': 'this.$buefy.dialog.confirm({ message: `<ul>${names.map(n => `<li>${escape(n)}</li>`).join(\'\')}</ul>` })',
		'the brace on the next line, and the message safe': 'this.$buefy.toast.open(\n\t{\n\t\tmessage: escape(title),\n\t},\n)',
		'a modal with a component': 'this.$buefy.modal.open({ component: Form, props: { host }, canCancel: [] })',
		'a modal opened by the helper': 'openWithEscape(this.$buefy, { component: Form, props: { host } })',
		'a notification with a VNode array': 'this.$buefy.notification.open({ message: [h("p", text), h("button", { onClick: go }, label)] })',
		'a dialog with no message': 'this.$buefy.dialog.confirm({ title: title, onConfirm: go })',
	}

	it.each(Object.entries(safe))('lets through %s', (_, body) => {
		expect(call(body)).toEqual([])
	})

	it('lets through a text written out in a component, and one that is not a sink', () => {
		expect(scan('probe.vue', vue('<b-notification message="Hello" /><b-field :message="note" /><b-modal v-model="open" />')).problems).toEqual([])
	})

	it('counts what it looked at, so that a guard that finds nothing says so', () => {
		const { sinks } = scan('probe.vue', vue('<b-notification message="Hello" />', 'this.$buefy.toast.open({ message: escape(x) })'))
		expect(sinks).toEqual(['probe.vue: toast.open', 'probe.vue: <b-notification>'])
	})
})
