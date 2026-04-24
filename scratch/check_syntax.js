const fs = require('fs');
const acorn = require('acorn');
const jsx = require('acorn-jsx');

const Parser = acorn.Parser.extend(jsx());

const files = [
    'c:\\Users\\mtnoo\\OneDrive\\Desktop\\1Rad\\easyrad\\src\\pages\\DoctorBoard.jsx',
    'c:\\Users\\mtnoo\\OneDrive\\Desktop\\1Rad\\easyrad\\src\\pages\\BillingPage.jsx'
];

files.forEach(file => {
    try {
        const code = fs.readFileSync(file, 'utf-8');
        Parser.parse(code, { sourceType: 'module', ecmaVersion: 2020 });
        console.log(`PASS: ${file}`);
    } catch (e) {
        console.log(`FAIL: ${file}`);
        console.log(e.message);
        console.log(`At line ${e.loc.line}, col ${e.loc.column}`);
    }
});
