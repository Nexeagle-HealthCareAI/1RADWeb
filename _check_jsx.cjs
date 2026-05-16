const fs = require('fs');
const code = fs.readFileSync('src/pages/ReportingPage.jsx', 'utf8');
const lines = code.split('\n');
let stack = [];
const reOpen = /<([a-zA-Z][a-zA-Z0-9]*)/g;
const reClose = /<\/([a-zA-Z][a-zA-Z0-9]*)>/g;
for (let i = 3000; i < 3420; i++) {
  const raw = lines[i] || '';
  const noSelfClose = raw.replace(/<[a-zA-Z][a-zA-Z0-9]*[^>]*\/>/g, '');
  let m;
  reClose.lastIndex = 0;
  while ((m = reClose.exec(noSelfClose)) !== null) {
    const top = stack[stack.length - 1];
    if (!top || top.tag !== m[1]) {
      console.log('MISMATCH at line', i + 1, ': </' + m[1] + '> closes', top ? top.tag + '@' + top.line : 'NOTHING');
      if (stack.length > 0) stack.pop();
    } else {
      stack.pop();
    }
  }
  const noClose = noSelfClose.replace(/<\/[a-zA-Z][a-zA-Z0-9]*>/g, '');
  reOpen.lastIndex = 0;
  while ((m = reOpen.exec(noClose)) !== null) {
    stack.push({ tag: m[1], line: i + 1 });
  }
}
console.log('REMAINING STACK:', stack.map(s => s.tag + '@' + s.line));
