// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CodeEditor from './CodeEditor.vue'
import i18n from '@/plugins/i18n'

// require.context has no Vite equivalent; an empty table makes $t return its key.
vi.mock('@/assets/lang', () => ({ default: { en_us: {} } }))

function setup(text = 'metisro', name = 'sample.ass') {
	const download = vi.fn().mockResolvedValue({ data: text })
	const update = vi.fn().mockResolvedValue({ data: { success: 200 } })
	const wrapper = mount(CodeEditor, {
		props: { item: { name, path: `/DATA/test/${name}` } },
		global: {
			plugins: [Buefy, i18n],
			mocks: {
				$api: { file: { download, update } },
				$buefy: { toast: { open: vi.fn() } },
			},
		},
	})
	const editor = () => wrapper.findComponent({ name: 'CodeMirrorEditor' }).vm.codemirror
	return { wrapper, editor, update }
}

describe('codeEditor', () => {
	it('shows the text of the file it opened', async () => {
		const { editor } = setup('metisro')
		await flushPromises()
		expect(editor().getValue()).toBe('metisro')
	})

	it('saves what the editor holds, and a fresh read is not a pending change', async () => {
		const { wrapper, editor, update } = setup('metisro')
		await flushPromises()
		expect(wrapper.vm.isChange).toBe(false)

		editor().setValue('metisro edited')
		await wrapper.vm.$nextTick()
		expect(wrapper.vm.isChange).toBe(true)

		wrapper.vm.saveFile()
		expect(update).toHaveBeenCalledWith('/DATA/test/sample.ass', 'metisro edited')
	})
})
