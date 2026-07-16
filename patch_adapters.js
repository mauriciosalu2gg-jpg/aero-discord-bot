const fs = require('fs');
const path = require('path');

const adaptersDir = path.join(__dirname, 'services/adapters');
const files = fs.readdirSync(adaptersDir).filter(f => f.endsWith('.js'));

for (const file of files) {
  const filePath = path.join(adaptersDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace function signature
  content = content.replace(
    /export async function (\w+)\(apiKey, model, history, systemExtra = ''\)/,
    "export async function $1(apiKey, model, history, systemExtra = '', intent = 'chat')"
  );

  // Replace getMaxTokens calls
  content = content.replace(
    /getMaxTokens\('([^']+)'\)/g,
    "getMaxTokens('$1', intent)"
  );

  fs.writeFileSync(filePath, content);
}
console.log('Adapters patched successfully.');
