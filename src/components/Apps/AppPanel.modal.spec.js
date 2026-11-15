// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { h } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AppPanel from './AppPanel.vue'
import '@/plugins/vee-validate'

vi.mock('lottie-web-vue', () => ({ default: { name: 'lottie-animation', template: '<div/>' } }))

// The panel in the real programmatic modal, as AppSection opens it to install an app, and Escape as a browser sends it
// (keydown, then keyup on the document).
// any call on the clients is a request that never answers
function silent() {
	return new Proxy(() => new Promise(() => {}), { get: (target, key) => (key === 'then' ? undefined : silent()) })
}
let host
let panelRef
function setPanel(panel) {
	panelRef = panel
}
let modal

async function openPanel() {
	// a Buefy component of the panel registers a keyup listener it never defined; happy-dom then fails on dispatch
	const add = document.addEventListener.bind(document)
	vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => listener && add(type, listener, options))
	host = mount({ template: '<div />' }, {
		attachTo: document.body,
		global: {
			plugins: [Buefy],
			directives: { 'dompurify-html': {} },
			mocks: {
				$t: key => key,
				$messageBus: () => {},
				$store: { state: { isMobile: false, hardwareInfo: {} }, getters: { isAdmin: true, canWrite: true, canReadModule: () => true } },
				$api: silent(),
				$openAPI: silent(),
			},
		},
	})
	modal = host.vm.$buefy.modal.open({
		// a thin wrapper, only to hold a reference to the panel: the draft is reported through its own state handler
		component: { inheritAttrs: false, render() { return h(AppPanel, { ...this.$attrs, ref: setPanel }) } },
		hasModalCard: true,
		canCancel: [''],
		props: { id: '0', state: 'install', configData: { memory: { total: 1 << 30 }, networks: [] }, settingComposeData: 'name: a\nservices:\n  web:\n    image: nginx\n' },
	})
	await flushPromises()
	return document.querySelector('.modal.is-active') || document.querySelector('.modal')
}

// the modal hides (v-show) when it closes, and leaves the document once its transition ends
const shown = () => [...document.querySelectorAll('.modal.is-active')].some(el => el.style.display !== 'none')

// one press of Escape as a browser sends it
function press() {
	document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
	document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }))
	return flushPromises()
}
const dialogShown = () => [...document.querySelectorAll('.dialog')].some(el => el.closest('.modal')?.style.display !== 'none')

afterEach(() => {
	vi.restoreAllMocks()
	modal?.close?.()
	host?.unmount()
	document.body.innerHTML = ''
})

describe('escape on the panel inside its real modal', () => {
	it('closes it when nothing was typed, with no question', async () => {
		await openPanel()
		await press()

		expect(dialogShown()).toBe(false)
		expect(shown()).toBe(false)
	})

	it('asks first with a draft open: the question survives the key that raised it, the next Escape closes only the question, Discard closes the panel', async () => {
		await openPanel()
		panelRef.onEditorState({ canApply: true, isApplying: false, isDirty: true })

		await press()
		expect(dialogShown()).toBe(true)
		expect(shown()).toBe(true)

		await press()
		await flushPromises()
		expect(dialogShown()).toBe(false)
		expect(panelRef.editorState.isDirty).toBe(true)
		expect(document.querySelector('.modal-card')).not.toBeNull()

		await press()
		expect(dialogShown()).toBe(true)
		document.querySelector('.dialog .button.is-primary, .dialog footer button:last-child').click()
		await flushPromises()
		expect(shown()).toBe(false)
	})
})
