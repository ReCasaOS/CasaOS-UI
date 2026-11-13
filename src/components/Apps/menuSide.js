// Below the card when the menu fits there, otherwise the side with more room.
// When it fits on neither side, maxHeight caps it to that room (the menu then
// scrolls) so its last entries, Uninstall among them, stay reachable.
export function menuPlace(above, below, height) {
	const side = below > height + 8 || below >= above ? 'bottom' : 'top'
	const room = (side === 'bottom' ? below : above) - 12
	return { side, maxHeight: room < height ? Math.max(room, 120) : null }
}

// The side of a card its tip goes: the one with more room. Never left or right, where it would hide the next card.
export function tipSide(above, below) {
	return above < below ? 'is-bottom' : 'is-top'
}
