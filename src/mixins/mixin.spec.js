import { describe, expect, it } from 'vitest'
import { mixin } from './mixin'

const panelOf = name => mixin.methods.getPanelType({ name })

describe('getPanelType', () => {
	// ReCasaOS/CasaOS#75 (md) and #74 (the rest) opened as a download dialog
	it.each(['README.md', 'notes.MD', 'list.m3u', 'list.m3u8', 'a.strm', 'a.nfo', 'a.vtt', 'a.properties', 'client.ovpn', 'fix.patch', 'Dockerfile', 'Makefile', '.env', 'README'])(
		'opens %s in the code editor',
		(name) => {
			expect(panelOf(name)).toBe('code-editor')
		},
	)

	it.each(['photo.png', 'movie.mkv', 'a.pdf'])('keeps %s out of the code editor', (name) => {
		expect(panelOf(name)).not.toBe('code-editor')
	})

	it('offers no panel for a binary it does not know', () => {
		expect(panelOf('firmware.bin')).toBeNull()
	})
})
