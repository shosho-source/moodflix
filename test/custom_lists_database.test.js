import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import app from '../server.js';
import { Storage } from '../src/storage.js';

describe('Custom Lists & Database Connection Suite', () => {
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

  it('Storage manages custom lists locally with user isolation', () => {
    const userA = 'user_test_alpha';
    const userB = 'user_test_beta';

    const listA = Storage.saveCustomList(userA, {
      name: 'Alpha Favorites',
      description: 'Alpha list',
      color: '#ff2a5f'
    });

    const listB = Storage.saveCustomList(userB, {
      name: 'Beta Horrors',
      description: 'Beta list',
      color: '#10b981'
    });

    assert.ok(listA.id, 'listA has an assigned id');
    assert.strictEqual(listA.user_id, userA);

    const listsA = Storage.getCustomLists(userA);
    assert.ok(listsA.some(l => l.id === listA.id), 'userA has listA');
    assert.ok(!listsA.some(l => l.id === listB.id), 'userA does not have listB');

    // Clean up
    Storage.deleteCustomList(userA, listA.id);
    Storage.deleteCustomList(userB, listB.id);

    const afterA = Storage.getCustomLists(userA);
    assert.ok(!afterA.some(l => l.id === listA.id), 'listA deleted from storage');
  });

  it('POST /api/user/custom-lists validates name and creates list in database', async () => {
    // 1. Rejects missing name
    const failRes = await fetch(`${baseUrl()}/api/user/custom-lists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'test_db_user', name: '' })
    });
    assert.strictEqual(failRes.status, 400);

    // 2. Accepts either top-level or nested { list: { name } } payload
    const createRes = await fetch(`${baseUrl()}/api/user/custom-lists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'test_db_user',
        list: {
          name: 'Cyberpunk Curations',
          description: 'High tech, low life',
          color: '#00e5ff',
          icon: 'smart_toy'
        }
      })
    });

    assert.strictEqual(createRes.status, 200);
    const data = await createRes.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.list, 'returns created list');
    assert.strictEqual(data.list.name, 'Cyberpunk Curations');
    assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.list.id), 'list.id is a valid UUID for database');

    const createdId = data.list.id;

    // 3. GET /api/user/custom-lists returns the created list
    const getRes = await fetch(`${baseUrl()}/api/user/custom-lists?userId=test_db_user`);
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();
    assert.strictEqual(getData.success, true);
    assert.ok(Array.isArray(getData.lists));
    assert.ok(getData.lists.some(l => l.id === createdId && l.name === 'Cyberpunk Curations'));

    // 4. DELETE /api/user/custom-lists/:id deletes the list
    const delRes = await fetch(`${baseUrl()}/api/user/custom-lists/${createdId}?userId=test_db_user`, {
      method: 'DELETE'
    });
    assert.strictEqual(delRes.status, 200);
    const delData = await delRes.json();
    assert.strictEqual(delData.success, true);

    // 5. Verify deletion
    const verifyRes = await fetch(`${baseUrl()}/api/user/custom-lists?userId=test_db_user`);
    const verifyData = await verifyRes.json();
    assert.ok(!verifyData.lists.some(l => l.id === createdId));
  });

  it('PATCH /api/user/watchlist/:id links custom lists to watchlist item', async () => {
    const userId = 'test_list_link_user';
    const testItemId = 1234567; // TMDB ID

    // Add item to watchlist
    await fetch(`${baseUrl()}/api/user/watchlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        item: {
          id: testItemId,
          tmdbId: testItemId,
          title: 'Database Matrix Test',
          mediaType: 'movie'
        }
      })
    });

    // Create a custom list
    const listRes = await fetch(`${baseUrl()}/api/user/custom-lists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        name: 'Sci-Fi Gold',
        color: '#ff2a5f'
      })
    });
    const listData = await listRes.json();
    const listId = listData.list.id;

    // Link custom list to watchlist item
    const patchRes = await fetch(`${baseUrl()}/api/user/watchlist/${testItemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        updates: {
          custom_lists: [listId]
        }
      })
    });

    assert.strictEqual(patchRes.status, 200);
    const patchData = await patchRes.json();
    assert.strictEqual(patchData.success, true);

    // Clean up
    await fetch(`${baseUrl()}/api/user/custom-lists/${listId}?userId=${userId}`, { method: 'DELETE' });
    await fetch(`${baseUrl()}/api/user/watchlist/${testItemId}?userId=${userId}`, { method: 'DELETE' });
  });

  it('Storage.updateWatchlistItem updates watchlist items and custom_lists locally', () => {
    const testItem = {
      id: 'local_test_wl_1',
      tmdbId: 998877,
      title: 'Local Watchlist Update Test',
      custom_lists: []
    };
    Storage.addToWatchlist(testItem);

    const updated = Storage.updateWatchlistItem('local_test_wl_1', {
      custom_lists: ['list_uuid_alpha']
    });

    assert.ok(updated, 'item updated in storage');
    assert.deepStrictEqual(updated.custom_lists, ['list_uuid_alpha']);

    // Clean up
    Storage.removeFromWatchlist('local_test_wl_1');
  });

  it('UI defines viewCustomList, activeCustomListBanner, and manageListTitlesModal wiring', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const appJs = fs.readFileSync(path.resolve('public/app.js'), 'utf-8');
    const indexHtml = fs.readFileSync(path.resolve('public/index.html'), 'utf-8');
    const styleCss = fs.readFileSync(path.resolve('public/style.css'), 'utf-8');

    // UI elements exist in HTML
    assert.ok(indexHtml.includes('id="activeCustomListBanner"'), 'activeCustomListBanner exists in HTML');
    assert.ok(indexHtml.includes('id="manageListTitlesModal"'), 'manageListTitlesModal exists in HTML');
    assert.ok(indexHtml.includes('id="manageListChecklist"'), 'manageListChecklist exists in HTML');

    // JS functions and wiring
    assert.ok(appJs.includes('function viewCustomList('), 'viewCustomList is defined');
    assert.ok(appJs.includes('viewCustomList(btn.dataset.id)'), 'btn-view-list calls viewCustomList');
    assert.ok(appJs.includes('function openManageListTitlesModal('), 'openManageListTitlesModal is defined');
    assert.ok(appJs.includes('function closeManageListTitlesModal('), 'closeManageListTitlesModal is defined');
    assert.ok(appJs.includes('saveAssignLists'), 'saveAssignLists is defined');

    // CSS styles
    assert.ok(styleCss.includes('.active-custom-list-banner'), 'active-custom-list-banner styles defined');
    assert.ok(styleCss.includes('.manage-list-modal-card'), 'manage-list-modal-card styles defined');
  });
});
