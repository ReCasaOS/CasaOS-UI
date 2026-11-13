import { describe, expect, it } from 'vitest'
import { lines, validAddress } from './guardIp'

describe('the address rule of the core', () => {
	it.each(['192.0.2.1', '192.0.2.0/24', '0.0.0.0/0', '::1', '2001:db8::/32', 'fe80::1:2', '::ffff:1.2.3.4', '1:2:3:4:5:6:1.2.3.4', '::', '2001:db8::1/128'])('accepts %s', (a) => {
		expect(validAddress(a)).toBe(true)
	})

	it.each(['300.1.1.1', '1.2.3', '1.2.3.4/33', '01.2.3.4', '1.2.3.4/', '::1/129', '1.2.3.4/08', '1.2.3.4/024', '::1/00', '1.2.3.4/+8', '1::2::3', 'fe80::1%eth0', '::ffff:1.2.3.4/120', 'abc', '', '1.2.3.4/8/8', '12345::1', '1:2:3:4:5:6:7', ':1::'])('refuses %s', (a) => {
		expect(validAddress(a)).toBe(false)
	})

	it('splits lines', () => {
		expect(lines(' a \n\n b\n')).toEqual(['a', 'b'])
	})
})
