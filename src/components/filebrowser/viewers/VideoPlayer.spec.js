// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VideoPlayer from './VideoPlayer.vue'

const created = []
vi.mock('artplayer', () => ({
	default: class {
		constructor(option) {
			this.option = option
			this.subtitle = { switch: vi.fn(), show: true }
			created.push(this)
		}
	},
}))
vi.mock('music-metadata', () => ({ parseWebStream: vi.fn() }))

const file = name => ({ name, path: `/DATA/Media/${name}`, is_dir: false })

function player(list, locale = 'fr_FR') {
	const vm = {
		item: file('Movie.mkv'),
		list,
		destroyed: false,
		$refs: { artRef: {} },
		$i18n: { locale },
		$t: s => s,
		getFileUrl: item => `/v3/file?path=${item.path}`,
	}
	vm.createPlayer = VideoPlayer.methods.createPlayer.bind(vm)
	return vm
}

describe('the Files video player', () => {
	beforeEach(() => {
		created.length = 0
	})

	it('shows the subtitle named after the video, and lists the folder\'s others', async () => {
		const vm = player([file('Movie.mkv'), file('Movie.srt'), file('Other.vtt')])
		await vm.createPlayer()

		const { option } = created[0]
		expect(option.subtitle).toEqual({ url: '/v3/file?path=/DATA/Media/Movie.srt', type: 'srt', name: 'Movie.srt' })
		const [menu] = option.settings
		expect(menu.selector.map(o => [o.html, Boolean(o.default)])).toEqual([
			['No subtitles', false],
			['Movie.srt', true],
			['Other.vtt', false],
		])

		menu.onSelect(menu.selector[2])
		expect(created[0].subtitle.switch).toHaveBeenCalledWith('/v3/file?path=/DATA/Media/Other.vtt', { type: 'vtt', name: 'Other.vtt' })
		menu.onSelect(menu.selector[0])
		expect(created[0].subtitle.show).toBe(false)
	})

	it('has no subtitle menu and no subtitle without subtitle files', async () => {
		const vm = player([file('Movie.mkv')], 'en_US')
		await vm.createPlayer()

		const { option } = created[0]
		expect(option.settings).toEqual([])
		expect('subtitle' in option).toBe(false)
		expect(option.lang).toBe('en')
		expect('i18n' in option).toBe(false)
	})

	it('speaks the dashboard\'s language where ArtPlayer has it', async () => {
		await player([]).createPlayer()
		expect(created[0].option.lang).toBe('fr')
		expect(created[0].option.i18n.fr.Close).toBe('Fermer')
	})

	it('makes no player once closed while its language loaded', async () => {
		const vm = player([])
		vm.destroyed = true
		await vm.createPlayer()
		expect(created).toHaveLength(0)
	})
})
