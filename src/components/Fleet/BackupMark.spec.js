// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BackupMark from './BackupMark.vue'

describe('the backup mark', () => {
	it('has a different glyph for each level, so that colour is never the only difference', () => {
		const glyph = level => mount(BackupMark, { props: { level, label: 'x' } }).text()
		const glyphs = ['ok', 'danger', 'warning', 'none'].map(glyph)
		expect(glyphs.every(Boolean)).toBe(true)
		expect(new Set(glyphs).size).toBe(4)
	})

	it('is an image with the label for a screen reader', () => {
		// the template starts with a comment: the root is a fragment
		const mark = mount(BackupMark, { props: { level: 'none', label: 'Offline' } }).find('[role="img"]')
		expect(mark.exists()).toBe(true)
		expect(mark.attributes('aria-label')).toBe('Offline')
	})
})
