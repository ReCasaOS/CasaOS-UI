// Buefy has no stack of modals: every one that is open and takes Escape hears
// the key, so a single press closed the picker, the form under it and the page
// under that, and what was typed in was lost.
//
// The modals that open others (the page, the create form, the settings) do not
// hand Escape to Buefy. They take it here, and only while no other modal is
// open above them, whoever opened that one. The modals that open nothing keep
// Buefy's own Escape: when one is open it is the one on top.

let opened = 0

// The modal is on top when it is the last one on screen. Buefy appends each
// to the body as it opens, and one that is leaving stays in the page, shown,
// until its animation ends.
function isOnTop(mark) {
	const shown = [...document.querySelectorAll('.modal.is-active')].filter(modal => modal.style.display !== 'none')
	return shown[shown.length - 1]?.classList.contains(mark) === true
}

// buefy.modal.open(options), with Escape closing the modal when it is on top.
export function openWithEscape(buefy, options) {
	// how to find the modal in the page: Buefy does not say which element it is
	const mark = `vm-escape-${++opened}`
	let modal
	const onKey = (e) => {
		if ((e.key === 'Escape' || e.key === 'Esc') && isOnTop(mark)) {
			// The component hears it first, as a cancelable vm-escape on its root:
			// one that must not close yet (an upload runs) says so, and asks.
			const root = document.querySelector(`.${mark} .animation-content > *`)
			if (!root || root.dispatchEvent(new CustomEvent('vm-escape', { cancelable: true }))) {
				modal.close()
			}
		}
	}
	document.addEventListener('keyup', onKey)
	modal = buefy.modal.open({
		...options,
		canCancel: [],
		customClass: [options.customClass, mark].filter(Boolean).join(' '),
		onClose: () => document.removeEventListener('keyup', onKey),
	})
	return modal
}
