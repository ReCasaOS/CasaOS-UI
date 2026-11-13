// Below the card when the menu fits there, otherwise the side with more room.
// When it fits on neither side, maxHeight caps it to that room (the menu then
// scrolls) so its last entries, Uninstall among them, stay reachable.
export function menuPlace(above, below, height) {
	const side = below > height + 8 || below >= above ? 'bottom' : 'top'
	const room = (side === 'bottom' ? below : above) - 12
	return { side, maxHeight: room < height ? Math.max(room, 120) : null }
}
