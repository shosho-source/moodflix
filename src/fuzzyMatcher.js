/**
 * FuzzyMatcher - Precision title matching, token overlap, and typo tolerance.
 * Pure algorithmic scoring without hardcoded dictionaries.
 */

import { NameCleaner } from './nameCleaner.js';

export class FuzzyMatcher {
  /**
   * Normalize title: lowercase, strip punctuation, collapse whitespace.
   */
  static normalize(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .toLowerCase()
      .replace(/[\._\-:\/\\,!'`"()\[\]?#&]/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  /**
   * Compact alphanumeric normalization (removes spaces, hyphens, and punctuation).
   * Allows "spiderman" to match "spider-man" and "spider man", "topgun" to match "top gun", etc.
   */
  static compact(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  /**
   * Compute Damerau-Levenshtein distance (supports transpositions of adjacent characters).
   */
  static levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const lenA = a.length;
    const lenB = b.length;
    const d = [];

    for (let i = 0; i <= lenA; i++) {
      d[i] = [];
      d[i][0] = i;
    }
    for (let j = 0; j <= lenB; j++) {
      d[0][j] = j;
    }

    for (let i = 1; i <= lenA; i++) {
      for (let j = 1; j <= lenB; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(
          d[i - 1][j] + 1,        // deletion
          d[i][j - 1] + 1,        // insertion
          d[i - 1][j - 1] + cost   // substitution
        );

        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); // transposition
        }
      }
    }
    return d[lenA][lenB];
  }

  /**
   * Normalized edit similarity (0.0 to 1.0)
   */
  static stringSimilarity(str1, str2) {
    const s1 = FuzzyMatcher.normalize(str1);
    const s2 = FuzzyMatcher.normalize(str2);

    if (s1 === s2) return 1.0;
    if (!s1.length || !s2.length) return 0.0;

    const maxLen = Math.max(s1.length, s2.length);
    const dist = FuzzyMatcher.levenshtein(s1, s2);
    return Math.max(0, 1 - (dist / maxLen));
  }

  /**
   * Token overlap similarity for multi-word titles and reordered terms.
   */
  static tokenSimilarity(target, candidate) {
    const normTarget = FuzzyMatcher.normalize(target);
    const normCandidate = FuzzyMatcher.normalize(candidate);

    if (!normTarget || !normCandidate) return 0;
    if (normTarget === normCandidate) return 1.0;

    const targetTokens = normTarget.split(' ').filter(w => w.length > 0);
    const candidateTokens = normCandidate.split(' ').filter(w => w.length > 0);

    if (targetTokens.length === 0 || candidateTokens.length === 0) {
      return FuzzyMatcher.stringSimilarity(normTarget, normCandidate);
    }

    let matchScoreSum = 0;
    for (const t of targetTokens) {
      let maxSim = 0;
      for (const c of candidateTokens) {
        if (t === c) {
          maxSim = 1.0;
          break;
        }
        const sim = FuzzyMatcher.stringSimilarity(t, c);
        if (sim > maxSim) maxSim = sim;
      }
      matchScoreSum += maxSim;
    }

    return matchScoreSum / targetTokens.length;
  }

  /**
   * Calculate comprehensive Title Relevance Score (0 to 100).
   * Tier 1: Exact match -> 100
   * Tier 2: Word-boundary / startsWith / compact-prefix match -> 85 - 95
   * Tier 3: Substring match -> 75 - 84
   * Tier 4: Token / Typo match -> 50 - 74
   */
  static calculateRelevanceScore(searchQuery, itemTitle, itemYear = null) {
    if (!searchQuery || !itemTitle) return 0;

    const cleanQuery = NameCleaner.clean(searchQuery) || searchQuery;
    const cleanItem = NameCleaner.clean(itemTitle) || itemTitle;

    const normQuery = FuzzyMatcher.normalize(cleanQuery);
    const normItem = FuzzyMatcher.normalize(cleanItem);

    const compactQuery = FuzzyMatcher.compact(cleanQuery) || FuzzyMatcher.compact(searchQuery);
    const compactItem = FuzzyMatcher.compact(cleanItem) || FuzzyMatcher.compact(itemTitle);

    if (!compactQuery || !compactItem) return 0;

    let score = 0;

    // 1. Tier 1: Exact match (standard or compact)
    if (normQuery === normItem || compactQuery === compactItem) {
      score = 100;
    }
    // 2. Tier 2: Word-boundary or prefix match
    else if (
      normItem.startsWith(normQuery + ' ') || 
      normItem.endsWith(' ' + normQuery) || 
      normItem.includes(' ' + normQuery + ' ') ||
      compactItem.startsWith(compactQuery)
    ) {
      const lengthRatio = compactQuery.length / compactItem.length;
      score = Math.round(85 + (lengthRatio * 10)); // 85 - 95
    }
    // 3. Tier 3: Substring match (either normalized or compact)
    else if (normItem.includes(normQuery) || compactItem.includes(compactQuery)) {
      const lengthRatio = compactQuery.length / compactItem.length;
      score = Math.round(75 + (lengthRatio * 10)); // 75 - 85
    }
    // 4. Tier 4: Typo / Damerau-Levenshtein & Token Overlap
    else {
      const levSim = Math.max(
        FuzzyMatcher.stringSimilarity(normQuery, normItem),
        FuzzyMatcher.stringSimilarity(compactQuery, compactItem)
      );
      const tokSim = FuzzyMatcher.tokenSimilarity(normQuery, normItem);
      const composite = Math.max(levSim, tokSim * 0.9);
      score = Math.round(composite * 80);
    }

    // Release year bonus or penalty
    const queryYear = new NameCleaner(searchQuery).getReleaseYear();
    if (queryYear && itemYear) {
      if (parseInt(queryYear, 10) === parseInt(itemYear, 10)) {
        score = Math.min(100, score + 10);
      } else {
        score = Math.max(0, score - 15);
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Sort array of items by relevance and popularity.
   */
  static rankByRelevance(items, searchQuery, titleKey = 'title', yearKey = 'year') {
    if (!Array.isArray(items) || items.length === 0) return [];
    if (!searchQuery) return items;

    return items
      .map(item => {
        const title = item[titleKey] || item.name || '';
        const year = item[yearKey] || (item.releaseDate ? item.releaseDate.slice(0, 4) : null);
        const relevance = FuzzyMatcher.calculateRelevanceScore(searchQuery, title, year);

        // Popularity bonus: logarithmic scale of voteCount (up to +15 points)
        const votes = item.voteCount || item.popularity || 0;
        let popBonus = 0;
        if (votes > 10) {
          popBonus = Math.min(15, Math.log10(votes) * 3.5);
        }

        const sortScore = (relevance * 0.85) + (popBonus * 1.5);

        return {
          ...item,
          relevanceScore: relevance,
          _sortScore: sortScore
        };
      })
      .sort((a, b) => {
        if (b._sortScore !== a._sortScore) {
          return b._sortScore - a._sortScore;
        }
        return (b.voteCount || 0) - (a.voteCount || 0);
      });
  }
}
