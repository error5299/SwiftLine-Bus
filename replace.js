const fs = require('fs');
const file = 'src/pages/PassengerPanel.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/rounded-sm/g, 'rounded-2xl');
fs.writeFileSync(file, content);
console.log('Replaced rounded-sm with rounded-2xl');