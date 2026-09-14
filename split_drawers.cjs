const fs = require('fs');
const path = require('path');

const srcFile = path.join(__dirname, 'src', 'components', 'Billing', 'Drawers.jsx');
const outDir = path.join(__dirname, 'src', 'components', 'Billing', 'Drawers');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const content = fs.readFileSync(srcFile, 'utf8');
const lines = content.split('\n');

const imports = [
  "import React, { useEffect, useMemo, useRef, useCallback } from 'react';",
  "import apiClient from '../../../api/apiClient';",
  "import { notifyToast } from '../../../utils/toast';",
].join('\n') + '\n\n';

function writeComponent(name, startLine, endLine, extraCode = '') {
  // startLine and endLine are 1-indexed
  const componentLines = lines.slice(startLine - 1, endLine);
  fs.writeFileSync(
    path.join(outDir, `${name}.jsx`),
    imports + extraCode + componentLines.join('\n')
  );
  console.log(`Wrote ${name}.jsx`);
}

// 1. InvoiceDrawer (lines 5 to 1160)
writeComponent('InvoiceDrawer', 5, 1160);

// 2. NewInvoiceDrawer (lines 1161 to 1669)
writeComponent('NewInvoiceDrawer', 1161, 1669);

// 3. ExportDrawer (lines 1670 to 1779)
writeComponent('ExportDrawer', 1670, 1779);

// 4. PayoutDrawer (lines 1784 to 2007)
writeComponent('PayoutDrawer', 1784, 2007);

// 5. ExpenseDrawer (lines 1780 to 1780 + lines 2008 to end)
// Wait, we need to extract MODALITY_OPTIONS (1782) and ExpenseDrawerInner (2008 to end)
// Then export ExpenseDrawer.
const expenseDrawerCode = 
  lines[1780 - 1] + '\n\n' + 
  lines[1782 - 1] + '\n\n' + 
  lines.slice(2008 - 1).join('\n');
fs.writeFileSync(path.join(outDir, 'ExpenseDrawer.jsx'), imports + expenseDrawerCode);
console.log('Wrote ExpenseDrawer.jsx');

// Write index.js
const indexContent = `export { InvoiceDrawer } from './InvoiceDrawer';
export { NewInvoiceDrawer } from './NewInvoiceDrawer';
export { ExportDrawer } from './ExportDrawer';
export { ExpenseDrawer } from './ExpenseDrawer';
export { PayoutDrawer } from './PayoutDrawer';
`;
fs.writeFileSync(path.join(outDir, 'index.js'), indexContent);
console.log('Wrote index.js');
