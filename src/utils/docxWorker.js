import { docxToHtml } from './importDocx';

self.onmessage = async (e) => {
  const arrayBuffer = e.data;
  try {
    const html = await docxToHtml(arrayBuffer);
    self.postMessage({ ok: true, html });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message });
  }
};
