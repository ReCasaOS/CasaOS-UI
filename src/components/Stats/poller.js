// A polling chain: ask, wait for the answer, wait intervalMs, ask again. One request in flight, nothing asked while the tab is hidden.
export function createPoller({ run, intervalMs = 5000, isHidden = () => document.hidden }) {
	let timer = null
	let flying = false
	let again = false
	let active = false
	let generation = 0

	const clear = () => {
		clearTimeout(timer)
		timer = null
	}

	function schedule() {
		clear()
		if (active && !isHidden()) {
			timer = setTimeout(ask, intervalMs)
		}
	}

	async function ask() {
		clear()
		if (flying) {
			again = true
			return
		}
		flying = true
		const mine = generation
		try {
			await run()
		} catch {
			// a failed ask is the caller's to show; the chain goes on
		}
		if (mine !== generation) {
			return
		}
		flying = false
		if (again) {
			again = false
			ask()
		} else {
			schedule()
		}
	}

	return {
		start() {
			if (active) {
				return
			}
			active = true
			if (!isHidden()) {
				ask()
			}
		},
		stop() {
			active = false
			generation++
			flying = false
			again = false
			clear()
		},
		now() {
			if (active && !isHidden()) {
				ask()
			}
		},
		visibilityChanged() {
			if (!active) {
				return
			}
			if (isHidden()) {
				clear()
			} else {
				ask()
			}
		},
	}
}
