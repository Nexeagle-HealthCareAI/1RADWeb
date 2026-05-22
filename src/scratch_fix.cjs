const fs = require('fs');
const path = 'c:/Users/mtnoo/OneDrive/Desktop/1Rad/easyrad/src/pages/AdminBoard.jsx';
let content = fs.readFileSync(path, 'utf8');

// Remove renderSubscription function
content = content.replace(/const renderSubscription = \(\) => \{[\s\S]*?\};\s*const renderHospitalSettings =/m, 'const renderHospitalSettings =');

// Remove Plan tab
content = content.replace(/'Letterhead', 'Plan'/, "'Letterhead'");

// Remove the render block
content = content.replace(/\{activeTab === 'Plan' && renderSubscription\(\)\}/g, '');

fs.writeFileSync(path, content, 'utf8');
console.log('AdminBoard.jsx updated successfully');
