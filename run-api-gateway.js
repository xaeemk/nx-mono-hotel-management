const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting API Gateway...\n');

// Set environment variables
process.env.NODE_ENV = 'development';
process.env.PORT = process.env.PORT || '3000';

// Path to the main application file
const mainFile = path.join(__dirname, 'apps', 'api-gateway', 'src', 'main.ts');

// Run ts-node with the main file
const child = spawn('npx', ['ts-node', mainFile], {
  stdio: 'inherit',
  cwd: __dirname,
  shell: true,
});

child.on('error', (error) => {
  console.error('❌ Failed to start API Gateway:', error.message);
  process.exit(1);
});

child.on('close', (code) => {
  if (code !== 0) {
    console.error(`❌ API Gateway exited with code ${code}`);
  }
  process.exit(code);
});
