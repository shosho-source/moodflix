import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Storage } from '../src/storage.js';

describe('Storage', () => {
  it('manages settings and download records', () => {
    const initialSettings = Storage.getSettings();
    assert.ok(typeof initialSettings.minRating === 'number');

    const updated = Storage.updateSettings({ minRating: 8.2 });
    assert.strictEqual(updated.minRating, 8.2);

    const testItem = {
      movieTitle: 'Test Movie Alpha',
      name: 'Test.Movie.Alpha.2024.1080p',
      magnet: 'magnet:?xt=urn:btih:1234567890abcdef',
      quality: '1080p HD',
      rankScore: 85,
      seeders: 50
    };

    const record = Storage.recordDownload(testItem);
    assert.strictEqual(record.movieTitle, 'Test Movie Alpha');
    assert.strictEqual(Storage.hasDownloaded('Test Movie Alpha'), true);
    assert.strictEqual(Storage.hasDownloaded('Non Existent Movie'), false);

    // Clean up
    Storage.deleteDownload(record.id);
  });
});
