import deviceUserAgent from './deviceUserAgent';

export function getStreamHeaders(streamUrl?: string): Record<string, string> | undefined {
  if (!streamUrl) return undefined;
  const url = streamUrl.toLowerCase();

  const headers: Record<string, string> = {
    'User-Agent': deviceUserAgent,
  };

  if (url.includes('mp4upload.com')) {
    headers.Referer = 'https://www.mp4upload.com/';
    return headers;
  }
  if (url.includes('cloudflarestorage.com') || url.includes('r2.dev') || url.includes('filedon')) {
    headers.Referer = 'https://filedon.co/';
    return headers;
  }
  if (url.includes('odcloud.net') || url.includes('desustream') || url.includes('desudrive')) {
    headers.Referer = 'https://desustream.net/';
    return headers;
  }
  if (url.includes('otakudesu.blog') || url.includes('otakudesu.cloud')) {
    headers.Referer = 'https://otakudesu.blog/';
    return headers;
  }
  if (url.includes('pixeldrain.com')) {
    headers.Referer = 'https://pixeldrain.com/';
    return headers;
  }
  if (url.includes('archive.org')) {
    headers.Referer = 'https://archive.org/';
    return headers;
  }
  if (url.includes('berkasdrive.com') || url.includes('nimegami.id')) {
    headers.Referer = 'https://nimegami.id/';
    return headers;
  }
  if (url.includes('odvidhide.com') || url.includes('vidhide')) {
    headers.Referer = 'https://odvidhide.com/';
    return headers;
  }

  return headers;
}

export default getStreamHeaders;
