/**
 * Print bridge status and recent upload history.
 * Run:  node scripts/status.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const store = require('../src/store');

const stats = store.getStats();

console.log('\n═══════════════════════════════════════════');
console.log('   NexEgale DICOM Bridge — Status');
console.log('═══════════════════════════════════════════');
console.log(`  ✓ Uploaded : ${stats.uploaded}`);
console.log(`  ✗ Failed   : ${stats.failed}`);
console.log('───────────────────────────────────────────');
console.log('  Recent activity (last 20):');
console.log('');

if (!stats.recent.length) {
  console.log('  No activity recorded yet.');
} else {
  stats.recent.forEach(r => {
    const icon   = r.status === 'uploaded' ? '✓' : '✗';
    const conf   = r.confidence ? `${(r.confidence * 100).toFixed(0)}%` : '—';
    const date   = r.uploaded_at ? r.uploaded_at.split(' ')[0] : '?';
    console.log(
      `  ${icon} [${date}] ${(r.patient_name || '?').padEnd(25)} ` +
      `${(r.modality || '?').padEnd(6)} ${r.study_date || '?'}  conf:${conf}  ${r.status}`
    );
    if (r.status === 'failed' && r.error_message) {
      console.log(`      ↳ ${r.error_message}`);
    }
  });
}

console.log('═══════════════════════════════════════════\n');
