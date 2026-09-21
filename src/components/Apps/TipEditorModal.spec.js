// @vitest-environment happy-dom
import Buefy from 'buefy'
import VueDOMPurifyHTML from 'vue-dompurify-html'
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import TipEditorModal from './TipEditorModal.vue'
import { dompurifyOptions } from '@/plugins/dompurify.js'

function setup(tips, props = {}) {
	return mount(TipEditorModal, {
		props: { composeData: { 'x-casaos': { tips: { custom: tips } } }, ...props },
		global: {
			plugins: [Buefy, [VueDOMPurifyHTML, dompurifyOptions]],
			mocks: { $t: key => key },
		},
	})
}

// Rendering only: under happy-dom DOMPurify leaves attributes such as onerror in
// place, so what the sanitizer strips cannot be asserted here.
it('renders the tips as markdown, keeping line breaks and image sources', () => {
	const wrapper = setup(['Username: `admin`', 'Password: `casaos`', '', '![logo](https://example.com/logo.png)'].join('\n'))
	const box = wrapper.find('.tips.content')
	expect(box.findAll('code').map(code => code.text())).toEqual(['admin', 'casaos'])
	expect(box.html()).toContain('<br>')
	// the 'markdown' configuration keeps src; the strict default one strips it
	expect(box.find('img[src="https://example.com/logo.png"]').exists()).toBe(true)
	expect(wrapper.find('textarea').exists()).toBe(false)
})

it('swaps the rendered tips for a textarea while editing', async () => {
	const wrapper = setup('**bold**', { name: 'jellyfin' })
	await wrapper.setData({ isEditing: true })
	expect(wrapper.find('textarea').element.value).toBe('**bold**')
	expect(wrapper.find('.tips.content').exists()).toBe(false)
})
