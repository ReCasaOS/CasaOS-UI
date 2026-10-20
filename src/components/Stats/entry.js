// What the rest of the dashboard knows about Statistics: the name of its card, and how to open the page. The page itself
// (and apexcharts with it) is loaded on demand.
import { defineAsyncComponent } from 'vue'
import { openWithEscape } from '@/components/VirtualMachines/modalStack'
import { STATS_LAUNCH_ID, builtinOpensInNewTab } from '@/mixins/app/appLaunchPreference'

const StatsPage = defineAsyncComponent(() => import('./StatsPage.vue'))

// The name of the card in the app grid, which also keeps its place in the saved order.
export const STATS_APP_NAME = 'Statistics'

// Opens the page in a modal, or on a tab of its own when the App launching setting sends apps, or this one, to a new tab.
// `item` is the id of the item to show first, or 'source|id' when the caller knows the source too.
export function openStatistics(buefy, state, { item } = {}) {
	// a window already on screen is the one to use: it shows the item asked for and takes the focus
	const open = document.querySelector('.stats-modal.is-active .stats-page')
	if (open && !builtinOpensInNewTab(STATS_LAUNCH_ID, state)) {
		if (item) {
			window.dispatchEvent(new CustomEvent('stats-open-item', { detail: item }))
		}
		open.querySelector('h3')?.focus({ preventScroll: true })
		return null
	}

	if (builtinOpensInNewTab(STATS_LAUNCH_ID, state)) {
		const query = item ? `?item=${encodeURIComponent(item)}` : ''
		window.open(`${window.location.pathname}#/stats${query}`, '_blank')
		return null
	}

	return openWithEscape(buefy, {
		component: StatsPage,
		props: { initialItem: item || '' },
		hasModalCard: true,
		trapFocus: true,
		scroll: 'keep',
		animation: 'zoom-in',
		customClass: 'stats-modal',
	})
}
