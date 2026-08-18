// 本地开发用的嵌入式 PostgreSQL 服务器（PGlite，WASM 实现）
// 仅用于本地预览，生产环境请使用真实 PostgreSQL（docker-compose）
//
// 说明：pglite-socket 默认的多路复用器不为每个客户端连接隔离 prepared
// statement，Prisma 的 PREPARE s0 会在连接断开后残留，导致新连接报
// 42P05 "prepared statement already exists"。因此这里自定义 server：
// 每次连接建立/关闭时执行 DISCARD ALL 清理 session 状态。
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketHandler } from '@electric-sql/pglite-socket';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const PORT = parseInt(process.env.PGLITE_PORT || '5432', 10);
const HOST = process.env.PGLITE_HOST || '127.0.0.1';
const DATA_DIR = process.env.PGLITE_DATA_DIR || path.join(process.cwd(), '.pglite-data');
const DB_NAME = process.env.PGLITE_DB_NAME || 'project_tool';

mkdirSync(DATA_DIR, { recursive: true });
console.log(`[pglite] creating instance, dataDir=${DATA_DIR}`);

const db = await PGlite.create(DATA_DIR);

// 确保目标数据库存在（Prisma 连接串中的数据库名）
const rows = await db.query('SELECT datname FROM pg_database');
if (!rows.rows.some((r) => r.datname === DB_NAME)) {
  await db.exec(`CREATE DATABASE ${DB_NAME}`);
  console.log(`[pglite] created database "${DB_NAME}"`);
} else {
  console.log(`[pglite] database "${DB_NAME}" already exists`);
}

// 简单查询队列（复制自 pglite-socket 的 QueryQueueManager）
class QueryQueue {
  constructor(pg) {
    this.pg = pg;
    this.queue = [];
    this.processing = false;
    this.lastHandlerId = null;
  }

  async enqueue(handlerId, message, onData) {
    return new Promise((resolve, reject) => {
      this.queue.push({ handlerId, message, resolve, reject, onData });
      if (!this.processing) this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    try {
      while (this.queue.length > 0) {
        let item;
        if (this.pg.isInTransaction() && this.lastHandlerId) {
          const idx = this.queue.findIndex((q) => q.handlerId === this.lastHandlerId);
          item = idx === -1 ? null : this.queue.splice(idx, 1)[0];
        } else {
          item = this.queue.shift();
        }
        if (!item) break;
        try {
          await this.pg.runExclusive(async () => {
            await this.pg.execProtocolRawStream(item.message, {
              onRawData: (chunk) => item.onData(chunk),
            });
          });
          this.lastHandlerId = item.handlerId;
          item.resolve();
        } catch (err) {
          item.reject(err);
          break;
        }
      }
    } finally {
      this.processing = false;
    }
  }

  clearQueueForHandler(handlerId) {
    this.queue = this.queue.filter((item) => {
      if (item.handlerId === handlerId) {
        item.reject(new Error('Handler disconnected'));
        return false;
      }
      return true;
    });
  }

  async clearTransactionIfNeeded(handlerId) {
    if (this.pg.isInTransaction() && this.lastHandlerId === handlerId) {
      try {
        await this.pg.exec('ROLLBACK');
      } catch {}
      this.lastHandlerId = null;
      await this.processQueue();
    }
  }
}

const queryQueue = new QueryQueue(db);

const server = createServer(async (socket) => {
  // 连接建立：清理上一个连接残留的 session 状态（prepared statements、事务等）
  try {
    await db.exec('DISCARD ALL');
  } catch (e) {
    console.log(`[pglite] discard on connect: ${e.message}`);
  }

  const handler = new PGLiteSocketHandler({ queryQueue, closeOnDetach: true });
  try {
    await handler.attach(socket);
    handler.addEventListener('close', () => {
      db.exec('DISCARD ALL').catch(() => {});
    });
  } catch (e) {
    console.log(`[pglite] attach error: ${e.message}`);
    try {
      socket.end();
    } catch {}
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[pglite] server listening on ${HOST}:${PORT} (db=${DB_NAME})`);
});

async function shutdown() {
  try {
    server.close();
  } catch {}
  try {
    await db.close();
  } catch {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
