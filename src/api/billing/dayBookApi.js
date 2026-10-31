import apiClient from '../apiClient';

/** Day book (review B12): money that moved, by IST day, mode and cashier. Dates are 'YYYY-MM-DD'. */
export const fetchDayBook = async (from, to) => {
  const res = await apiClient.get('/finance/daybook', { params: { from, to } });
  return res.data;
};

/** Record the end-of-day cash count. */
export const closeDay = async ({ date, countedCash, note }) => {
  const res = await apiClient.post('/finance/daybook/close', { date, countedCash, note });
  return res.data;
};
