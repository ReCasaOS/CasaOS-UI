// An IPv4 or IPv6 address, or a CIDR, by the core's rule: a bare zoned address is not accepted here (the core takes it; refusing it is safe), no leading zero in an IPv4 octet, and an IPv4-mapped
// prefix (::ffff:a.b.c.d/n) is refused (a bare mapped address is fine).
function v4(s) {
	const p = s.split('.')
	return p.length === 4 && p.every(x => /^(?:0|[1-9]\d{0,2})$/.test(x) && +x <= 255)
}

// the 8 groups of an IPv6 address, or null
function v6(s) {
	if (!/^[0-9a-f:.]+$/i.test(s)) {
		return null
	}
	let embedded = null
	const last = s.slice(s.lastIndexOf(':') + 1)
	if (last.includes('.')) {
		if (!v4(last)) {
			return null
		}
		const b = last.split('.').map(Number)
		embedded = [b[0] * 256 + b[1], b[2] * 256 + b[3]]
		s = `${s.slice(0, s.length - last.length)}0:0`
	}
	const halves = s.split('::')
	if (halves.length > 2) {
		return null
	}
	const part = h => (h === '' ? [] : h.split(':'))
	const [head, tail] = [part(halves[0]), part(halves[1] ?? '')]
	const groups = [...head, ...tail]
	if (!groups.every(g => /^[0-9a-f]{1,4}$/i.test(g)) || (halves.length === 1 ? groups.length !== 8 : groups.length > 7)) {
		return null
	}
	const all = [...head, ...Array(8 - groups.length).fill('0'), ...tail].map(g => Number.parseInt(g, 16))
	if (embedded) {
		all.splice(6, 2, ...embedded)
	}
	return all
}

export function validAddress(line) {
	const [addr, bits, ...more] = line.split('/')
	if (more.length || (bits !== undefined && !/^(?:0|[1-9]\d{0,2})$/.test(bits))) {
		return false
	}
	if (v4(addr)) {
		return bits === undefined || +bits <= 32
	}
	const g = v6(addr)
	if (!g) {
		return false
	}
	const mapped = g.slice(0, 5).every(x => x === 0) && g[5] === 0xFFFF
	return bits === undefined || (+bits <= 128 && !mapped)
}

// the lines of a textarea: trimmed, empty ones dropped
export const lines = text => text.split('\n').map(l => l.trim()).filter(Boolean)
