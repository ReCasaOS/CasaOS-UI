import { describe, expect, it } from 'vitest'
import { LOGIN_STYLE_KEY, cacheLoginStyle, cachedLoginStyle, loginStyleOf } from './loginStyle'

function memory(initial = {}) {
	const data = { ...initial }
	return {
		getItem: k => (k in data ? data[k] : null),
		setItem: (k, v) => { data[k] = String(v) },
		data,
	}
}

const status = login_style => ({ data: { success: 200, data: { initialized: true, login_style } } })

describe('the login style', () => {
	it('is classic unless the box says beta', () => {
		expect(loginStyleOf(status('beta'))).toBe('beta')
		expect(loginStyleOf(status('classic'))).toBe('classic')
		// a user service from before the setting says nothing
		expect(loginStyleOf(status(undefined))).toBe('classic')
		expect(loginStyleOf(status('zima'))).toBe('classic')
		expect(loginStyleOf(undefined)).toBe('classic')
	})

	it('is kept in this browser, and anything odd there is classic', () => {
		const s = memory()
		expect(cachedLoginStyle(s)).toBe('classic')
		cacheLoginStyle('beta', s)
		expect(s.data[LOGIN_STYLE_KEY]).toBe('beta')
		expect(cachedLoginStyle(s)).toBe('beta')
		cacheLoginStyle('<script>', s)
		expect(cachedLoginStyle(s)).toBe('classic')
		expect(cachedLoginStyle(memory({ [LOGIN_STYLE_KEY]: 'other' }))).toBe('classic')
	})

	it('survives a browser that keeps nothing', () => {
		const denied = () => {
			throw new Error('denied')
		}
		const broken = { getItem: denied, setItem: denied }
		expect(cachedLoginStyle(broken)).toBe('classic')
		expect(() => cacheLoginStyle('beta', broken)).not.toThrow()
	})
})
