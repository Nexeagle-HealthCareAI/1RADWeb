/**
 * Connection test — verifies Orthanc and 1Rad are reachable.
 * Exit code 0 = all good, 1 = failure.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const axios = require('axios');

async function test() {
  let allOk = true;

  // ── Orthanc ───────────────────────────────────────────────────
  process.stdout.write('  Orthanc (' + process.env.ORTHANC_URL + ') ... ');
  try {
    await axios.get(`${process.env.ORTHANC_URL}/system`, {
      auth: { username: process.env.ORTHANC_USER, password: process.env.ORTHANC_PASS },
      timeout: 5000,
    });
    console.log('✓ Connected');
  } catch (err) {
    console.log('✗ Failed —', err.code || err.message);
    allOk = false;
  }

  // ── 1Rad API ─────────────────────────────────────────────────
  process.stdout.write('  1Rad API (' + process.env.ONERAD_API_URL + ') ... ');
  try {
    const res = await axios.post(
      `${process.env.ONERAD_API_URL}/auth/login`,
      {
        identifier: process.env.ONERAD_IDENTIFIER || process.env.ONERAD_EMAIL,
        password:   process.env.ONERAD_PASSWORD,
      },
      { timeout: 8000 }
    );
    const data = res.data;
    const ok    = data.success || data.Success;
    const token = data.accessToken || data.AccessToken;

    if (ok && token) {
      console.log('✓ Authenticated');
    } else {
      console.log('✗ Login failed —', data.error || data.Error || 'no token in response');
      allOk = false;
    }
  } catch (err) {
    console.log('✗ Failed —', err.response?.data?.error || err.message);
    allOk = false;
  }

  console.log();
  if (allOk) {
    console.log('  All checks passed ✓');
  } else {
    console.log('  Some checks failed. Review .env settings.');
  }

  process.exit(allOk ? 0 : 1);
}

test();
