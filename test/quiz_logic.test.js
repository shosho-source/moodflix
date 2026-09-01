import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TMDB } from '../src/tmdb.js';

describe('Assessment & Quiz Recommendation Logic', () => {
  it('returns distinct movies for Action vs Romance vs Horror parameters', async () => {
    const actionResults = await TMDB.getQuizRecommendations({
      mood: 'happy',
      occasion: 'solo',
      genres: ['Action'],
      recency: 'any',
      mediaPreference: 'movies'
    });

    const romanceResults = await TMDB.getQuizRecommendations({
      mood: 'sad',
      occasion: 'partner',
      genres: ['Romance'],
      recency: 'any',
      mediaPreference: 'movies'
    });

    const horrorResults = await TMDB.getQuizRecommendations({
      mood: 'neutral',
      occasion: 'friends',
      genres: ['Horror'],
      recency: 'any',
      mediaPreference: 'movies'
    });

    assert.ok(actionResults.length > 0, 'Action results returned');
    assert.ok(romanceResults.length > 0, 'Romance results returned');
    assert.ok(horrorResults.length > 0, 'Horror results returned');

    const topActionTitle = actionResults[0].title;
    const topRomanceTitle = romanceResults[0].title;
    const topHorrorTitle = horrorResults[0].title;

    // Must not be all identical
    assert.notStrictEqual(topActionTitle, topRomanceTitle, 'Action and Romance must yield different top recommendations');
    assert.notStrictEqual(topActionTitle, topHorrorTitle, 'Action and Horror must yield different top recommendations');
    assert.notStrictEqual(topRomanceTitle, topHorrorTitle, 'Romance and Horror must yield different top recommendations');
  });

  it('handles TV series preference correctly', async () => {
    const tvResults = await TMDB.getQuizRecommendations({
      mood: 'happy',
      occasion: 'solo',
      genres: ['Comedy'],
      recency: 'any',
      mediaPreference: 'tv'
    });

    assert.ok(tvResults.length > 0);
    assert.ok(tvResults.every(item => item.mediaType === 'tv'), 'All items should be TV shows');
  });
});
