const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

export const ICONS: Record<string, string> = {
  pencil: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M15 4l5 5-11 11H4v-5L15 4z"/><path d="M13 6l5 5"/></svg>`,
  line: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M5 19L19 5"/><rect x="3" y="17" width="4" height="4"/><rect x="17" y="3" width="4" height="4"/></svg>`,
  rect: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="4" y="6" width="16" height="12"/></svg>`,
  circle: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="12" r="7"/><rect x="11" y="11" width="2" height="2" fill="currentColor" stroke="none"/></svg>`,
  select: `<svg viewBox="0 0 24 24" ${STROKE} stroke-dasharray="3 2"><rect x="4" y="4" width="16" height="16"/></svg>`,
  pan: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 3v18M3 12h18M9.5 5.5L12 3l2.5 2.5M9.5 18.5L12 21l2.5-2.5M5.5 9.5L3 12l2.5 2.5M18.5 9.5L21 12l-2.5 2.5"/></svg>`,
  modify: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 3 L5 19 L9 15 L12 22 L15 21 L12 14 L18 14 Z"/></svg>`,
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12L12 4l9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>`,
  text: `<svg viewBox="0 0 24 24" fill="currentColor"><text x="1" y="18" font-family="serif" font-size="16" font-weight="600">A</text><text x="13" y="18" font-family="serif" font-size="13" font-weight="500">b</text></svg>`,
  // Three-segment zigzag with small square markers at each of the four vertices,
  // matching the visual treatment of the line icon (endpoint markers).
  polyline: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M5 18L10 6L14 14L20 5"/><rect x="3" y="16" width="4" height="4"/><rect x="8" y="4" width="4" height="4"/><rect x="12" y="12" width="4" height="4"/><rect x="18" y="3" width="4" height="4"/></svg>`,
  // Closed three-segment polyline = triangle outline with markers at each vertex.
  "closed-polyline": `<svg viewBox="0 0 24 24" ${STROKE}><path d="M5 19 L12 5 L19 19 Z"/><rect x="3" y="17" width="4" height="4"/><rect x="10" y="3" width="4" height="4"/><rect x="17" y="17" width="4" height="4"/></svg>`,

  undo: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M9 14l-5-5 5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>`,
  redo: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M3 12a9 9 0 0115.5-6.4L21 8"/><path d="M21 4v4h-4"/><path d="M21 12a9 9 0 01-15.5 6.4L3 16"/><path d="M3 20v-4h4"/></svg>`,
  save: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M5 4h11l4 4v12H5z"/><path d="M8 4v6h8V4"/><path d="M8 14h8v6H8z"/></svg>`,
  load: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M3 7h6l2 2h10v10H3z"/><path d="M12 17v-5M9 14l3-3 3 3"/></svg>`,
  thickness: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6" stroke-width="1"/><line x1="3" y1="12" x2="21" y2="12" stroke-width="2.5"/><line x1="3" y1="18" x2="21" y2="18" stroke-width="4.5"/></svg>`,
  fontsize: `<svg viewBox="0 0 24 24" fill="currentColor"><text x="1" y="18" font-size="14" font-family="serif">A</text><text x="11" y="18" font-size="20" font-family="serif">A</text></svg>`,
  snapgrid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-opacity="0.5"><path d="M3 3h18v18H3z"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/><circle cx="9" cy="9" r="2.5" fill="currentColor" stroke="none" stroke-opacity="1" opacity="1"/></svg>`,
  grid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M3 3h18v18H3z"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>`,

  anchor: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="5" r="2"/><path d="M12 7v13"/><path d="M7 11h10"/><path d="M4 14a8 8 0 0016 0"/></svg>`,

  // "Lx" matches the text tool's "Ab" style so the two are visually paired.
  latex: `<svg viewBox="0 0 24 24" fill="currentColor"><text x="2" y="18" font-family="serif" font-size="16" font-weight="600" font-style="italic">L</text><text x="13" y="18" font-family="serif" font-size="13" font-weight="500" font-style="italic">x</text></svg>`,

  // Text-scale-mode toggle: "A" with outward arrows (text grows with zoom).
  "textscale-zoom": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><text x="6" y="17" font-family="serif" font-size="14" font-weight="700" fill="currentColor" stroke="none">A</text><path d="M16 4l4 0 0 4"/><path d="M16 4l4 4"/><path d="M8 20l-4 0 0-4"/><path d="M8 20l-4-4"/></svg>`,

  // Text-scale-mode toggle: "A" inside a fixed frame (constant size).
  "textscale-const": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><text x="6" y="18" font-family="serif" font-size="14" font-weight="700" fill="currentColor" stroke="none">A</text></svg>`,

  // Group: two overlapping rounded rectangles bound by a brace at the top.
  group: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="9" height="9" rx="1.5"/><rect x="11" y="11" width="9" height="9" rx="1.5"/><path d="M3 6c0-1 1-2 2-2h14c1 0 2 1 2 2"/></svg>`,

  // Ungroup: two rectangles separating with a dashed bridge between them.
  ungroup: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="9" width="7" height="7" rx="1.5"/><rect x="15" y="9" width="7" height="7" rx="1.5"/><path d="M9 12.5h6" stroke-dasharray="1.5 2"/><path d="M11 10l-2 2.5 2 2.5" stroke-linejoin="round"/><path d="M13 10l2 2.5-2 2.5"/></svg>`,

  // Group-as-text: stacked "Aa" with a small downward merge arrow.
  "group-as-text": `<svg viewBox="0 0 24 24" fill="currentColor"><text x="3" y="11" font-family="serif" font-size="10" font-weight="700">A</text><text x="11" y="11" font-family="serif" font-size="10" font-weight="700">a</text><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 13v6"/><path d="M9.5 16.5l2.5 2.5 2.5-2.5"/></g><text x="6" y="23" font-family="serif" font-size="6" font-weight="600">Aa</text></svg>`,

  // Group-as-latex: stacked italic "Lx" with same merge arrow.
  "group-as-latex": `<svg viewBox="0 0 24 24" fill="currentColor"><text x="3" y="11" font-family="serif" font-size="10" font-weight="700" font-style="italic">L</text><text x="11" y="11" font-family="serif" font-size="9" font-weight="500" font-style="italic">x</text><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 13v6"/><path d="M9.5 16.5l2.5 2.5 2.5-2.5"/></g><text x="6" y="23" font-family="serif" font-size="6" font-weight="600" font-style="italic">Lx</text></svg>`,
};
