import { describe, expect, it } from 'vitest'
import { endpointUrl, isLocalHost } from './address'

describe('the address an assistant connects to', () => {
	const origin = 'https://box.example.com'

	it('takes the box\'s own answer when it is the endpoint on http or https', () => {
		expect(endpointUrl('http://192.168.1.20/v2/mcp/server', origin)).toBe('http://192.168.1.20/v2/mcp/server')
		expect(endpointUrl('https://nas.local:8443/v2/mcp/server', origin)).toBe('https://nas.local:8443/v2/mcp/server')
	})

	it.each([
		['javascript:alert(1)'],
		['ftp://192.168.1.20/v2/mcp/server'],
		['http://x/other'],
		['http://x/v2/mcp/server/'],
		['http://a b/v2/mcp/server'],
		['http://x/v2/mcp/server" ; rm -rf ~ "'],
		['http://x/v2/mcp/server`id`'],
		['http://x/v2/mcp/server$HOME'],
		['http://x/v2/mcp/server\nrm'],
		['http://x/v2/mcp/server?a=1'],
		['not a url'],
		[''],
		[42],
		[null],
		[undefined],
		[{ href: 'http://x/v2/mcp/server' }],
	])('falls back to the origin for %j', (value) => {
		expect(endpointUrl(value, origin)).toBe('https://box.example.com/v2/mcp/server')
	})

	it.each([
		['localhost', true],
		['127.0.0.1', true],
		['127.9.9.9', true],
		['10.1.2.3', true],
		['172.16.0.1', true],
		['172.31.255.255', true],
		['192.168.1.20', true],
		['100.64.0.1', true],
		['100.127.255.255', true],
		['casaos.local', true],
		['nas.lan', true],
		['box.home', true],
		['x.internal', true],
		['nas', true],
		['[::1]', true],
		['172.32.0.1', false],
		['172.15.0.1', false],
		['100.128.0.1', false],
		['100.63.0.1', false],
		['192.169.1.1', false],
		['11.0.0.1', false],
		['example.com', false],
		['box.example.com', false],
		['8.8.8.8', false],
		['localhost.example.com', false],
	])('says whether %s is obviously local: %s', (host, local) => {
		expect(isLocalHost(host)).toBe(local)
	})
})
