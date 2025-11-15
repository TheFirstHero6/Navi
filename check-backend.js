// Quick script to check if backend can start
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const backendPath = path.join(__dirname, 'backend');
const backendIndex = path.join(backendPath, 'index.js');

console.log('Checking backend setup...');
console.log('Backend path:', backendPath);
console.log('Backend index:', backendIndex);

const fs = require('fs');
if (!fs.existsSync(backendIndex)) {
  console.error('❌ Backend index.js not found!');
  process.exit(1);
}

if (!fs.existsSync(path.join(backendPath, 'node_modules'))) {
  console.error('❌ Backend node_modules not found!');
  console.error('Run: cd backend && npm install');
  process.exit(1);
}

console.log('✓ Backend files found');

// Try to start backend
console.log('\nStarting backend server...');
// Use shell with quoted path to handle spaces in Windows paths
const command = `node "${backendIndex}"`;
const backendProcess = spawn(command, [], {
  cwd: backendPath,
  stdio: 'inherit',
  shell: true,
});

let backendReady = false;

// Wait for backend to start
setTimeout(() => {
  const req = http.get('http://localhost:3000/health', (res) => {
    if (res.statusCode === 200) {
      console.log('\n✓ Backend is running and responding!');
      backendReady = true;
      backendProcess.kill();
      process.exit(0);
    }
  });
  
  req.on('error', () => {
    console.error('\n❌ Backend started but not responding on port 3000');
    backendProcess.kill();
    process.exit(1);
  });
  
  req.setTimeout(5000, () => {
    console.error('\n❌ Backend health check timeout');
    backendProcess.kill();
    process.exit(1);
  });
}, 3000);

// Kill process on exit
process.on('SIGINT', () => {
  backendProcess.kill();
  process.exit(0);
});

