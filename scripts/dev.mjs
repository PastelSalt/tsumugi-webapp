// Starts the API (with its local database) and the web app together: `npm run dev` from the repository root.
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const children = []

function run(name, dir, color) {
  const child = spawn('npm', ['run', 'dev'], { cwd: path.join(root, dir), shell: true, env: { ...process.env, FORCE_COLOR: '1' } })
  const tag = `\u001b[${color}m[${name}]\u001b[0m `
  const pipe = (stream, out) => stream.on('data', (d) => d.toString().split(/\r?\n/).filter(Boolean).forEach((line) => out.write(`${tag}${line}\n`)))
  pipe(child.stdout, process.stdout)
  pipe(child.stderr, process.stderr)
  child.on('exit', (code) => { console.log(`${tag}stopped (${code})`); stop() })
  children.push(child)
}

let stopping = false
function stop() {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: true })
    else child.kill('SIGINT')
  }
  setTimeout(() => process.exit(0), 1500)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

console.log('Starting Tsumugi: API on http://localhost:3001, app on http://localhost:5173 (Ctrl+C stops both)')
run('api', 'Server', '36')
setTimeout(() => run('web', 'client', '35'), 1500)
