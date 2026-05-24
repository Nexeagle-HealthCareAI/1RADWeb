require('dotenv').config();

const orthanc  = require('./orthanc');
const uploader = require('./uploader');
const matcher  = require('./matcher');
const store    = require('./store');
const logger   = require('./logger');
const { startApi } = require('./api');
const fs       = require('fs');
const os       = require('os');
const path     = require('path');

const POLL_INTERVAL  = parseInt(process.env.POLL_INTERVAL_SECONDS || '30', 10) * 1000;
const CONFIDENCE     = parseFloat(process.env.MATCH_CONFIDENCE_THRESHOLD || '0.6');

let polling = false;

function cleanupTempFiles() {
  const tmpDir = os.tmpdir();
  try {
    const files = fs.readdirSync(tmpDir);
    let deleted = 0;
    for (const file of files) {
      if (file.startsWith('nexegale_') && file.endsWith('.zip')) {
        fs.unlinkSync(path.join(tmpDir, file));
        deleted++;
      }
    }
    if (deleted > 0) {
      logger.info(`[CLEANUP] Deleted ${deleted} orphaned temp ZIP files from previous runs.`);
    }
  } catch (err) {
    logger.warn(`[CLEANUP] Failed to scan temp directory: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Process a single Orthanc study
// ─────────────────────────────────────────────────────────────────────────────
async function processStudy(studyUid) {
  // 1. Fetch and parse metadata from Orthanc
  const raw  = await orthanc.getStudy(studyUid);
  const meta = orthanc.parseStudyMeta(raw);

  logger.info(`[STUDY] ${meta.patientName} | ${meta.modality} | ${meta.studyDate} | ${meta.seriesCount} series`);

  if (!meta.patientName) {
    logger.warn(`[SKIP] Study ${studyUid} has no patient name — cannot match`);
    store.markFailed(studyUid, meta, 'Missing patient name in DICOM tags');
    return;
  }

  // 2. Search 1Rad for matching appointments
  const appointments = await uploader.searchAppointments(meta.patientName);
  logger.info(`[MATCH] Found ${appointments.length} appointment(s) for "${meta.patientName}"`);

  const result = matcher.findBestMatch(appointments, meta, CONFIDENCE);

  if (!result) {
    const msg = `No appointment matched (name="${meta.patientName}", modality=${meta.modality}, date=${meta.studyDate}, threshold=${CONFIDENCE})`;
    logger.warn(`[MATCH] ${msg}`);
    store.markFailed(studyUid, meta, msg);
    return;
  }

  const { appointment, confidence } = result;
  logger.info(
    `[MATCH] ✓ "${appointment.patientName}" — appointment ${appointment.appointmentId} — ` +
    `confidence ${(confidence * 100).toFixed(1)}%`
  );

  // 3. Download ZIP from Orthanc
  logger.info(`[DOWNLOAD] Downloading study from Orthanc...`);
  let zipPath = null;
  try {
    zipPath = await orthanc.downloadStudyZip(studyUid, (pct) => {
      if (pct > 0 && pct % 25 === 0) logger.info(`[DOWNLOAD] ${pct}%`);
    });
    logger.info(`[DOWNLOAD] Done → ${zipPath}`);

    // 4. Upload to 1Rad
    logger.info(`[UPLOAD] Uploading to appointment ${appointment.appointmentId}...`);
    const uploadRes = await uploader.uploadZip(appointment.appointmentId, zipPath);
    logger.info(`[UPLOAD] Done — response: ${JSON.stringify(uploadRes).slice(0, 120)}`);

    // 5. Update appointment status
    await uploader.markScanned(appointment.appointmentId);

    // 6. Record success in local store
    store.markProcessed(studyUid, appointment.appointmentId, meta, confidence);
    logger.info(`[DONE] Study ${studyUid} processed successfully ✓`);

  } finally {
    // Always clean up the temp ZIP
    if (zipPath && fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
      logger.debug(`[CLEANUP] Deleted temp ZIP`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main poll cycle — reads Orthanc /changes, processes StableStudy events
// ─────────────────────────────────────────────────────────────────────────────
async function poll() {
  if (polling) return;
  polling = true;

  try {
    let lastId = store.getLastChangeId();
    let done   = false;
    let newStudies = 0;

    while (!done) {
      const result = await orthanc.getChanges(lastId, 100);
      const stableStudies = (result.Changes || []).filter(c => c.ChangeType === 'StableStudy');

      for (const change of stableStudies) {
        const uid = change.ID;

        if (store.isProcessed(uid)) {
          logger.debug(`[SKIP] Already processed: ${uid}`);
          continue;
        }

        newStudies++;
        logger.info(`[NEW] Stable study detected: ${uid}`);

        try {
          await processStudy(uid);
        } catch (err) {
          // Fetch meta for failure record (best-effort)
          const meta = await orthanc.getStudy(uid)
            .then(s => orthanc.parseStudyMeta(s))
            .catch(() => null);
          store.markFailed(uid, meta, err.message);
          logger.error(`[ERROR] Study ${uid}: ${err.message}`);
        }
      }

      lastId = result.Last ?? lastId;
      store.setLastChangeId(lastId);
      done = result.Done !== false;
    }

    if (newStudies > 0) {
      const stats = store.getStats();
      logger.info(`[STATS] Uploaded: ${stats.uploaded} | Failed: ${stats.failed}`);
    }

  } catch (err) {
    logger.error(`[POLL ERROR] ${err.message}`);
  } finally {
    polling = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Boot sequence
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  logger.info('════════════════════════════════════════════════');
  logger.info('   NexEgale DICOM Bridge  v1.0.0');
  logger.info('════════════════════════════════════════════════');
  logger.info(`Orthanc URL  : ${process.env.ORTHANC_URL}`);
  logger.info(`1Rad API     : ${process.env.ONERAD_API_URL}`);
  logger.info(`Poll interval: ${POLL_INTERVAL / 1000}s`);
  logger.info(`Confidence   : ${CONFIDENCE}`);
  logger.info('────────────────────────────────────────────────');

  cleanupTempFiles();

  // Verify Orthanc connectivity
  const orthancOk = await orthanc.ping();
  if (!orthancOk) {
    logger.error('✗ Cannot reach Orthanc. Check ORTHANC_URL / credentials.');
    process.exit(1);
  }
  logger.info('✓ Orthanc connected');

  // Verify 1Rad authentication
  try {
    await uploader.authenticate();
    logger.info('✓ 1Rad API authenticated');
  } catch (err) {
    logger.error(`✗ 1Rad authentication failed: ${err.message}`);
    process.exit(1);
  }

  // Start the status API for the React dashboard
  startApi();

  logger.info('Bridge is running — waiting for new studies...');
  logger.info('────────────────────────────────────────────────');

  // Initial poll then repeat
  await poll();
  setInterval(poll, POLL_INTERVAL);
}

// Handle graceful shutdown
process.on('SIGTERM', () => { logger.info('SIGTERM received — shutting down'); process.exit(0); });
process.on('SIGINT',  () => { logger.info('SIGINT received — shutting down');  process.exit(0); });
process.on('uncaughtException', (err) => logger.error(`Uncaught: ${err.message}`));
process.on('unhandledRejection', (err) => logger.error(`Unhandled: ${err?.message || err}`));

main();
