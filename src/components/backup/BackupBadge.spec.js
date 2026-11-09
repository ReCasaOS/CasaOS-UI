// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BackupBadge from './BackupBadge.vue'

const glyph = kind => mount(BackupBadge, { props: { kind, title: 'x' } }).text()

describe('the backup badge', () => {
	it('has a different shape for each kind, so that colour is never the only difference', () => {
		const glyphs = ['ok', 'failed', 'attention'].map(glyph)
		expect(glyphs.every(Boolean)).toBe(true)
		expect(new Set(glyphs).size).toBe(3)
	})

	it('uses the same grey glyph for attention as the Fleet mark', () => {
		expect(glyph('attention')).toBe('○')
	})

	it('is an image named by its title, which is also the tooltip', () => {
		const badge = mount(BackupBadge, { props: { kind: 'failed', title: 'Backup failed: disk full' } }).find('[role="img"]')
		expect(badge.exists()).toBe(true)
		expect(badge.attributes('aria-label')).toBe('Backup failed: disk full')
		expect(badge.attributes('title')).toBe('Backup failed: disk full')
	})

	it('hides its glyph from a screen reader, which reads the title', () => {
		const badge = mount(BackupBadge, { props: { kind: 'ok', title: 'x' } }).find('[role="img"]')
		expect(badge.find('[aria-hidden="true"]').exists()).toBe(true)
	})
})
