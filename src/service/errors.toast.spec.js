// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

// The other spec replaces Buefy; this one lets the real toast open, to be sure the export is used the right way.
vi.mock('@/router', () => ({ default: { replace: vi.fn(), push: vi.fn() } }))

describe('the refusal toast with the real Buefy', () => {
	it('shows one translated toast in the page for a 403 of the Gateway', async () => {
		localStorage.setItem('access_token', 'a')
		const { instance } = await import('./service')
		instance.defaults.adapter = (config) => {
			const error = new Error('403')
			error.config = config
			error.response = { status: 403, data: { success: 10011, message: 'INSUFFICIENT_PERMISSIONS' }, config }
			return Promise.reject(error)
		}
		const failure = await instance.get('/v1/sys/hardware').catch(error => error)
		await flushPromises()

		expect(failure.response).toBeDefined()
		expect(document.body.textContent).toContain('You do not have the right to do this.')
	})
})
