import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import app from '../server.js';
import { Storage } from '../src/storage.js';

describe('Watch Diary & Database Connection Suite', () => {
  let server;
  let port;

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  const baseUrl = () => `http://127.0.0.1:${port}`;

  it('Storage manages watch diary entries locally with user isolation', () => {
    const userA = 'user_diary_test_alpha';
    const userB = 'user_diary_test_beta';

    const entryA = Storage.saveDiaryEntry(userA, {
      title: 'Interstellar',
      rating: 9.5,
      watch_date: '2026-11-01',
      review: 'Masterpiece of modern sci-fi'
    });

    const entryB = Storage.saveDiaryEntry(userB, {
      title: 'The Shining',
      rating: 8.8,
      watch_date: '2026-10-31',
      review: 'Classic atmospheric horror'
    });

    assert.ok(entryA.id, 'entryA has an assigned id');
    assert.strictEqual(entryA.user_id, userA);
    assert.strictEqual(entryA.title, 'Interstellar');

    const diaryA = Storage.getDiaryEntries(userA);
    assert.ok(diaryA.some(e => e.id === entryA.id), 'userA has entryA');
    assert.ok(!diaryA.some(e => e.id === entryB.id), 'userA does not have entryB');

    // Clean up
    Storage.deleteDiaryEntry(userA, entryA.id);
    Storage.deleteDiaryEntry(userB, entryB.id);

    const afterA = Storage.getDiaryEntries(userA);
    assert.ok(!afterA.some(e => e.id === entryA.id), 'entryA deleted from storage');
  });

  it('POST /api/user/diary validates title and creates entry in database', async () => {
    // 1. Rejects missing title
    const failRes = await fetch(`${baseUrl()}/api/user/diary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'test_diary_db_user', title: '' })
    });
    assert.strictEqual(failRes.status, 400);

    // 2. Accepts nested { userId, entry: { title, ... } } payload from frontend
    const createRes = await fetch(`${baseUrl()}/api/user/diary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'test_diary_db_user',
        entry: {
          title: 'Blade Runner 2049',
          rating: 9.0,
          watched_date: '2026-11-05',
          review: 'Incredible visuals and sound design',
          rewatch: true,
          media_type: 'movie',
          year: 2017
        }
      })
    });

    assert.strictEqual(createRes.status, 200);
    const data = await createRes.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.entry, 'returns created diary entry');
    assert.strictEqual(data.entry.title, 'Blade Runner 2049');
    assert.strictEqual(data.entry.watch_date, '2026-11-05');
    assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.entry.id), 'entry.id is a valid UUID for database');

    const createdId = data.entry.id;

    // 3. GET /api/user/diary returns the created entry
    const getRes = await fetch(`${baseUrl()}/api/user/diary?userId=test_diary_db_user`);
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();
    assert.strictEqual(getData.success, true);
    assert.ok(Array.isArray(getData.diary));
    assert.ok(getData.diary.some(e => e.id === createdId && e.title === 'Blade Runner 2049'));

    // 4. DELETE /api/user/diary/:id deletes the entry
    const delRes = await fetch(`${baseUrl()}/api/user/diary/${createdId}?userId=test_diary_db_user`, {
      method: 'DELETE'
    });
    assert.strictEqual(delRes.status, 200);
    const delData = await delRes.json();
    assert.strictEqual(delData.success, true);

    // 5. Verify deletion
    const verifyRes = await fetch(`${baseUrl()}/api/user/diary?userId=test_diary_db_user`);
    const verifyData = await verifyRes.json();
    assert.ok(!verifyData.diary.some(e => e.id === createdId));
  });

  it('Frontend app.js wires database UUIDs, watch_date normalization, and lifecycle hooks', () => {
    const appJs = fs.readFileSync(path.resolve('public/app.js'), 'utf8');

    // UUID generation
    assert.ok(appJs.includes('crypto.randomUUID'), 'app.js uses crypto.randomUUID for diary entries');

    // watch_date normalization
    assert.ok(appJs.includes('entry.watch_date'), 'app.js supports entry.watch_date from database');

    // Lifecycle triggers
    assert.ok(appJs.includes("subTab === 'diary'"), 'subTab check exists');
    assert.ok(appJs.includes('loadDiaryEntries()'), 'loadDiaryEntries is called');
  });
});
