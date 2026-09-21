// Options for vue-dompurify-html, shared by main.js and the specs.
export const dompurifyOptions = {
	default: {
		ALLOWED_ATTR: ['target', 'href'],
	},
	namedConfigurations: {
		// Markdown rendered by marked: app store descriptions and tips. DOMPurify's own
		// allow-list keeps what markdown produces (<img src>, table alignment...). Styles,
		// form controls and ids go: a description must not restyle the dashboard, put a
		// working form in front of the user, or clobber an element the page looks up.
		markdown: {
			FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'option'],
			FORBID_ATTR: ['style', 'id'],
		},
	},
}
