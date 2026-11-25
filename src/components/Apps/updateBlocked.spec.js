import { describe, expect, it } from 'vitest'
import { moreCritical, parseBlockedImages, safeUrl } from './updateBlocked'

describe('parseBlockedImages', () => {
	it('gives an empty list for what is absent or cannot be read', () => {
		expect(parseBlockedImages(undefined)).toEqual([])
		expect(parseBlockedImages('{')).toEqual([])
		expect(parseBlockedImages('null')).toEqual([])
		expect(parseBlockedImages('{"service":"web"}')).toEqual([])
	})

	it('keeps only objects, and always gives them a list of added vulnerabilities', () => {
		expect(parseBlockedImages('[1,{}]')).toEqual([{ added: [] }])
		expect(parseBlockedImages('[{"added":"CVE-1"}]')).toEqual([{ added: [] }])
	})

	it('reads what the box published', () => {
		const added = [{ id: 'CVE-2026-1234', package: 'openssl', fixed: '3.0.15', title: 'overflow', url: 'https://avd.aquasec.com/nvd/cve-2026-1234' }]
		const raw = JSON.stringify([{ service: 'jellyfin', image: 'jellyfin/jellyfin:latest', repo_digests: [], id: 'sha256:ab', current: 1, candidate: 3, added }])

		expect(parseBlockedImages(raw)).toEqual([{ service: 'jellyfin', image: 'jellyfin/jellyfin:latest', repo_digests: [], id: 'sha256:ab', current: 1, candidate: 3, added }])
	})
})

describe('moreCritical', () => {
	it('adds up what each image gained, and nothing it lost or kept', () => {
		expect(moreCritical([{ current: 1, candidate: 3 }, { current: 2, candidate: 2 }])).toBe(2)
		expect(moreCritical([{ current: 4, candidate: 1 }, { current: 0, candidate: 1 }])).toBe(1)
		expect(moreCritical([{ added: [] }])).toBe(0)
		expect(moreCritical([])).toBe(0)
	})
})

describe('safeUrl', () => {
	it('keeps an https address and nothing else', () => {
		expect(safeUrl('javascript:alert(1)')).toBe('')
		expect(safeUrl('http://avd.aquasec.com/nvd/cve-2026-1234')).toBe('')
		expect(safeUrl(undefined)).toBe('')
		expect(safeUrl('https://avd.aquasec.com/nvd/cve-2026-1234')).toBe('https://avd.aquasec.com/nvd/cve-2026-1234')
	})
})
