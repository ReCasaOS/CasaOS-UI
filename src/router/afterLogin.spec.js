import { describe, expect, it } from 'vitest'
import { afterLogin } from './afterLogin'

describe('afterLogin', () => {
	it('goes back to the page the guard turned away', () => {
		expect(afterLogin('/terminal')).toBe('/terminal')
		expect(afterLogin('/files?path=/DATA')).toBe('/files?path=/DATA')
		// what vue-router puts in the query for a folder with a space
		expect(afterLogin('/files?path=%2FDATA%2FMy%20Folder')).toBe('/files?path=%2FDATA%2FMy%20Folder')
		// slashes later on are no other host
		expect(afterLogin('/files?path=//DATA')).toBe('/files?path=//DATA')
		expect(afterLogin('/files#/DATA')).toBe('/files#/DATA')
	})

	it('goes to the dashboard with nothing to go back to', () => {
		expect(afterLogin(undefined)).toBe('/')
		expect(afterLogin(null)).toBe('/')
		expect(afterLogin('')).toBe('/')
		expect(afterLogin(['/terminal'])).toBe('/')
		expect(afterLogin({ path: '/terminal' })).toBe('/')
		expect(afterLogin(`/${'a'.repeat(3000)}`)).toBe('/')
	})

	describe('never leaves the dashboard for another site', () => {
		it.each([
			// another host, as written
			'//evil.example',
			'//evil.example/x',
			'///evil.example',
			'/\\evil.example',
			'/\\/evil.example',
			'\\\\evil.example',
			'\\/evil.example',
			// absolute addresses and schemes
			'https://evil.example',
			'http://evil.example/terminal',
			'HTTPS://evil.example',
			'javascript:alert(1)',
			'data:text/html,hi',
			'evil.example',
			'terminal',
			// tabs, newlines and spaces that URL parsers drop
			'/\t/evil.example',
			'/\n/evil.example',
			'/\r\n/evil.example',
			' //evil.example',
			'/ /evil.example',
			'\u0000//evil.example',
			// percent-encoded, once and twice
			'/%2Fevil.example',
			'/%2fevil.example',
			'%2F%2Fevil.example',
			'/%5Cevil.example',
			'/%5cevil.example',
			'/%09/evil.example',
			'/%0A/evil.example',
			'/%20/evil.example',
			'/%252Fevil.example',
			'/%25252Fevil.example',
			'%252F%252Fevil.example',
			'https%3A%2F%2Fevil.example',
			// broken encodings
			'/%',
			'/%E0%A4%A',
		])('%j', (redirect) => {
			expect(afterLogin(redirect)).toBe('/')
		})
	})

	it('does not loop back to the login or log out again', () => {
		expect(afterLogin('/login')).toBe('/')
		expect(afterLogin('/login/')).toBe('/')
		expect(afterLogin('/LOGIN')).toBe('/')
		expect(afterLogin('/login?redirect=/terminal')).toBe('/')
		expect(afterLogin('/%6Cogin')).toBe('/')
		expect(afterLogin('/logout')).toBe('/')
		expect(afterLogin('/logout#x')).toBe('/')
	})
})
