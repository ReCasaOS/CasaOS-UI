import { describe, expect, it } from 'vitest'
import { isWidgetId, listedWidgets } from './ids'

describe('the id of an API widget', () => {
	it('is 8 characters a-z0-9, and nothing else', () => {
		expect(isWidgetId('ab12cd34')).toBe(true)
		for (const id of ['AB12CD34', 'ab12cd3', 'ab12cd345', '../../ab', 'ab12cd3\n', '', null, undefined, 12345678, ['ab12cd34']])
			expect(isWidgetId(id)).toBe(false)
	})

	it('keeps of a list the widgets with such an id, each once, the first one', () => {
		const first = { id: 'ab12cd34', n: 1 }
		expect(listedWidgets([null, 'x', { id: '../../x' }, first, { id: 'ab12cd34', n: 2 }, { id: 'zz99zz99' }])).toEqual([first, { id: 'zz99zz99' }])
		expect(listedWidgets(undefined)).toEqual([])
		expect(listedWidgets({ id: 'ab12cd34' })).toEqual([])
	})
})
