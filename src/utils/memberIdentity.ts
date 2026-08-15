const AVATAR_COLORS = [
  '#2563EB',
  '#7C3AED',
  '#C2410C',
  '#047857',
  '#BE123C',
  '#0369A1',
  '#A21CAF',
  '#4D7C0F',
] as const;
export const getMemberColor = (stableId: string): string => {
  let hash = 0;
  for (let index = 0; index < stableId.length; index += 1)
    hash = ((hash << 5) - hash + stableId.charCodeAt(index)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};
export const getMemberInitials = (name?: string): string => {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length >= 2) return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
  return words.length === 1 ? words[0].slice(0, 2).toUpperCase() : '';
};
