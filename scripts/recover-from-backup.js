#!/usr/bin/env node
/**
 * Recover sessions that exist in a backup DB but are missing from the live cache.
 *
 * Agentlytics is a cache over the editors' files. When an editor prunes old
 * transcripts, those sessions survive only in the cache — and a past destructive
 * refetch wiped some of them. This script merges the missing chats (+ their
 * stats, messages, tool_calls) from an older backup back into the live cache.
 *
 * The recovered chats have no live source, so the now-non-destructive refetch
 * never deletes them — they persist and display after a refresh.
 *
 * Usage: node scripts/recover-from-backup.js <backup.db>   (daemon must be stopped)
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CACHE_DIR = path.join(os.homedir(), '.agentlytics');
const LIVE = path.join(CACHE_DIR, 'cache.db');
const SRC = process.argv[2];

if (!SRC || !fs.existsSync(SRC)) { console.error(`backup not found: ${SRC}`); process.exit(1); }
if (!fs.existsSync(LIVE)) { console.error(`live cache not found: ${LIVE}`); process.exit(1); }

// Attach a throwaway copy of the backup so we never create sidecars on it.
const tmpSrc = path.join(os.tmpdir(), `recover-src-${process.pid}.db`);
fs.copyFileSync(SRC, tmpSrc);

const db = new Database(LIVE);
db.pragma('journal_mode = WAL');

// Pre-merge safety snapshot of the live cache.
db.pragma('wal_checkpoint(TRUNCATE)');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
const preMerge = path.join(CACHE_DIR, 'backups', `cache.db.pre-merge.${stamp}`);
fs.copyFileSync(LIVE, preMerge);
console.log(`pre-merge backup: ${preMerge}`);

const before = db.prepare('SELECT COUNT(*) c FROM chats').get().c;
const beforeMsg = db.prepare('SELECT COUNT(*) c FROM messages').get().c;

db.exec(`ATTACH '${tmpSrc}' AS bk`);

const merge = db.transaction(() => {
  db.exec(`CREATE TEMP TABLE _missing AS
           SELECT id FROM bk.chats WHERE id NOT IN (SELECT id FROM main.chats)`);
  const n = db.prepare('SELECT COUNT(*) c FROM _missing').get().c;

  db.exec(`INSERT INTO main.chats (id,source,name,mode,folder,created_at,last_updated_at,encrypted,bubble_count,_meta)
           SELECT id,source,name,mode,folder,created_at,last_updated_at,encrypted,bubble_count,_meta
           FROM bk.chats WHERE id IN (SELECT id FROM _missing)`);

  db.exec(`INSERT OR IGNORE INTO main.chat_stats
           (chat_id,total_messages,user_messages,assistant_messages,tool_messages,system_messages,tool_calls,models,
            total_user_chars,total_assistant_chars,total_input_tokens,total_output_tokens,total_cache_read,total_cache_write,analyzed_at)
           SELECT chat_id,total_messages,user_messages,assistant_messages,tool_messages,system_messages,tool_calls,models,
            total_user_chars,total_assistant_chars,total_input_tokens,total_output_tokens,total_cache_read,total_cache_write,analyzed_at
           FROM bk.chat_stats WHERE chat_id IN (SELECT id FROM _missing)`);

  // messages/tool_calls have autoincrement PKs — omit id to avoid collisions.
  db.exec(`INSERT INTO main.messages (chat_id,seq,role,content,model,input_tokens,output_tokens,cache_read,cache_write)
           SELECT chat_id,seq,role,content,model,input_tokens,output_tokens,cache_read,cache_write
           FROM bk.messages WHERE chat_id IN (SELECT id FROM _missing)`);

  db.exec(`INSERT INTO main.tool_calls (chat_id,tool_name,args_json,source,folder,timestamp)
           SELECT chat_id,tool_name,args_json,source,folder,timestamp
           FROM bk.tool_calls WHERE chat_id IN (SELECT id FROM _missing)`);

  return n;
});

const merged = merge();
db.exec('DROP TABLE IF EXISTS _missing');
db.exec('DETACH bk');

const after = db.prepare('SELECT COUNT(*) c FROM chats').get().c;
const afterMsg = db.prepare('SELECT COUNT(*) c FROM messages').get().c;
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
fs.rmSync(tmpSrc, { force: true });

console.log(`chats:    ${before} -> ${after}  (+${after - before}, missing set ${merged})`);
console.log(`messages: ${beforeMsg} -> ${afterMsg}  (+${afterMsg - beforeMsg})`);
console.log('done.');
