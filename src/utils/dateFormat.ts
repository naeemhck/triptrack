const parseDateOnly = (value: string): Date => { const [y,m,d] = value.split('-').map(Number); return new Date(y,m-1,d); };
export const formatTripDateRange = (startDate: string, endDate: string): string => {
  const start = parseDateOnly(startDate); const end = parseDateOnly(endDate); const sameYear = start.getFullYear() === end.getFullYear();
  const startText = start.toLocaleDateString(undefined, { month:'short', day:'numeric', ...(sameYear ? {} : { year:'numeric' as const }) });
  const endText = end.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
  return `${startText} - ${endText}`;
};
