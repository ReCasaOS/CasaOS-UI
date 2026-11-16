// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import sync from './sync.js'
import backup from './backup.js'
import { instance } from './service.js'

vi.mock('@/router', () => ({ default: { replace() {} } }))
vi.mock('@/store', () => ({ default: { commit() {} } }))

const adapter = vi.fn(config => Promise.resolve({ data: { data: {} }, status: 200, statusText: 'OK', headers: {}, config }))
instance.defaults.adapter = adapter

const sent = () => adapter.mock.calls[0][0]

describe('the sync calls', () => {
	beforeEach(() => adapter.mockClear())

	it('reads the tasks', async () => {
		await sync.getTasks()
		expect(sent().method).toBe('get')
		expect(sent().url).toBe('/v2/app_management/sync/tasks')
	})

	it('saves the whole list under tasks', async () => {
		await sync.saveTasks([{ id: 'a' }])
		expect(sent().method).toBe('put')
		expect(sent().url).toBe('/v2/app_management/sync/tasks')
		expect(JSON.parse(sent().data)).toEqual({ tasks: [{ id: 'a' }] })
	})

	it.each([
		['run', 'run'],
		['firstPass', 'first-pass'],
		['confirmDeletes', 'confirm-deletes'],
	])('posts %s to the task by its encoded id', async (method, tail) => {
		await sync[method]('t 1')
		expect(sent().method).toBe('post')
		expect(sent().url).toBe(`/v2/app_management/sync/tasks/t%201/${tail}`)
	})
})

describe('listing the folders of a destination', () => {
	beforeEach(() => adapter.mockClear())

	it('asks for one level, the name encoded and the path in the query', async () => {
		await backup.getFolders('my nas', '/Photos')
		expect(sent().method).toBe('get')
		expect(sent().url).toBe('/v2/app_management/backup/destinations/my%20nas/folders')
		expect(sent().params).toEqual({ path: '/Photos' })
	})
})
