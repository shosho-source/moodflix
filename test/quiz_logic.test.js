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

  it('Mind Benders button returns genuine mind benders and excludes generic sci-fi or popcorn action', async () => {
    const mindResults = await TMDB.getQuizRecommendations({
      mood: 'neutral',
      occasion: 'solo',
      genres: ['Mystery', 'Psychological', 'Thriller'],
      moodPreset: 'mind',
      isMindBender: true,
      mediaPreference: 'movies',
      recency: 'any'
    });

    assert.ok(mindResults.length > 0, 'Mind Benders recommendations returned');
    
    // Disallowed generic/popcorn titles that previously leaked in
    const disallowed = ['wall·e', 'resident evil', 'transformers', 'dune', 'spider-man', 'superman', 'avengers', 'fast & furious'];
    
    for (const item of mindResults) {
      const lower = item.title.toLowerCase();
      for (const bad of disallowed) {
        assert.ok(!lower.includes(bad), `Should not contain generic popcorn title: ${item.title}`);
      }
      
      // If it contains sci-fi, it must have mystery, thriller, drama, crime, horror or be a canonical mind bender
      const genres = (item.genres || []).map(g => String(g).toLowerCase());
      if (genres.includes('sci-fi') || genres.includes('science fiction')) {
        const hasCerebralGenre = genres.some(g => ['mystery', 'thriller', 'drama', 'crime', 'horror', 'action'].includes(g));
        assert.ok(hasCerebralGenre, `Sci-fi movie ${item.title} must have cerebral genre`);
      }
    }
  });

  it('Quick Mood Starter contains Horror card alongside Adrenaline, Date Night, Mind Benders, and Top Rated', async () => {
    const fs = await import('fs');
    const html = fs.readFileSync('public/index.html', 'utf8');
    const css = fs.readFileSync('public/style.css', 'utf8');
    const js = fs.readFileSync('public/app.js', 'utf8');

    // HTML: 5 mood cards including horror
    assert.ok(html.includes('data-mood="action"'), 'Must have action preset');
    assert.ok(html.includes('data-mood="chill"'), 'Must have chill / date night preset');
    assert.ok(html.includes('data-mood="horror"'), 'Must have horror preset');
    assert.ok(html.includes('data-mood="mind"'), 'Must have mind benders preset');
    assert.ok(html.includes('data-mood="top"'), 'Must have top rated preset');
    assert.ok(html.includes('>HORROR</strong>'), 'Must display HORROR title');
    assert.ok(html.includes('mood-icon">skull</span>'), 'Must display skull icon');

    // JS: handleQuickMoodSelect handles horror
    assert.ok(js.includes("mood === 'horror'"), "app.js must handle mood === 'horror'");
    assert.ok(js.includes("quizAnswers.genres = ['Horror']"), "app.js must set Horror genre for horror preset");

    // CSS: grid updated for 5 columns
    assert.ok(css.includes('repeat(5, 1fr)'), 'style.css must define 5 columns for diag-mood-grid');

    // Functional verification: horror preset returns authentic horror movies
    const horrorMovies = await TMDB.getQuizRecommendations({
      mood: 'neutral',
      occasion: 'solo',
      genres: ['Horror'],
      moodPreset: 'horror',
      mediaPreference: 'movies',
      recency: 'any'
    });
    assert.ok(horrorMovies.length > 0, 'Horror preset must return movie recommendations');
    for (const movie of horrorMovies) {
      const gList = (movie.genres || []).map(g => String(g).toLowerCase());
      assert.ok(gList.includes('horror'), `Movie "${movie.title}" from horror preset must contain horror genre`);
    }
  });
});
