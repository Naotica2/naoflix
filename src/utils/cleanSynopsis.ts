import { tSync } from '../misc/LanguageContext';

export function cleanSynopsis(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') {
    return tSync('detail.noSynopsis');
  }

  let s = raw;

  // 1. Strip HTML line breaks and paragraphs to clean newlines
  s = s.replace(/<br\s*[\/]?>/gi, '\n');
  s = s.replace(/<\/p>/gi, '\n\n');
  s = s.replace(/<[^>]+>/g, ' ');

  // 2. Decode common HTML entities
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&hellip;/gi, '...')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—');

  // 3. Remove metadata notes in brackets (e.g. [Written by MAL Rewrite], [Disalin dari ...], [Sumber: ...])
  s = s.replace(/\[\s*(?:Written by|Disalin dari|Dikutip dari|Sumber|Source|Oleh|MAL Rewrite|Dipublikasikan)[^\]]*\]/gi, '');
  s = s.replace(/\[\s*(?:b|i|u|s|url|img|quote|spoiler|code)[^\]]*\]/gi, '');
  s = s.replace(/\[\s*\/\s*(?:b|i|u|s|url|img|quote|spoiler|code)\s*\]/gi, '');
  s = s.replace(/\[\s*\.{2,}\s*\]/g, '');
  s = s.replace(/\[\s*\]/g, '');

  // 4. Remove common prefix clutter
  s = s.replace(/^(?:Sinopsis|Synopsis|Story|Description)\s*(?:Lengkap)?\s*[:\-–—]\s*/i, '');
  s = s.replace(/^(?:Bercerita\s+tentang|Menceritakan\s+tentang)\s*[:\-–—]?\s*/i, '');
  s = s.replace(/^Sinopsis\s+[A-Za-z0-9\s\-_]{3,40}\s*[:\-–—]\s*/i, '');

  // 5. Remove common translation / upload credit lines
  s = s.replace(/(?:Credit|Kredit|Translator|Penerjemah|Encoder|TLC|Typesetter|RAW)\s*[:\-–—][^\n]*/gi, '');
  s = s.replace(/(?:Download|Streaming)\s+Anime\s+[^\n]*/gi, '');
  s = s.replace(/(?:Baca Komik|Baca Manga)\s+[A-Za-z0-9\s\-_]+bahasa indonesia[^\n]*/gi, '');

  // 6. Clean unique symbols like asterisks, slashes, brackets, bullets
  // Remove comment-like artifacts (/* ... */ or //)
  s = s.replace(/\/\*+|\*+\//g, '');
  s = s.replace(/(^|\n)\s*\/\/[^\n]*/g, '');

  // Convert markdown bold/italic (**word** or *word*) to plain text (word)
  s = s.replace(/\*{2,3}([^*]+)\*{2,3}/g, '$1');
  s = s.replace(/(^|[^\w*])\*([^*\n]+)\*([^\w*]|$)/g, '$1$2$3');

  // Remove lines that are purely dividers like ***, ---, ===, ___
  s = s.replace(/^[*\-=_~#/|\s]{3,}$/gm, '');

  // Remove bullet points at the beginning of lines
  s = s.replace(/^[\u2022\u25cf\u25a0\u25c6\u25ba\u25b6\u2605\u2606*+\-\u2013\u2014]+\s*/gm, '');

  // Clean bracketed contents and stray brackets [ and ]
  s = s.replace(/\[([^\]\n]{1,80})\]/g, '$1');
  s = s.replace(/[\[\]]/g, '');

  // Clean weird slash patterns like " / " -> ", " or isolated slashes
  s = s.replace(/\s+\/\s+/g, ', ');
  s = s.replace(/(^|\n)\s*\/+\s*/g, '$1');
  s = s.replace(/\s*\/+\s*($|\n)/g, '$1');

  // Remove any remaining stray asterisks
  s = s.replace(/\*/g, '');

  // 7. Clean whitespace & line breaks
  s = s
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map(line => line.trim())
    .filter((line, i, arr) => {
      if (!line && (!arr[i - 1] || i === 0 || i === arr.length - 1)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return s || tSync('detail.noSynopsis');
}

export default cleanSynopsis;
