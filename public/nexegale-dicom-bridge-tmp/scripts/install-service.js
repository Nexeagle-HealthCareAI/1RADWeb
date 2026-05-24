/**
 * Installs the NexEgale DICOM Bridge as a Windows Service.
 * Run once as Administrator:  node scripts/install-service.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Service } = require('node-windows');

const svc = new Service({
  name:        'NexEgale DICOM Bridge',
  description: 'Monitors Orthanc DICOM server and uploads new studies to NexEgale/1Rad automatically.',
  script:      path.join(__dirname, '..', 'src', 'index.js'),

  // Node.js options
  nodeOptions: ['--max_old_space_size=256'],

  // Environment variables passed to the service process
  env: [
    { name: 'NODE_ENV', value: 'production' },
    { name: 'ORTHANC_URL',                  value: process.env.ORTHANC_URL                  || 'http://localhost:8042' },
    { name: 'ORTHANC_USER',                 value: process.env.ORTHANC_USER                 || 'orthanc' },
    { name: 'ORTHANC_PASS',                 value: process.env.ORTHANC_PASS                 || 'orthanc' },
    { name: 'ONERAD_API_URL',               value: process.env.ONERAD_API_URL               || '' },
    { name: 'ONERAD_EMAIL',                 value: process.env.ONERAD_EMAIL                 || '' },
    { name: 'ONERAD_PASSWORD',              value: process.env.ONERAD_PASSWORD               || '' },
    { name: 'POLL_INTERVAL_SECONDS',        value: process.env.POLL_INTERVAL_SECONDS        || '30' },
    { name: 'MATCH_CONFIDENCE_THRESHOLD',   value: process.env.MATCH_CONFIDENCE_THRESHOLD   || '0.6' },
    { name: 'DATA_DIR',                     value: process.env.DATA_DIR                     || 'C:\\ProgramData\\NexEgale\\bridge' },
    { name: 'LOG_LEVEL',                    value: process.env.LOG_LEVEL                    || 'info' },
  ],

  workingDirectory: path.join(__dirname, '..'),

  // Windows Service restart behaviour
  wait:    2,   // seconds before restart attempt
  grow:    0.5, // back-off multiplier
  maxRestarts: 5,
  abortOnError: false,
});

svc.on('install', () => {
  console.log('\n✅  Service installed successfully.');
  console.log('    Starting service...');
  svc.start();
});

svc.on('start', () => {
  console.log('✅  Service started.');
  console.log('\n    Manage via:');
  console.log('      services.msc → "NexEgale DICOM Bridge"');
  console.log('      sc query "NexEgale DICOM Bridge"');
  console.log('\n    Logs:');
  console.log(`      ${process.env.DATA_DIR || 'C:\\ProgramData\\NexEgale\\bridge'}\\logs\\bridge.log`);
});

svc.on('error', (err) => {
  console.error('\n❌  Installation error:', err.message || err);
  console.error('    Make sure you are running as Administrator.');
});

svc.on('alreadyinstalled', () => {
  console.log('⚠️  Service is already installed.');
  console.log('   To reinstall: node scripts/uninstall-service.js  then re-run this script.');
});

console.log('Installing NexEgale DICOM Bridge as a Windows Service...');
svc.install();
