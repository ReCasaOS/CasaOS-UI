// Below the card when the menu fits there; otherwise the side with more room,
// so a menu too tall for both sides is cut at the nearer edge, not at the top.
export const menuSide = (above, below, height) => (below > height + 8 || below >= above ? 'bottom' : 'top')
