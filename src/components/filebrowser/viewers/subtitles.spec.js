import { describe, expect, it } from 'vitest'
import { defaultSubtitle, playerLang, subtitlesFor } from './subtitles'

const file = name => ({ name, path: `/DATA/Media/${name}`, is_dir: false })

describe('subtitles next to a video', () => {
	const video = file('Movie.2024.mkv')

	it('lists the folder\'s subtitle files, those named after the video first', () => {
		const list = [
			file('Movie.2024.mkv'),
			file('Other.srt'),
			file('Movie.2024.fr.SRT'),
			file('Movie.2024.vtt'),
			file('Movie.2024.ass'),
			file('notes.txt'),
			{ name: 'subs.srt', path: '/DATA/Media/subs.srt', is_dir: true },
		]
		expect(subtitlesFor(video, list).map(s => [s.name, s.type, s.named])).toEqual([
			['Movie.2024.ass', 'ass', true],
			['Movie.2024.vtt', 'vtt', true],
			['Movie.2024.fr.SRT', 'srt', true],
			['Other.srt', 'srt', false],
		])
	})

	it('shows one named after the video at start, none otherwise', () => {
		expect(defaultSubtitle(subtitlesFor(video, [file('Movie.2024.srt'), file('A.srt')]))?.name).toBe('Movie.2024.srt')
		expect(defaultSubtitle(subtitlesFor(video, [file('A.srt')]))).toBeUndefined()
		expect(defaultSubtitle(subtitlesFor(video, []))).toBeUndefined()
	})

	it('does not take Movie.2024x.srt for Movie.2024.mkv', () => {
		expect(subtitlesFor(video, [file('Movie.2024x.srt')])[0].named).toBe(false)
	})
})

describe('the player\'s language', () => {
	it('follows the dashboard where ArtPlayer has it, English otherwise', () => {
		expect(playerLang('fr_FR')).toBe('fr')
		expect(playerLang('zh_CN')).toBe('zh-cn')
		expect(playerLang('zh_TW')).toBe('zh-tw')
		expect(playerLang('de_DE')).toBe('en')
		expect(playerLang('en_US')).toBe('en')
		expect(playerLang(undefined)).toBe('en')
	})
})
