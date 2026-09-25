import { describe, expect, it } from 'vitest'
import { findSyncthing } from './syncthingApp'

const homepage = { name: 'big-bear-homepage', image: 'ghcr.io/gethomepage/homepage:v2.4.0', port: '3000', status: 'running' }
const syncthing = { name: 'syncthing', image: 'linuxserver/syncthing:1.29', port: '8384', status: 'running' }

describe('findSyncthing', () => {
	it('is null when Syncthing is not installed', () => {
		expect(findSyncthing([homepage])).toBe(null)
		expect(findSyncthing(undefined)).toBe(null)
	})

	it('finds it by its image, and says whether it runs', () => {
		expect(findSyncthing([homepage, syncthing])).toEqual({ name: 'syncthing', port: '8384', running: true })
		expect(findSyncthing([{ ...syncthing, status: 'exited' }]).running).toBe(false)
	})

	it('prefers the one on the usual port', () => {
		const other = { ...syncthing, name: 'syncthing-2', port: '18384' }
		expect(findSyncthing([other, syncthing]).name).toBe('syncthing')
		expect(findSyncthing([other]).port).toBe('18384')
	})
})
