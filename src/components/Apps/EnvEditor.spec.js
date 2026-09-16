// @vitest-environment happy-dom
import Buefy from 'buefy'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import EnvEditor from './EnvEditor.vue'
import i18n from '@/plugins/i18n'

// require.context has no Vite equivalent; an empty table makes $t return its key.
vi.mock('@/assets/lang', () => ({ default: { en_us: {} } }))

function setup(value = '', props = {}) {
	const applyComposeEnv = vi.fn().mockResolvedValue({ data: { message: 'ok' } })
	const wrapper = mount(EnvEditor, {
		props: { appId: 'jellyfin', value, ...props },
		global: {
			plugins: [Buefy, i18n],
			mocks: {
				$api: { container: { applyComposeEnv } },
				$buefy: { toast: { open: vi.fn() } },
			},
		},
	})
	// Typing into the real CodeMirror instance, so the change reaches the draft
	// the way a keystroke would.
	const type = text => wrapper.findComponent({ name: 'CodeMirrorEditor' }).vm.codemirror.setValue(text)
	const lastState = () => wrapper.emitted('state').at(-1)[0]
	return { wrapper, applyComposeEnv, type, lastState }
}

describe('envEditor', () => {
	it('blocks a line without "=" locally and lets comments, exports, quotes and blank lines through', async () => {
		const { wrapper, applyComposeEnv, type, lastState } = setup()

		type('KEY VALUE')
		await wrapper.vm.$nextTick()
		expect(wrapper.text()).toContain('expected KEY=VALUE')
		expect(lastState().canApply).toBe(false)
		await wrapper.vm.apply()
		expect(applyComposeEnv).not.toHaveBeenCalled()

		type('# c\nexport A="x y"\nB=\'$lit\'\nA.B-C[0]=1\nKEY: v\nBARE\n\n')
		await wrapper.vm.$nextTick()
		expect(wrapper.text()).not.toContain('expected KEY=VALUE')
		expect(lastState().canApply).toBe(true)
		wrapper.unmount()
	})

	it('applies with a dry run first, then for real, and emits the draft', async () => {
		const { wrapper, applyComposeEnv, type } = setup()
		type('A=1\n')
		await wrapper.vm.$nextTick()

		await wrapper.vm.apply()
		expect(applyComposeEnv.mock.calls).toEqual([
			['jellyfin', 'A=1\n', true],
			['jellyfin', 'A=1\n', false],
		])
		expect(wrapper.emitted('applied')).toEqual([['A=1\n']])
		wrapper.unmount()
	})

	it('shows the dry-run rejection and stops there', async () => {
		const { wrapper, applyComposeEnv, type } = setup()
		applyComposeEnv.mockRejectedValueOnce({ response: { status: 400, data: { message: 'line 2: unexpected character "!"' } } })
		type('A=1\nB=!\n')
		await wrapper.vm.$nextTick()

		await wrapper.vm.apply()
		await wrapper.vm.$nextTick()
		expect(applyComposeEnv).toHaveBeenCalledTimes(1)
		expect(wrapper.text()).toContain('line 2: unexpected character "!"')
		expect(wrapper.emitted('applied')).toBeUndefined()
		wrapper.unmount()
	})

	it('stays read-only and never applies when the repository tracks the file', async () => {
		const { wrapper, applyComposeEnv, type, lastState } = setup('A=1\n', { readonly: true })
		expect(wrapper.findComponent({ name: 'CodeMirrorEditor' }).vm.codemirror.getOption('readOnly')).toBe(true)
		expect(wrapper.text()).not.toContain('Applying an empty file deletes it.')

		type('A=2\n')
		await wrapper.vm.$nextTick()
		expect(lastState().canApply).toBe(false)
		await wrapper.vm.apply()
		expect(applyComposeEnv).not.toHaveBeenCalled()
		wrapper.unmount()
	})

	it('accepts an empty draft, which deletes the file', async () => {
		const { wrapper, applyComposeEnv, type, lastState } = setup('A=1\n')
		type('')
		await wrapper.vm.$nextTick()
		expect(lastState().canApply).toBe(true)

		await wrapper.vm.apply()
		expect(applyComposeEnv).toHaveBeenNthCalledWith(1, 'jellyfin', '', true)
		expect(applyComposeEnv).toHaveBeenNthCalledWith(2, 'jellyfin', '', false)
		wrapper.unmount()
	})
})
