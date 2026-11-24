// The address of the MCP endpoint an assistant is given.
const PATH = '/v2/mcp/server'

// The whole string, nothing else: the value ends up in a command the owner pastes into a terminal,
// so it is matched against what the box can say, never filtered for what it must not say.
const LAN_URL = /^https?:\/\/(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})(?::([1-9]\d{0,4}))?\/v2\/mcp\/server$/

// 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 and 100.64.0.0/10 (shared address space, Tailscale included)
export function isPrivateIPv4(a, b) {
	return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
}

// The box's own answer (`lan_url` of the module's status) when it is a plain address on a private
// network, else null. What is returned is the string itself, which is its own canonical form.
export function lanEndpoint(lanUrl) {
	const match = typeof lanUrl === 'string' ? LAN_URL.exec(lanUrl) : null
	if (!match) {
		return null
	}
	const octets = match.slice(1, 5).map(Number)
	const port = match[5] === undefined ? 1 : Number(match[5])
	return octets.every(n => n <= 255) && port <= 65535 && isPrivateIPv4(octets[0], octets[1]) ? lanUrl : null
}

// What the assistant is given: the box's own answer, else the address the dashboard is open at.
export function endpointUrl(lanUrl, origin) {
	return lanEndpoint(lanUrl) ?? `${origin}${PATH}`
}

// Whether a host name is obviously on a local network: a private or loopback IPv4 address, a local
// suffix, a name with no dot, or the IPv6 loopback. Any other IPv6 literal is not, so the page
// then says its address may not work (the safe side).
export function isLocalHost(hostname) {
	const host = String(hostname ?? '').toLowerCase().replace(/\.$/, '')
	if (host === '') {
		return false
	}
	if (host.startsWith('[')) {
		return host === '[::1]'
	}
	const ip = host.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/)
	if (ip) {
		return Number(ip[1]) === 127 || isPrivateIPv4(Number(ip[1]), Number(ip[2]))
	}
	return !host.includes('.') || /\.(?:local|lan|home|internal)$/.test(host)
}
