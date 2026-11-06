import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dockerLocationApi } from './dockerLocation'
import DockerLocationModal from './DockerLocationModal.vue'

vi.mock('./dockerLocation', () => ({
	dockerLocationApi: { get: vi.fn(), move: vi.fn(), deleteOldCopy: vi.fn(), check: vi.fn() },
}))
vi.mock('@/components/VirtualMachines/PathPicker.vue', () => ({ default: {} }))

const ok = data => Promise.resolve({ data: { success: 200, data } })
// what axios throws when the box takes longer than its timeout: no response
const timeout = () => Promise.reject(Object.assign(new Error('timeout of 60000ms exceeded'), { code: 'ECONNABORTED' }))
const refused = (message, data) => Promise.reject(Object.assign(new Error('400'), { response: { status: 400, data: { success: 4000, message, data } } }))

// the modal's methods on a plain object, with its computed isMoving
function modal() {
	const vm = {
		state: {},
		busy: false,
		deleting: false,
		justDone: false,
		timer: 0,
		target: '',
		check: null,
		current: {},
		$t: s => s,
		$buefy: {
			toast: { open: vi.fn() },
			// the confirmation is answered yes at once
			dialog: { confirm: vi.fn(({ onConfirm }) => { vm.confirmed = onConfirm() }) },
		},
	}
	Object.defineProperty(vm, 'isMoving', { get: () => DockerLocationModal.computed.isMoving.call(vm) })
	for (const name of ['refresh', 'start', 'deleteOld'])
		vm[name] = DockerLocationModal.methods[name].bind(vm)
	return vm
}

describe('the Docker data dialog', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.clearAllMocks()
		dockerLocationApi.check.mockImplementation(() => ok({}))
	})

	// CheckTarget can take longer than the POST's timeout: the box moves anyway
	it('follows a move whose POST timed out, and says no error', async () => {
		dockerLocationApi.move.mockImplementation(timeout)
		dockerLocationApi.get.mockImplementation(() => ok({ phase: 'copying', target: '/DATA/docker' }))
		const vm = modal()

		await vm.start('/DATA/docker')

		expect(dockerLocationApi.get).toHaveBeenCalled()
		expect(vm.isMoving).toBe(true)
		expect(vm.$buefy.toast.open).not.toHaveBeenCalled()
		expect(vm.busy).toBe(false)
		clearTimeout(vm.timer)
	})

	it('says why when the box refused the move', async () => {
		dockerLocationApi.move.mockImplementation(() => refused('the folder does not exist'))
		dockerLocationApi.get.mockImplementation(() => ok({ phase: 'done' }))
		const vm = modal()

		await vm.start('/DATA/nope')

		expect(vm.isMoving).toBe(false)
		expect(vm.$buefy.toast.open).toHaveBeenCalledWith(expect.objectContaining({ message: 'the folder does not exist', type: 'is-danger' }))
	})

	it('says the delete goes on when its answer timed out, and asks again', async () => {
		dockerLocationApi.deleteOldCopy.mockImplementation(timeout)
		dockerLocationApi.get.mockImplementation(() => ok({ phase: 'done', old_copy: ['/var/lib/docker.casaos-old'] }))
		const vm = modal()

		vm.deleteOld()
		await vm.confirmed

		expect(vm.$buefy.toast.open).toHaveBeenCalledWith(expect.objectContaining({ type: 'is-info' }))
		expect(vm.$buefy.toast.open).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'is-danger' }))
		expect(dockerLocationApi.get).toHaveBeenCalled()
		expect(vm.deleting).toBe(false)
	})

	it('says why when the box refused the delete', async () => {
		dockerLocationApi.deleteOldCopy.mockImplementation(() => refused('a move is under way', { phase: 'copying' }))
		const vm = modal()

		vm.deleteOld()
		await vm.confirmed

		expect(vm.$buefy.toast.open).toHaveBeenCalledWith(expect.objectContaining({ message: 'a move is under way', type: 'is-danger' }))
		expect(vm.state.phase).toBe('copying')
		expect(vm.deleting).toBe(false)
	})
})

// a move goes from the default place to a folder, or back: never folder to folder
describe('the Docker data dialog, once the data is in a folder', () => {
	it('offers only the way back', async () => {
		const { readFileSync } = await import('node:fs')
		const source = readFileSync('src/components/settings/DockerLocationModal.vue', 'utf8')
		expect(source).toMatch(/<b-field v-if="!state\.location" :label="\$t\('Move to'\)"/)
		expect(source).toMatch(/<b-button v-if="!state\.location"[^>]*@click="move\(target\)">/)
		expect(source).toMatch(/<b-button v-if="state\.location"[^>]*@click="moveBack">/)
	})
})
