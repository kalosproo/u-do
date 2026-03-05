export const DAY_MS = 24 * 60 * 60 * 1000;

export const toDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const parseDateKey = (dateKey) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const getYesterdayKey = (todayKey) => {
  const baseDate = parseDateKey(todayKey);
  baseDate.setDate(baseDate.getDate() - 1);
  return toDateKey(baseDate);
};
