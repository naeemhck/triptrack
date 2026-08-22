/**
 * Typography scale. System font (SF/Roboto) — weight and letter-spacing do the work.
 * letterSpacing applies to uppercase chips/labels; use 0 for normal text.
 */
export const typography = {
  display: { fontSize: 30, fontWeight: '800' },
  title: { fontSize: 22, fontWeight: '800' },
  heading: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '600' },
  secondary: { fontSize: 13, fontWeight: '500' },
  caption: { fontSize: 11, fontWeight: '700' },
} as const;

export const letterSpacing = {
  normal: 0,
  tight: -0.3,
  chip: 0.6,
  label: 1.2,
} as const;
