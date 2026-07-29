import defaultDatabase from '../misc/defaultDatabaseValue.json';

export type HistoryItemKey = `historyItem:${string}:${'true' | 'false'}:${'true' | 'false'}`;

export type SetDatabaseTarget = keyof typeof defaultDatabase;
