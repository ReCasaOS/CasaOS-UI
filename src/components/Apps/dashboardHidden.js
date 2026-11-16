// An app the admin left out of the dashboard (the grid's `hidden_on_dashboard`): a display
// choice for every account. The app stays in the list, so its place in the saved order is kept.
export const isHiddenApp = app => app?.hidden_on_dashboard === true

export const shownApps = (apps, showHidden) => showHidden ? apps : apps.filter(app => !isHiddenApp(app))

// what a drag gives back lacks the hidden apps when they are not drawn: they go back at the end
export function withHiddenApps(dragged, apps, showHidden) {
	return showHidden ? dragged : dragged.concat(apps.filter(isHiddenApp))
}
