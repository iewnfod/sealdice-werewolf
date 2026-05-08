import type { GameHistoryItem, StorageRoot, WerewolfGame } from './types';
import { STORAGE_KEY } from './types';
import { nowUnixTimestamp } from './time';

const HISTORY_ID_RANGE = 36 ** 4;

function createHistoryId(game: WerewolfGame): string {
  const time = nowUnixTimestamp().toString(36);
  const random = Math.floor(Math.random() * HISTORY_ID_RANGE)
    .toString(36)
    .padStart(4, '0');
  return `${game.groupId}-${time}-${random}`;
}

function createDefaultStorage(): StorageRoot {
  return {
    games: {},
    histories: {},
  };
}

export function parseStorage(ext: seal.ExtInfo): StorageRoot {
  const raw = ext.storageGet(STORAGE_KEY);
  if (!raw) {
    return createDefaultStorage();
  }

  try {
    return JSON.parse(raw) as StorageRoot;
  } catch (_error) {
    return createDefaultStorage();
  }
}

export function saveStorage(ext: seal.ExtInfo, storage: StorageRoot): void {
  ext.storageSet(STORAGE_KEY, JSON.stringify(storage));
}

function createHistoryItem(game: WerewolfGame): GameHistoryItem {
  return {
    id: createHistoryId(game),
    startedAt: game.createdAt,
    endedAt: game.endedAt ?? nowUnixTimestamp(),
    mode: game.config.mode,
    winner: game.winner ?? '未结算',
    rounds: game.night?.round ?? 0,
    summary: [...game.logs],
  };
}

export function readGame(storage: StorageRoot, groupId: string): WerewolfGame | undefined {
  return storage.games[groupId];
}

export function writeGame(storage: StorageRoot, game: WerewolfGame): void {
  storage.games[game.groupId] = game;
}

export function removeGame(storage: StorageRoot, groupId: string): void {
  delete storage.games[groupId];
}

export function persistFinishedGame(storage: StorageRoot, game: WerewolfGame): void {
  const list = storage.histories[game.groupId] ?? [];
  list.unshift(createHistoryItem(game));
  storage.histories[game.groupId] = list.slice(0, 20);
}

export function findHistoryById(storage: StorageRoot, groupId: string, historyId: string): GameHistoryItem | undefined {
  const list = storage.histories[groupId] ?? [];
  return list.find((item) => item.id === historyId);
}
