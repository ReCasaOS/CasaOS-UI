// The id the core gives a widget. Nothing else goes into an address of its routes or into a key of the dashboard's settings.
export const WIDGET_ID = /^[a-z0-9]{8}$/

export const isWidgetId = id => typeof id === 'string' && WIDGET_ID.test(id)

/** Of a list as the core answers it, the widgets that have such an id, each once (the first). */
export function listedWidgets(list) {
	const widgets = []
	for (const widget of Array.isArray(list) ? list : []) {
		if (isWidgetId(widget?.id) && !widgets.some(known => known.id === widget.id))
			widgets.push(widget)
	}
	return widgets
}
