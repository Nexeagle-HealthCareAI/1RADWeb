const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const logger = require('./logger');

const BASE_URL = process.env.ONERAD_API_URL ||
  'https://1radapi-bch4ere7a6cmgkap.centralindia-01.azurewebsites.net/api/v1';

const client = axios.create({ baseURL: BASE_URL, timeout: 60000 });

let _token = null;
let _tokenExpiry = 0;

// ── Auth ─────────────────────────────────────────────────────────────────────

async function fetchToken() {
  const identifier = process.env.ONERAD_IDENTIFIER || process.env.ONERAD_EMAIL;
  const password   = process.env.ONERAD_PASSWORD;

  if (!identifier || !password) {
    throw new Error('ONERAD_IDENTIFIER and ONERAD_PASSWORD must be set in .env');
  }

  const res  = await client.post('/auth/login', { identifier, password });
  const data = res.data;

  const ok          = data.success || data.Success;
  const userProfile = data.userProfile || data.UserProfile;
  const token       = data.accessToken || data.AccessToken;

  if (!ok || !userProfile) {
    throw new Error(`1Rad login rejected: ${data.error || data.Error || 'unknown'}`);
  }
  if (!token) {
    throw new Error('Login succeeded but no accessToken in response');
  }
  return token;
}

async function authenticate(forceRefresh = false) {
  if (!forceRefresh && _token && Date.now() < _tokenExpiry) return _token;

  logger.info('[AUTH] Refreshing 1Rad access token...');
  _token = await fetchToken();
  _tokenExpiry = Date.now() + 8 * 60 * 60 * 1000; // 8h
  logger.info('[AUTH] Token acquired');
  return _token;
}

// Wrap an API call: if it returns 401, force-refresh token and retry once
async function withAuth(fn) {
  const token = await authenticate();
  try {
    return await fn(token);
  } catch (err) {
    if (err.response?.status === 401) {
      logger.warn('[AUTH] 401 received — refreshing token and retrying');
      const fresh = await authenticate(true);
      return await fn(fresh);
    }
    throw err;
  }
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function searchAppointments(patientName) {
  return withAuth(async (token) => {
    const res = await client.get('/appointments', {
      params:  { search: patientName },
      headers: { Authorization: `Bearer ${token}` },
    });
    return Array.isArray(res.data) ? res.data : [];
  });
}

async function uploadZip(appointmentId, zipPath) {
  return withAuth(async (token) => {
    const stats = fs.statSync(zipPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    logger.info(`[UPLOAD] File: ${sizeMB} MB → appointment ${appointmentId}`);

    const form = new FormData();
    form.append('AppointmentId', String(appointmentId));
    form.append('File', fs.createReadStream(zipPath), {
      filename:     `dicom_${appointmentId}_${Date.now()}.zip`,
      contentType:  'application/zip',
      knownLength:  stats.size,
    });

    const res = await client.post('/Study/upload', form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${token}`,
      },
      maxContentLength: Infinity,
      maxBodyLength:    Infinity,
      timeout:          20 * 60 * 1000, // 20 min
    });

    return res.data;
  });
}

async function markScanned(appointmentId) {
  try {
    await withAuth(async (token) => {
      await client.patch(
        `/appointments/${appointmentId}/status`,
        '"scanned"',
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
    });
    logger.info(`[STATUS] Appointment ${appointmentId} → SCANNED`);
  } catch (err) {
    logger.warn(`[STATUS] Could not mark scanned: ${err.message}`);
  }
}

// ── Retry wrapper (for upload) ────────────────────────────────────────────────

async function uploadZipWithRetry(appointmentId, zipPath, maxRetries = 5) {
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await uploadZip(appointmentId, zipPath);
      return result;
    } catch (err) {
      lastErr = err;
      const retryable = !err.response || err.response.status >= 500 || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT';
      if (!retryable || attempt === maxRetries) break;
      // Exponential backoff: 5s, 10s, 20s, 40s
      const wait = Math.pow(2, attempt - 1) * 5000;
      logger.warn(`[UPLOAD] Attempt ${attempt} failed (${err.message}) - retrying in ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

module.exports = {
  authenticate,
  searchAppointments,
  uploadZip: uploadZipWithRetry,
  markScanned,
};
