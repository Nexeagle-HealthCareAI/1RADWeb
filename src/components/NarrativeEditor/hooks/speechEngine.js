// Where voice typing runs — privacy first.
//
// Browser speech recognition used to stream the doctor's microphone to the
// browser maker's cloud (Chrome → Google), patient names included. Newer
// browsers can recognise speech ON THE COMPUTER (`processLocally`), so:
//
//   1. on-device recognition when the browser offers it (installing the
//      one-time language pack if needed);
//   2. the cloud service only when the centre's admin has allowed it
//      (Admin ▸ AI & privacy ▸ "Allow cloud dictation");
//   3. otherwise voice typing doesn't start, and says why.
import apiClient from '../../../api/apiClient';

let policyCache = { at: 0, value: null, pending: null };

/** The centre's AI rules (cached 5 min). Never throws; null when unknown. */
export async function getAiPolicy() {
  const now = Date.now();
  if (policyCache.value && now - policyCache.at < 5 * 60 * 1000) return policyCache.value;
  if (policyCache.pending) return policyCache.pending;
  policyCache.pending = apiClient.get('/reporting/ai-policy')
    .then((res) => {
      const v = res?.data?.data || null;
      policyCache = { at: Date.now(), value: v, pending: null };
      return v;
    })
    .catch(() => { policyCache.pending = null; return policyCache.value; });
  return policyCache.pending;
}

/** For tests and after an admin changes the rules. */
export function resetAiPolicyCache() { policyCache = { at: 0, value: null, pending: null }; }

/**
 * Can this browser recognise `lang` on the computer itself?
 *   'local'        — ready on-device
 *   'downloadable' — on-device after a one-time language-pack download
 *   'none'         — no on-device recognition here (cloud only, or none)
 */
export async function onDeviceStatus(SR, lang) {
  if (!SR || typeof SR.available !== 'function') return 'none';
  const ask = async (opts) => {
    try { return await SR.available(opts); } catch { return null; }
  };
  const res = (await ask({ langs: [lang], processLocally: true, quality: 'dictation' }))
    ?? (await ask({ langs: [lang], processLocally: true }));
  if (res === 'available') return 'local';
  if (res === 'downloadable' || res === 'downloading') return 'downloadable';
  return 'none';
}

/**
 * Decide how to run recognition. Returns
 *   { mode: 'local' | 'cloud' | 'blocked', message? }
 * and, for 'local', has already installed the language pack when needed.
 */
export async function chooseEngine(SR, lang, { onInstalling } = {}) {
  let status = await onDeviceStatus(SR, lang);
  if (status === 'downloadable' && typeof SR.install === 'function') {
    onInstalling?.();
    let ok = false;
    try { ok = await SR.install({ langs: [lang], processLocally: true }); } catch { ok = false; }
    status = ok ? 'local' : 'none';
  }
  if (status === 'local') return { mode: 'local' };

  const policy = await getAiPolicy();
  if (policy?.allowCloudDictation) return { mode: 'cloud' };
  return {
    mode: 'blocked',
    message: 'Voice typing is off here: this browser can only do it by sending your voice to its cloud speech service, '
      + 'which this centre has not allowed. Use the desktop app or an up-to-date Chrome/Edge, or ask an admin '
      + '(Admin ▸ AI & privacy).',
  };
}
