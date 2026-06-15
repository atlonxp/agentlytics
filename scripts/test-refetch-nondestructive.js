#!/usr/bin/env node
/**
 * Regression test for the "refresh wipes history" data-loss bug.
 *
 * Agentlytics is a cache OVER the editors' own files. A session whose source
 * file the editor has since pruned/deleted lives ONLY in the cache. The old
 * Refetch/Live path wiped cache.db before rescanning, so such sessions were
 * lost permanently. This test pins the fix:
 *
 *   1. forceRescanAsync (the new /api/refetch path) must re-parse present
 *      sources WITHOUT deleting chats whose source is absent from the scan.
 *   2. resetAndRescanAsync (the explicit Hard reset) may wipe, but must take a
 *      backup first.
 *
 * Run: node scripts/test-refetch-nondestructive.js
 */
const os = require('os');
const fs = require('fs');
const path = require('path');

// Point cache.js at a throwaway HOME so we never touch the real ~/.agentlytics.
const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'agentlytics-test-'));
process.env.HOME = TMP_HOME;
process.env.USERPROFILE = TMP_HOME; // win32

const cache = require('../cache.js');
cache.initDb();
// Always read the live handle: resetAndRescanAsync closes & reopens the DB.
const db = () => cache.getDb();

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); }
  else { console.log(`  ✗ ${msg}`); failures++; }
}

// Seed an "absent-source" session: it exists in the cache but will NOT be
// returned by the next scan (its editor file is gone).
function seedAbsentChat(id) {
  db().prepare(`INSERT OR REPLACE INTO chats (id, source, name, mode, folder, created_at, last_updated_at, encrypted, bubble_count, _meta)
              VALUES (?, 'claude-code', 'Old pruned session', NULL, '/tmp/old', 1700000000000, 1700000100000, 0, 4, '{}')`).run(id);
  db().prepare(`INSERT OR REPLACE INTO chat_stats (chat_id, total_messages, user_messages, assistant_messages)
              VALUES (?, 2, 1, 1)`).run(id);
  db().prepare(`INSERT INTO messages (chat_id, seq, role, content) VALUES (?, 0, 'user', 'hello from the past')`).run(id);
}

function chatExists(id) { return !!db().prepare('SELECT 1 FROM chats WHERE id = ?').get(id); }
function msgCount(id) { return db().prepare('SELECT COUNT(*) c FROM messages WHERE chat_id = ?').get(id).c; }

(async () => {
  console.log('Test 1: forceRescanAsync preserves a session whose source is gone');
  seedAbsentChat('absent-Z');
  // A "present" source returned by the scan (no name/bubbles -> analyze skipped, no source read).
  const presentChat = {
    composerId: 'present-P', source: 'claude-code', name: null,
    folder: null, createdAt: 1781000000000, lastUpdatedAt: 1781000000000, bubbleCount: 0,
  };
  assert(typeof cache.forceRescanAsync === 'function', 'forceRescanAsync is exported');
  await cache.forceRescanAsync(() => {}, { chats: [presentChat] });
  assert(chatExists('absent-Z'), 'absent-source session survives the refetch');
  assert(msgCount('absent-Z') === 1, 'its messages survive the refetch');
  assert(chatExists('present-P'), 'present source is (re)scanned in');

  console.log('Test 2: resetAndRescanAsync (Hard reset) backs up before wiping');
  seedAbsentChat('absent-Z2');
  const backupsDir = path.join(TMP_HOME, '.agentlytics', 'backups');
  const before = fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir).length : 0;
  await cache.resetAndRescanAsync(() => {});
  const after = fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir).length : 0;
  assert(after > before, 'a backup file was written before the wipe');
  assert(!chatExists('absent-Z2'), 'hard reset does wipe (recoverable from the backup)');

  console.log('');
  if (failures) { console.log(`FAILED: ${failures} assertion(s)`); process.exit(1); }
  console.log('ALL PASSED');
  try { fs.rmSync(TMP_HOME, { recursive: true, force: true }); } catch {}
})();
