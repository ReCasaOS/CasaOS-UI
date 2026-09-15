// The widgets in the sidebar, in the order somebody chose.
//
// The saved list used to be rebuilt in the order the dashboard ships its widgets,
// keeping only each one's visibility, and written back over what was saved: an
// order could never survive a reload. The saved order wins now. A widget the saved
// list does not name, one a newer version added, goes at the end as shipped; one
// this dashboard no longer ships, or a name saved twice, is dropped.
export function combineWidgetSettings(shipped, saved) {
	const known = new Map(shipped.map(widget => [widget.name, widget]))
	const kept = []
	for (const widget of Array.isArray(saved) ? saved : []) {
		if (!widget || !known.has(widget.name) || kept.some(k => k.name === widget.name))
			continue
		kept.push({ name: widget.name, show: typeof widget.show === 'boolean' ? widget.show : known.get(widget.name).show })
	}

	const added = shipped
		.filter(widget => !kept.some(k => k.name === widget.name))
		.map(widget => ({ name: widget.name, show: widget.show }))

	return [...kept, ...added]
}

// The list with the widget at `index` moved `offset` places, for the arrow keys on
// a drag handle; the list itself when the move would leave it.
export function moveWidget(list, index, offset) {
	const target = index + offset
	if (target < 0 || target >= list.length)
		return list

	const moved = [...list]
	const [widget] = moved.splice(index, 1)
	moved.splice(target, 0, widget)

	return moved
}
