import { spawn } from 'node:child_process';

const services = [
  ['services/auth-service', 4001],
  ['services/content-service', 4002],
  ['services/gradebook-service', 4003],
  ['services/plan-builder-service', 4004],
  ['services/analytics-service', 4005],
  ['services/ar-session-service', 4006],
  ['services/api-gateway', 4000],
  ['apps/web', 3000]
];

for (const [workspace, port] of services) {
  const child = spawn('npm', ['run', 'start', '--workspace', workspace], {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(port) },
    shell: true
  });
  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`${workspace} exited with code ${code}`);
    }
  });
}
