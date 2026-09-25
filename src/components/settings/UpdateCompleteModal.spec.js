// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import UpdateCompleteModal from './UpdateCompleteModal.vue'

// It used to have no way out but the header's icon, which the keyboard cannot reach.
it('closes from a neutral Close, and names each share button', async () => {
	const wrapper = mount(UpdateCompleteModal, {
		global: {
			mocks: { $t: (k, p = {}) => k.replace(/\{(\w+)\}/g, (_, n) => p[n]) },
			directives: { 'dompurify-html': () => {} },
			stubs: { 'b-button': { props: ['label'], template: '<button>{{ label }}<slot /></button>' }, 'b-icon': true },
		},
	})

	const close = wrapper.find('footer button')
	expect(close.text()).toBe('Close')
	await close.trigger('click')
	expect(wrapper.emitted('close')).toHaveLength(1)

	const share = wrapper.findAll('.buttons button')
	expect(share.map(b => b.attributes('aria-label'))).toEqual(['Share on Facebook', 'Share on Twitter', 'Share on Reddit'])
	expect(wrapper.find('.buttons a').exists()).toBe(false)
	wrapper.unmount()
})
