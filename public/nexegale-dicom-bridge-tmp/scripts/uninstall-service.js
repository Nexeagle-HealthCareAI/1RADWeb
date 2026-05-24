/**
 * Uninstalls the NexEgale DICOM Bridge Windows Service.
 * Run as Administrator:  node scripts/uninstall-service.js
 */

const path = require('path');
const { Service } = require('node-windows');

const svc = new Service({
  name:   'NexEgale DICOM Bridge',
  script: path.join(__dirname, '..', 'src', 'index.js'),
});

svc.on('uninstall', () => {
  console.log('✅  Service uninstalled successfully.');
});

svc.on('error', (err) => {
  console.error('❌  Uninstall error:', err.message || err);
});

svc.on('notinstalled', () => {
  console.log('⚠️  Service is not currently installed.');
});

console.log('Uninstalling NexEgale DICOM Bridge...');
svc.uninstall();
