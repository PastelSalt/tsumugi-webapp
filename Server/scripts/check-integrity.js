// npm run check:integrity            report problems
// npm run check:integrity -- --fix   also remove dangling and duplicate links
import { connect, disconnect } from '../src/db.js'
import { checkIntegrity } from '../src/services/integrity.js'

await connect()
const result = await checkIntegrity({ fix: process.argv.includes('--fix') })
if (result.ok) console.log('Integrity check passed: no problems found.')
else {
  console.log(`Found ${result.problems.length} problem(s)${result.fixed ? `; removed ${result.fixed} bad link(s)` : ''}:`)
  for (const p of result.problems) console.log(' -', JSON.stringify(p))
}
await disconnect()
process.exitCode = result.ok ? 0 : 1
