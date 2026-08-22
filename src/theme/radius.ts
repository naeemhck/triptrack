/** Unified corner radii. sm=inputs/chips, md=buttons/icon tiles, lg=cards, xl=dialogs, pill=full round. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radius;
