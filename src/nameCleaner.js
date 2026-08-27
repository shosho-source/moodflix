/**
 * NameCleaner - Sanitizes torrent release titles into clean, searchable movie names.
 * Ported and enhanced from the original The Rotten Cine Ruby name_cleaner.
 */

export class NameCleaner {
  static VIDEO_TYPES = [
    /\b2160p\b/i,
    /\b4k\b/i,
    /\buhd\b/i,
    /\b1080p\b/i,
    /\bfhd\b/i,
    /\b720p\b/i,
    /\b480p\b/i,
    /\bhd\b/i,
    /\bhdr\b/i,
    /\b10bit\b/i,
    /\bremux\b/i,
    /\bdvdrip\b/i,
    /\bxvid\b/i,
    /\bx264\b/i,
    /\bx265\b/i,
    /\bhevc\b/i,
    /\bbrrip\b/i,
    /\bbdrip\b/i,
    /\bbluray\b/i,
    /\bweb-?dl\b/i,
    /\bwebrip\b/i,
    /\bhdrip\b/i,
    /\bhdtv\b/i,
    /\bwidescreen\b/i,
    /\baac\b/i,
    /\b5\.1\b/i,
    /\b7\.1\b/i,
    /\bac3\b/i,
    /\bdts\b/i,
    /\bTS\b/,
    /\bSCR\b/i,
    /\bdvdscr\b/i,
    /\brerip\b/i,
    /\bunrated\b/i,
    /\bremastered\b/i,
    /\bdirectors\.?cut\b/i,
    /\bextended\b/i,
    /\blimited\b/i,
    /\bproper\b/i,
    /\brepack\b/i,
    /\bcomplete\b/i,
    /\bdocu\b/i
  ];

  static RELEASE_GROUPS = [
    /\bNOVA\b/i,
    /\bTWiZTED\b/i,
    /\bStealthmaster\b/i,
    /\bDUBBY\b/i,
    /\bDoNE\b/i,
    /\bTARGET\b/i,
    /\bFeel-Free\b/i,
    /\bMAXSPEED\b/i,
    /\b1337x\b/i,
    /\bDita496\b/i,
    /\bAbSurdiTy\b/i,
    /\bdxva\b/i,
    /\bV3nDetta\b/i,
    /\bExtraTorrentRG\b/i,
    /\bGHZ\b/i,
    /\bAMIABLE\b/i,
    /\bhonchorella\b/i,
    /\bMRShanku\b/i,
    /\bSilver RG\b/i,
    /\bArtSubs\b/i,
    /\bHORiZON\b/i,
    /\bZJM\b/i,
    /\bPSiG\b/i,
    /\bUsaBit\.com\b/i,
    /\bSTB\b/i,
    /\biLG\b/i,
    /\bUnKnOwN\b/i,
    /\bHDLiTE\b/i,
    /\bLPD\b/i,
    /\bHiest-1337x\b/i,
    /\baLeX\b/i,
    /\baXXo\b/i,
    /\bNLT\b/i,
    /\bNeDiVx\b/i,
    /\bPSYCHD\b/i,
    /\bN3WS\b/i,
    /\bYTS\b/i,
    /\bYIFY\b/i,
    /\bRARBG\b/i,
    /\bEVO\b/i,
    /\bFGT\b/i,
    /\bGECKOS\b/i,
    /\bFLUX\b/i,
    /\bSPARKS\b/i,
    /\bGokU61\b/i,
    /\btots\b/i
  ];

  static FILE_EXTENSIONS = /\.(avi|mp4|mkv|mov|wmv|part|torrent)$/i;
  static URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(?:com|org|net|se|to|io|me)\b)/gi;
  static SIZE_PATTERN = /\b\d+(\.\d+)?\s*(gb|mb|tb|gib|mib)\b/gi;
  static PUNCTUATION_PATTERN = /[\.\[\]\(\)\-_]/g;

  constructor(rawName) {
    this.rawName = rawName || '';
    this.cleanName = this.rawName;
  }

  getReleaseYear() {
    const matches = this.rawName.match(/\b(19\d\d|20\d\d)\b/g);
    if (!matches) return null;
    const currentYear = new Date().getFullYear();
    const validYears = matches
      .map(y => parseInt(y, 10))
      .filter(y => y >= 1900 && y <= currentYear + 2);

    if (validYears.length === 0) return null;
    if (validYears.length === 1) {
      // If the entire raw string is just the year itself (e.g. "1917" or "1984"), it's the title
      const trimmed = this.rawName.trim();
      if (trimmed === String(validYears[0])) {
        return null;
      }
      return validYears[0];
    }
    // If multiple years found (e.g. "1917 2019"), the last valid year in the title is the release year
    return validYears[validYears.length - 1];
  }

  clean() {
    let text = this.rawName;

    // 1. Remove URLs and domain names (e.g. www.Torrenting.com, UsaBit.com)
    text = text.replace(NameCleaner.URL_PATTERN, ' ');

    // 2. Remove file extensions (.avi, .mp4, etc.)
    text = text.replace(NameCleaner.FILE_EXTENSIONS, ' ');

    // 3. Remove bracket tags like [Eng], [NL Sub], [Kingdom Release], [1337x]
    text = text.replace(/\[[^\]]*\]/g, ' ');

    // 4. Remove file sizes (e.g. 1.85GB, 700MB)
    text = text.replace(NameCleaner.SIZE_PATTERN, ' ');

    // 5. Remove release year if present (without erasing year-titled movies)
    const year = this.getReleaseYear();
    if (year) {
      const withoutYear = text.replace(new RegExp(`\\b${year}\\b`, 'g'), ' ');
      if (withoutYear.replace(NameCleaner.PUNCTUATION_PATTERN, ' ').trim().length > 0) {
        text = withoutYear;
      }
    }

    // 6. Remove release groups
    for (const group of NameCleaner.RELEASE_GROUPS) {
      text = text.replace(group, ' ');
    }

    // 7. Remove video & audio format specs
    for (const vtype of NameCleaner.VIDEO_TYPES) {
      text = text.replace(vtype, ' ');
    }

    // 8. Clean punctuation (replace dots, brackets, underscores, dashes with spaces)
    text = text.replace(NameCleaner.PUNCTUATION_PATTERN, ' ');

    // 9. Remove any remaining release groups or specs post punctuation cleanup
    for (const group of NameCleaner.RELEASE_GROUPS) {
      text = text.replace(group, ' ');
    }
    for (const vtype of NameCleaner.VIDEO_TYPES) {
      text = text.replace(vtype, ' ');
    }

    // 10. Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    // Fallback if everything got stripped
    if (!text && this.rawName) {
      text = this.rawName.replace(NameCleaner.PUNCTUATION_PATTERN, ' ').replace(/\s+/g, ' ').trim();
    }

    this.cleanName = text;
    return this.cleanName;
  }

  static clean(title) {
    return new NameCleaner(title).clean();
  }
}
