export const formatNumber = (num : number): string => {
  const str = num.toString();
  const parts = str.split('.');
  return num.toFixed(8 - parts[0].length)
}