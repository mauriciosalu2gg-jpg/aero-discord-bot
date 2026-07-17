import secrets from './secrets.js';

console.log("Original Providers:", secrets.getAvailableProviders());

// To simulate Render, we need to bypass dotenv loading or just set process.env before import? No, secrets reads from SECRETS at module initialization time!
// Let's print what SECRETS captured.
console.log("SECRETS:", secrets);
