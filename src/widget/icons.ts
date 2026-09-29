/**
 * Widget glyphs as inline SVG — RemoteViews can't use the app's icon font,
 * and vector strings stay crisp at every launcher size. 24×24 viewBox.
 */
const svg = (body: string, color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="${color}">${body}</svg>`;

export const Icon = {
  play: (c: string) => svg('<path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.9-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z"/>', c),
  pause: (c: string) => svg('<rect x="6" y="4.5" width="4.2" height="15" rx="1.2"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2"/>', c),
  next: (c: string) => svg('<path d="M4.5 5.6v12.8a.9.9 0 0 0 1.4.75l9.2-6.4a.9.9 0 0 0 0-1.5L5.9 4.85a.9.9 0 0 0-1.4.75z"/><rect x="16.6" y="4.8" width="3" height="14.4" rx="1"/>', c),
  previous: (c: string) => svg('<path d="M19.5 5.6v12.8a.9.9 0 0 1-1.4.75l-9.2-6.4a.9.9 0 0 1 0-1.5l9.2-6.4a.9.9 0 0 1 1.4.75z"/><rect x="4.4" y="4.8" width="3" height="14.4" rx="1"/>', c),
  heart: (c: string) => svg('<path d="M12 20.6s-7.8-4.6-9.6-9.4C1.2 8 3.1 4.6 6.6 4.6c2.1 0 3.6 1.2 5.4 3.3 1.8-2.1 3.3-3.3 5.4-3.3 3.5 0 5.4 3.4 4.2 6.6-1.8 4.8-9.6 9.4-9.6 9.4z"/>', c),
  heartOutline: (c: string) => svg('<path fill="none" stroke="' + c + '" stroke-width="2" stroke-linejoin="round" d="M12 19.4s-7-4.2-8.6-8.4C2.4 8.2 4 5.6 6.8 5.6c1.9 0 3.3 1.2 5.2 3.4 1.9-2.2 3.3-3.4 5.2-3.4 2.8 0 4.4 2.6 3.4 5.4-1.6 4.2-8.6 8.4-8.6 8.4z"/>', c),
  share: (c: string) => svg('<path fill="none" stroke="' + c + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 3.5v11M8 7.3l4-3.8 4 3.8M7 10.5H6a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 6 20.5h12a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-1"/>', c),
  chevronRight: (c: string) => svg('<path fill="none" stroke="' + c + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M9.5 5.5 16 12l-6.5 6.5"/>', c),
  note: (c: string) => svg('<path d="M9 17.5V6.2a1 1 0 0 1 .78-.98l9-2A1 1 0 0 1 20 4.2v10.3a3 3 0 1 1-2-2.83V7.4l-7 1.56v8.54a3 3 0 1 1-2-2.83z"/>', c),
};
