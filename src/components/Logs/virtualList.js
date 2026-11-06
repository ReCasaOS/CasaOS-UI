// The window of a fixed-height list: the rows to render, overscan included; the rest are spacers.
export function visibleRange(scrollTop, viewport, rowHeight, count, overscan) {
	const shown = Math.ceil(viewport / rowHeight)
	// a scrollTop past the end (the list just shrank) still shows the last rows
	const first = Math.min(Math.floor(scrollTop / rowHeight), Math.max(0, count - shown))
	return { start: Math.max(0, first - overscan), end: Math.min(count, first + shown + overscan) }
}
