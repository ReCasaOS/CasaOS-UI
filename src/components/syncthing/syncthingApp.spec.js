import { describe, expect, it } from 'vitest'
import { findSyncthing } from './syncthingApp'

const homepage = { name: 'big-bear-homepage', app_type: 'v2app', image: 'ghcr.io/gethomepage/homepage:v2.4.0', port: '3000', status: 'running' }
const syncthing = { name: 'syncthing', app_type: 'v2app', image: 'linuxserver/syncthing:1.29', port: '8384', index: '/', status: 'running' }
// `docker run -p 8384:8384 syncthing/syncthing`: the grid names it by its container
// id and, without the casaos label, gives it no port.
const container = { name: '3f9c2a1b7d4e', app_type: 'container', image: 'syncthing/syncthing', status: 'running' }

describe('findSyncthing', () => {
	it('is null when Syncthing is not installed', () => {
		expect(findSyncthing([homepage])).toBe(null)
		expect(findSyncthing(undefined)).toBe(null)
	})

	it('finds it by its image, and says whether it runs', () => {
		expect(findSyncthing([homepage, syncthing], '10.0.0.2')).toEqual({
			name: 'syncthing',
			port: '8384',
			running: true,
			startable: true,
			url: 'http://10.0.0.2:8384/',
		})
		expect(findSyncthing([{ ...syncthing, status: 'exited' }]).running).toBe(false)
	})

	it('prefers the one on the usual port', () => {
		const other = { ...syncthing, name: 'syncthing-2', port: '18384' }
		expect(findSyncthing([other, syncthing]).name).toBe('syncthing')
		expect(findSyncthing([other]).port).toBe('18384')
	})

	it('prefers the App Store install, the only one it can start', () => {
		const v1app = { ...container, app_type: 'v1app', port: '8384', status: 'exited' }
		expect(findSyncthing([v1app, { ...syncthing, port: '18384' }]).name).toBe('syncthing')
		expect(findSyncthing([v1app])).toMatchObject({ name: v1app.name, running: false, startable: false })
		expect(findSyncthing([container]).startable).toBe(false)
	})

	it('has nothing to open without a port, unless it has a hostname of its own', () => {
		expect(findSyncthing([container], '10.0.0.2').url).toBe('')
		expect(findSyncthing([{ ...syncthing, port: '' }], '10.0.0.2').url).toBe('')
		expect(findSyncthing([{ ...syncthing, port: '', scheme: 'https', hostname: 'sync.example.org' }], '10.0.0.2').url).toBe('https://sync.example.org/')
	})

	it('opens the Web UI set for the app, like the app card', () => {
		const proxied = { ...syncthing, scheme: 'https', hostname: 'sync.example.org', port: '443', index: '/sync/' }
		expect(findSyncthing([proxied], '10.0.0.2').url).toBe('https://sync.example.org:443/sync/')
		expect(findSyncthing([{ ...syncthing, index: '' }], '10.0.0.2').url).toBe('http://10.0.0.2:8384')
	})
})
