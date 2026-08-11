/**
 * moviebox.ts — Now re-exports everything from lk21.ts
 *
 * This file exists purely for backwards compatibility so that all existing
 * imports from '../../utils/scrapers/moviebox' continue to work without
 * any changes throughout the codebase.
 *
 * The actual scraping logic now lives in lk21.ts.
 */

export * from './lk21';
