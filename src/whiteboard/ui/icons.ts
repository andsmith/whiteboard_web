const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

export const ICONS: Record<string, string> = {
  pencil: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M15 4l5 5-11 11H4v-5L15 4z"/><path d="M13 6l5 5"/></svg>`,
  line: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M5 19L19 5"/><rect x="3" y="17" width="4" height="4"/><rect x="17" y="3" width="4" height="4"/></svg>`,
  rect: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="4" y="6" width="16" height="12"/></svg>`,
  circle: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="12" r="7"/><rect x="11" y="11" width="2" height="2" fill="currentColor" stroke="none"/></svg>`,
  select: `<svg viewBox="0 0 24 24" ${STROKE} stroke-dasharray="3 2"><rect x="4" y="4" width="16" height="16"/></svg>`,
  pan: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="12" r="9"/><path d="M12 4v16M4 12h16M8 8l4-4 4 4M8 16l4 4 4-4M8 8l-4 4 4 4M16 8l4 4-4 4"/></svg>`,

  undo: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M9 14l-5-5 5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>`,
  redo: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/></svg>`,
  clear: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg>`,
  thickness: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6" stroke-width="1"/><line x1="3" y1="12" x2="21" y2="12" stroke-width="2.5"/><line x1="3" y1="18" x2="21" y2="18" stroke-width="4.5"/></svg>`,
  fontsize: `<svg viewBox="0 0 24 24" fill="currentColor"><text x="1" y="18" font-size="14" font-family="serif">A</text><text x="11" y="18" font-size="20" font-family="serif">A</text></svg>`,
  snapgrid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-opacity="0.5"><path d="M3 3h18v18H3z"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/><circle cx="9" cy="9" r="2.5" fill="currentColor" stroke="none" stroke-opacity="1" opacity="1"/></svg>`,
  grid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M3 3h18v18H3z"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>`,
};
