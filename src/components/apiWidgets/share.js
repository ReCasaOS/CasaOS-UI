import escape from 'lodash/escape'
import { exportRecipe, fileName, fixedTexts, importRecipe } from './recipe'

// The import and the export of a recipe, as the window of the widgets asks for them. `vm` is the component that speaks: its $t and its
// $buefy. A toast and a dialog draw their message as HTML: every text is escaped, whoever wrote it.

/** The recipe of an imported file, or null once the reason is said. Nothing is asked of the box. */
export function readImport(vm, text) {
	try {
		return importRecipe(text)
	} catch (error) {
		vm.$buefy.toast.open({ message: escape(vm.$t(error.message, { field: error.field })), type: 'is-danger', duration: 5000 })
		return null
	}
}

/** Offers the file of a widget (as the core lists it), once its fixed texts are shown: a key typed as one would leave with the file. */
export function exportWidget(vm, widget) {
	const name = typeof widget.recipe?.name === 'string' ? widget.recipe.name : ''
	const texts = fixedTexts(widget.recipe)
	const what = vm.$t('The file holds the recipe of {name}: neither its address nor its secrets.', { name })
	const fixed = texts.length ? vm.$t('It holds these fixed texts, which whoever gets the file will read. Check that none is a key or a password:') : vm.$t('It holds no fixed text.')
	vm.$buefy.dialog.confirm({
		title: vm.$t('Export the recipe'),
		message: `${escape(what)}<br>${escape(fixed)}${texts.map(({ where, value }) => `<br>${escape(`${where}: ${value}`)}`).join('')}`,
		confirmText: vm.$t('Download'),
		cancelText: vm.$t('Cancel'),
		onConfirm: () => {
			const link = document.createElement('a')
			link.href = URL.createObjectURL(new Blob([exportRecipe(widget)], { type: 'application/json' }))
			link.download = fileName(name)
			link.click()
			URL.revokeObjectURL(link.href)
		},
	})
}
