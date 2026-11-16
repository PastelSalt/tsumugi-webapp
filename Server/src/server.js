import { createApp } from './app.js'
import { config } from './config.js'
import { connect, disconnect } from './db.js'
import { purgeOld } from './services/trash.js'

const uri = await connect()
console.log(`Database ready (${config.mongoUri ? uri.replace(/\/\/[^@]*@/, '//***@') : `local, stored in ${config.dataDir}`})`)
await purgeOld().then((c) => { if (Object.values(c).some(Boolean)) console.log('Purged old deleted records', c) }).catch((e) => console.warn('Purge skipped:', e.message))

const server = createApp().listen(config.port, '127.0.0.1', () => console.log(`Tsumugi API listening on http://localhost:${config.port}/api/v1`))

const stop = async () => { server.close(); await disconnect(); process.exit(0) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
