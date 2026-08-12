const { spawn } = require('node:child_process');
const http = require('node:http');

const server = spawn('npm', ['run', 'start:dev'], { stdio: 'pipe' });

let output = '';
server.stdout.on('data', (data) => {
  output += data.toString();
  // Don't print everything to avoid massive logs, just keep the last 5000 chars
  if (output.length > 5000) output = output.slice(-5000);
});
server.stderr.on('data', (data) => {
  output += data.toString();
  if (output.length > 5000) output = output.slice(-5000);
});

server.on('close', (code) => {
  console.log('Server crashed with code:', code);
  console.log('Output before crash:\n', output);
  process.exit(1);
});

setTimeout(() => {
  console.log('Sending request...');
  http
    .get('http://127.0.0.1:3005/api/v1/experiments/my-flags', (res) => {
      console.log('Response status:', res.statusCode);
      res.resume(); // consume response data to free up memory
      setTimeout(() => {
        server.kill();
        console.log('Server did not crash. Output:\n', output);
        process.exit(0);
      }, 2000);
    })
    .on('error', (e) => {
      console.error('Request error:', e.message);
    });
}, 8000); // wait 8 seconds for server to start
