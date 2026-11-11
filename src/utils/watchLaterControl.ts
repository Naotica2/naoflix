import watchLaterJSON from '../types/watchLaterJSON';
import { DatabaseManager } from './DatabaseManager';

function controlWatchLater(action: 'add', data: watchLaterJSON): void;
function controlWatchLater(action: 'delete', index: number): void;
function controlWatchLater(action: 'add' | 'delete', data: watchLaterJSON | number) {
  let watchLater: watchLaterJSON[] = [];
  try {
    const parsed = JSON.parse(DatabaseManager.getSync('watchLater') || '[]');
    if (Array.isArray(parsed)) watchLater = parsed;
  } catch {}
  if (action === 'add') {
    watchLater.splice(0, 0, data as watchLaterJSON);
    DatabaseManager.set('watchLater', JSON.stringify(watchLater));
  } else if (action === 'delete') {
    watchLater.splice(data as number, 1);
    DatabaseManager.set('watchLater', JSON.stringify(watchLater));
  }
}

export default controlWatchLater;
