// Subtitles for the Files video player: the subtitle files in the video's
// folder, those named after the video first.

export const SUBTITLE_TYPES = ['srt', 'vtt', 'ass']

function split(name) {
	const dot = name.lastIndexOf('.')
	return dot > 0 ? [name.slice(0, dot), name.slice(dot + 1).toLowerCase()] : [name, '']
}

// The subtitle files among list (the folder's items), as { name, path, type,
// named }: movie.srt and movie.en.srt for movie.mkv come first (named after
// the video), in that order, then the folder's other subtitle files by name.
export function subtitlesFor(video, list = []) {
	const [base] = split(video.name)
	const rank = (name) => {
		const [stem] = split(name)
		if (stem === base)
			return 0
		return stem.startsWith(`${base}.`) ? 1 : 2
	}
	return list
		.filter(item => !item.is_dir && SUBTITLE_TYPES.includes(split(item.name)[1]))
		.map(item => ({ name: item.name, path: item.path, type: split(item.name)[1], rank: rank(item.name) }))
		.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
		.map(({ rank, ...subtitle }) => ({ ...subtitle, named: rank < 2 }))
}

// The one shown at start: a file named after the video, none otherwise.
export function defaultSubtitle(subtitles) {
	return subtitles.find(subtitle => subtitle.named)
}

// ArtPlayer's language for the dashboard's (zh_CN, fr_FR…): its own names
// for Chinese, the language part otherwise.
const PLAYER_LANGS = ['ar', 'cs', 'es', 'fa', 'fr', 'id', 'pl', 'ru', 'tr', 'vi']

export function playerLang(locale = 'en_US') {
	const lower = locale.toLowerCase().replace('_', '-')
	if (lower === 'zh-cn' || lower === 'zh-tw')
		return lower
	const lang = lower.split('-')[0]
	return PLAYER_LANGS.includes(lang) ? lang : 'en'
}
