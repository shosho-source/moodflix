import { describe, it } from 'node:test';
import assert from 'node:assert';
import { FuzzyMatcher } from '../src/fuzzyMatcher.js';
import { Ranker } from '../src/ranker.js';

describe('FuzzyMatcher', () => {
  it('assigns 100 to exact title matches', () => {
    assert.strictEqual(FuzzyMatcher.calculateRelevanceScore('submarine', 'Submarine'), 100);
    assert.strictEqual(FuzzyMatcher.calculateRelevanceScore('Oppenheimer', 'oppenheimer'), 100);
    assert.strictEqual(FuzzyMatcher.calculateRelevanceScore('The Matrix', 'the matrix'), 100);
  });

  it('assigns high scores to word-boundary and substring matches', () => {
    const s1 = FuzzyMatcher.calculateRelevanceScore('submarine', 'Yellow Submarine');
    assert.ok(s1 >= 85, `Expected s1 >= 85, got ${s1}`);

    const s2 = FuzzyMatcher.calculateRelevanceScore('submarine', 'Submarine Command');
    assert.ok(s2 >= 85, `Expected s2 >= 85, got ${s2}`);

    const s3 = FuzzyMatcher.calculateRelevanceScore('submarine', 'The Atomic Submarine');
    assert.ok(s3 >= 85, `Expected s3 >= 85, got ${s3}`);
  });

  it('handles typos and misspellings with edit distance', () => {
    const cases = [
      { search: 'oppenheime', target: 'Oppenheimer', minScore: 65 },
      { search: 'gladaitor', target: 'Gladiator', minScore: 65 },
      { search: 'interstelar', target: 'Interstellar', minScore: 65 },
      { search: 'avataar', target: 'Avatar', minScore: 65 }
    ];

    for (const { search, target, minScore } of cases) {
      const score = FuzzyMatcher.calculateRelevanceScore(search, target);
      assert.ok(score >= minScore, `Expected score for "${search}" -> "${target}" to be >= ${minScore}, got ${score}`);
    }
  });

  it('ranks exact and best matches at the top', () => {
    const candidates = [
      { title: 'Gladiator Cop (1995)', voteCount: 50 },
      { title: 'Gladiator (2000)', voteCount: 20000 },
      { title: 'American Gladiators (2008)', voteCount: 100 },
      { title: 'Gladiators of Rome (2012)', voteCount: 30 }
    ];

    const ranked = FuzzyMatcher.rankByRelevance(candidates, 'Gladiator');
    assert.strictEqual(ranked[0].title, 'Gladiator (2000)');
    assert.strictEqual(ranked[0].relevanceScore, 100);
  });

  it('correctly scores numeric and year titles like 1917 and 2012', () => {
    const s1 = FuzzyMatcher.calculateRelevanceScore('1917', '1917 (2019)');
    assert.strictEqual(s1, 100, `Expected 100 for 1917 match, got ${s1}`);

    const s2 = FuzzyMatcher.calculateRelevanceScore('1984', '1984 1080p BluRay');
    assert.ok(s2 >= 85, `Expected s2 >= 85 for 1984, got ${s2}`);

    const s3 = FuzzyMatcher.calculateRelevanceScore('2012', '2012 (2009) 1080p');
    assert.strictEqual(s3, 100, `Expected 100 for 2012 match, got ${s3}`);
  });
});

describe('Ranker Relevance Integration', () => {
  it('places matching title on top even if another torrent has higher seeds', () => {
    const torrents = [
      {
        name: 'Gladiator.II.2024.1080p.BluRay.x264',
        seeders: 5000,
        size: 2 * 1024 * 1024 * 1024
      },
      {
        name: 'Gladiator.2000.Extended.1080p.BluRay.x264',
        seeders: 800,
        size: 3 * 1024 * 1024 * 1024
      },
      {
        name: 'Something.Unrelated.2024.1080p',
        seeders: 9000,
        size: 2 * 1024 * 1024 * 1024
      }
    ];

    const ranked = Ranker.rankTorrents(torrents, 'Gladiator 2000');
    assert.strictEqual(ranked[0].name, 'Gladiator.2000.Extended.1080p.BluRay.x264');
    assert.strictEqual(ranked[0].matchBadge, 'Exact Match');
  });
});
