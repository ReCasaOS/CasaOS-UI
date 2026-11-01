// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/assets/lang', () => ({ default: { en_us: {} } }))

describe('i18n without localStorage', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', undefined)
	})

	it('imports with locale en_us', async () => {
		const { default: i18n } = await import('@/plugins/i18n')
		const locale = i18n.global.locale
		expect(locale?.value ?? locale).toBe('en_us')
	})
})
