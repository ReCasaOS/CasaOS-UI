import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { babelParse, parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

// Buefy shows the message of a toast, a snackbar, a notification and a dialog,
// and the content of a modal, as HTML. The title of a VM, an error from the
// service or a file name must not reach one as it is. This reads the sources
// of the folder, so that any new call has to be written in a way that is safe:
// the message is the text of ours, or escaped as a whole.

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
const HANDS_ON = ['modalStack.js']

function walk(node, visit) {
	if (Array.isArray(node)) {
		node.forEach(child => walk(child, visit))
	} else if (node && typeof node.type === 'string') {
		visit(node)
		Object.entries(node).forEach(([key, child]) => key !== 'loc' && walk(child, visit))
	}
}

// What a message may be: a translation of a fixed key, with no parameters to
// put in, or a call of escape on the whole of it. Escaping a part, or adding
// something to what is escaped, is not enough.
function isSafe(node, escape) {
	if (node.type === 'ConditionalExpression') {
		return isSafe(node.consequent, escape) && isSafe(node.alternate, escape)
	}
	// a VNode array (what a notification takes): h(...) calls only, so that no service text becomes HTML
	if (node.type === 'ArrayExpression') {
		return node.elements.every(el => el?.type === 'CallExpression' && el.callee.type === 'Identifier' && el.callee.name === 'h')
	}
	if (node.type !== 'CallExpression') {
		return false
	}
	const { callee } = node
	if (callee.type === 'Identifier' && callee.name === escape) {
		return true
	}
	const name = callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : callee.name
	return name === '$t' && node.arguments.length === 1 && node.arguments[0].type === 'StringLiteral'
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

describe('the messages Buefy shows as HTML', () => {
	const folder = import.meta.dirname
	const files = readdirSync(folder).filter(f => /\.(?:vue|js)$/.test(f) && !f.endsWith('.spec.js'))
	const sources = Object.fromEntries(files.map(f => [f, readFileSync(join(folder, f), 'utf8')]))
	sources['stats.js'] = readFileSync(join(folder, '../../service/stats.js'), 'utf8')

	it('are escaped as a whole, or a fixed text', () => {
		const sinks = []
		const problems = []
		for (const [file, source] of Object.entries(sources)) {
			const found = scan(file, source)
			sinks.push(...found.sinks)
			problems.push(...found.problems)
		}
		expect(problems).toEqual([])
		// the window opened by the entry
		expect(sinks).toContain('entry.js: openWithEscape')
	})

	it('are never written with v-html or innerHTML in the Statistics files', () => {
		for (const [file, source] of Object.entries(sources)) {
			expect(source, file).not.toMatch(/v-html|v-dompurify-html|innerHTML/)
		}
	})
})

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
		'a message with a part before the escape': `this.$buefy.toast.open({ message: 'Error: ' + escape(title) })`,
		'a translation with parameters': 'this.$buefy.toast.open({ message: this.$t(\'{name} is gone\', { name: title }) })',
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
