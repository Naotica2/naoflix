import { __ALIAS as aliasAnime, BASE as animeBase } from './scrapers/animeSeries';
import { __ALIAS as aliasKomiku, DOMAIN as komikuDomain } from './scrapers/komiku';
import { __ALIAS as aliasAnimeindo, DOMAIN as animeindoDomain } from './scrapers/animeindo';
import { __ALIAS as aliasMeio, DOMAIN as meioDomain } from './scrapers/meionovel';
import { __ALIAS as aliasAnimelovers, DOMAIN as animeloversDomain } from './scrapers/animelovers';

type Type = 'komiku' | 'anime' | 'movie' | 'komikcast' | 'animeindo' | 'novel' | 'animelovers';

export function determineType(url: string): Type {
  const urlObj = new URL(url);
  if (urlObj.hostname.includes(aliasAnimeindo) || urlObj.hostname.includes('anime-indo')) return 'animeindo';
  if (urlObj.hostname.includes(aliasAnimelovers) || urlObj.hostname.includes('api.fruatre.my.id')) return 'animelovers';
  if (urlObj.hostname.includes(aliasKomiku)) return 'komiku';

  if (urlObj.hostname.includes(aliasMeio)) return 'novel';
  if (urlObj.hostname.includes(aliasAnime)) return 'anime';
  return 'movie';
}


export function generateUrlWithLatestDomain(url: string): string {
  const urlObj = new URL(url);
  const type = determineType(url);

  let newDomain = '';
  let matchedAlias = '';

  switch (type) {
    case 'komiku':
      newDomain = komikuDomain;
      matchedAlias = aliasKomiku;
      break;
    case 'anime':
      newDomain = animeBase.domain;
      matchedAlias = aliasAnime;
      break;
    case 'animeindo':
      newDomain = animeindoDomain;
      matchedAlias = aliasAnimeindo;
      break;
    case 'animelovers':
      newDomain = animeloversDomain;
      matchedAlias = aliasAnimelovers;
      break;
    case 'novel':
      newDomain = meioDomain;
      matchedAlias = aliasMeio;
      break;
    case 'movie':
      return urlObj.toString();
  }

  const oldAliasIndex = urlObj.hostname.indexOf(matchedAlias);
  const newAliasIndex = newDomain.indexOf(matchedAlias);

  let oldSubdomain = '';
  if (oldAliasIndex > 0) {
    oldSubdomain = urlObj.hostname.substring(0, oldAliasIndex);
  }
  let newSubdomain = '';
  if (newAliasIndex > 0) {
    newSubdomain = newDomain.substring(0, newAliasIndex);
  }
  if (newSubdomain !== '') {
    urlObj.hostname = newDomain;
  } else {
    urlObj.hostname = oldSubdomain + newDomain;
  }

  return urlObj.toString();
}
