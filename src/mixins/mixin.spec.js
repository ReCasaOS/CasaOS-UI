import { describe, expect, it } from 'vitest'
import { mixin } from './mixin'

const panelOf = name => mixin.methods.getPanelType({ name })

describe('getPanelType', () => {
	// ReCasaOS/CasaOS#75 (md) and #74 (the rest, then the 2nd list) opened as a download dialog
	it.each(['README.md', 'notes.MD', 'list.m3u', 'list.m3u8', 'a.strm', 'a.nfo', 'a.vtt', 'a.properties', 'client.ovpn', 'fix.patch', 'Dockerfile', 'Makefile', '.env', 'README', 'LICENSE', 'yarn.lock', 'a.awk', 'a.cjs', 'a.desktop', 'a.gradle', 'a.jsx', 'a.lst', 'a.mjs', 'a.pls', 'a.rules', 'a.sed', 'a.socket', 'a.ssa', 'a.timer', 'a.tsx', 'a.webmanifest', 'a.xspf', 'a.pem', 'a.crt', 'a.cert', 'a.key', 'a.pub', 'a.sub'])(
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
