import apiClient from '../apiClient';

/** Credit notes and refund vouchers by IST issue date ('YYYY-MM-DD'), or for one bill. */
export const fetchCreditNotes = async ({ from, to, invoiceId } = {}) => {
  const res = await apiClient.get('/finance/credit-notes', { params: { from, to, invoiceId } });
  return res.data;
};

/** The month's GSTR-1 working sheet (month = 'YYYY-MM'), as a Blob. */
export const downloadGstr1 = async (month) => {
  const res = await apiClient.get('/finance/gstr1', { params: { month }, responseType: 'blob' });
  const name = /filename="?([^";]+)"?/i.exec(res.headers?.['content-disposition'] || '')?.[1] || `GSTR1_${month}.xlsx`;
  return { blob: res.data, name };
};
