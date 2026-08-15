export const devLog = (...values: unknown[]): void => {
  if (__DEV__) console.log(...values);
};

export const devWarn = (...values: unknown[]): void => {
  if (__DEV__) console.warn(...values);
};
