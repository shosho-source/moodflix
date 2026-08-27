/**
 * Ranker - Evaluates and scores torrents for Movies and TV Shows based on health,
 * video/audio quality, resolution, season pack completeness, uploader trust, and title relevance.
 */

import { FuzzyMatcher } from './fuzzyMatcher.js';

export class Ranker {
  /**
   * Calculates a composite quality score (0 to 100) for a torrent result.
   */
  static calculateQualityScore(torrent) {
    let score = 50; // base score
    const name = (torrent.name || '').toLowerCase();
    const seeds = parseInt(torrent.seeders || torrent.seeds || 0, 10);
    const sizeBytes = parseInt(torrent.size || 0, 10);
    const sizeGB = sizeBytes / (1024 * 1024 * 1024);

    // 1. Seeders Scoring (Logarithmic curve)
    if (seeds <= 0) {
      score -= 40;
    } else if (seeds < 5) {
      score -= 15;
    } else if (seeds < 20) {
      score += 5;
    } else if (seeds < 100) {
      score += 15;
    } else {
      score += Math.min(25, 15 + Math.log10(seeds) * 4);
    }

    // 2. Resolution & Video Source
    let detectedQuality = 'SD';
    let resolutionScore = 0;

    if (/2160p|4k|uhd/i.test(name)) {
      detectedQuality = '4K UHD';
      resolutionScore = 25;
    } else if (/1080p|fhd|bluray|bdrip|remux/i.test(name)) {
      detectedQuality = '1080p HD';
      resolutionScore = 20;
    } else if (/720p|hdrip|web-?dl|webrip/i.test(name)) {
      detectedQuality = '720p HD';
      resolutionScore = 15;
    } else if (/dvdrip|xvid/i.test(name)) {
      detectedQuality = 'DVDRip';
      resolutionScore = 5;
    }

    // Heavy penalty for low-quality recordings (CAM, TS, Telesync, Screeners)
    if (/\b(cam|hdcam|ts|telesync|scr|dvdscr|hdts)\b/i.test(name)) {
      detectedQuality = 'CAM/SCR';
      resolutionScore = -45;
    }

    score += resolutionScore;

    // 3. TV Season Pack / Batch Bonus
    let isPack = false;
    if (/\b(complete|season\s*\d+|s\d+\s*-\s*s\d+|batch|all\s*episodes|entire\s*series|series\s*pack)\b/i.test(name)) {
      isPack = true;
      score += 8; // bonus for full season bundles
    }

    // 4. Audio & Codec Bonus
    let audioCodecBonus = 0;
    if (/x265|hevc|10bit/i.test(name)) {
      audioCodecBonus += 5;
    }
    if (/5\.1|7\.1|atmos|dts|ac3|eac3|truehd/i.test(name)) {
      audioCodecBonus += 5;
    }
    score += audioCodecBonus;

    // 5. File Size Sanity Check
    if (sizeGB > 0) {
      if (sizeGB < 0.2) {
        score -= 20;
      } else if (sizeGB >= 0.5 && sizeGB <= 12.0) {
        score += 10;
      } else if (sizeGB > 12.0 && (isPack || detectedQuality.includes('4K'))) {
        score += 10;
      }
    }

    // 6. Trusted / VIP Uploader bonus
    if (torrent.status === 'vip' || torrent.status === 'trusted') {
      score += 10;
    }

    // Normalize between 0 and 100
    const finalScore = Math.max(0, Math.min(100, Math.round(score)));

    return {
      qualityScore: finalScore,
      quality: detectedQuality,
      isPack,
      seeds,
      sizeFormatted: Ranker.formatBytes(sizeBytes)
    };
  }

  /**
   * Sort a list of torrents by composite score (Relevance + Quality)
   * Ensures the most relevant and best-quality release is on top.
   */
  static rankTorrents(torrents, searchQuery = '') {
    if (!Array.isArray(torrents)) return [];

    return torrents
      .map(torrent => {
        const qualityMetrics = Ranker.calculateQualityScore(torrent);
        let relevanceScore = 100;
        let matchBadge = 'Best Match';

        if (searchQuery) {
          relevanceScore = FuzzyMatcher.calculateRelevanceScore(searchQuery, torrent.name);
          if (relevanceScore >= 90) matchBadge = 'Exact Match';
          else if (relevanceScore >= 70) matchBadge = 'Best Match';
          else if (relevanceScore >= 45) matchBadge = 'Fuzzy Match';
          else matchBadge = 'Partial';
        }

        // Composite rank score:
        let compositeScore;
        if (searchQuery) {
          if (relevanceScore < 40) {
            compositeScore = Math.round(relevanceScore * 0.5);
          } else {
            compositeScore = Math.round((relevanceScore * 0.45) + (qualityMetrics.qualityScore * 0.55));
          }
        } else {
          compositeScore = qualityMetrics.qualityScore;
        }

        return {
          ...torrent,
          rankScore: compositeScore,
          qualityScore: qualityMetrics.qualityScore,
          relevanceScore,
          matchBadge,
          qualityBadge: qualityMetrics.quality,
          isPack: qualityMetrics.isPack,
          sizeFormatted: qualityMetrics.sizeFormatted
        };
      })
      .sort((a, b) => {
        // Primary sort: Composite rank score descending
        if (b.rankScore !== a.rankScore) {
          return b.rankScore - a.rankScore;
        }
        // Secondary sort: Seed count descending
        return (b.seeders || 0) - (a.seeders || 0);
      });
  }

  static calculateScore(torrent) {
    const res = Ranker.calculateQualityScore(torrent);
    return {
      score: res.qualityScore,
      quality: res.quality,
      seeds: res.seeds,
      sizeFormatted: res.sizeFormatted
    };
  }

  static formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
