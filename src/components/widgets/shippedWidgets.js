// The widgets this dashboard ships. Kept apart so a spec can swap the webpack-only
// require.context for a plain list.
const widgetsComponents = require.context(
	'@/widgets',
	false,
	/.vue$/,
)

export default widgetsComponents.keys().map(fileName => widgetsComponents(fileName).default)
