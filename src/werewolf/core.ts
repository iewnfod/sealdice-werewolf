import { TIME_ZONE } from './types';
import type { GameConfig, PlayerState, RoleType, WerewolfGame } from './types';

export function createRet(showHelp = false): seal.CmdExecuteResult {
  const ret = seal.ext.newCmdExecuteResult(true);
  ret.showHelp = showHelp;
  return ret;
}

export function pushLog(game: WerewolfGame, text: string): void {
  const stamp = new Date().toLocaleString('zh-CN', {
    hour12: false,
    timeZone: TIME_ZONE,
  });
  game.logs.push(`[${stamp}] ${text}`);
}

export function getPlayer(game: WerewolfGame, userId: string): PlayerState | undefined {
  return game.players.find((item) => item.userId === userId);
}

export function getSeatPlayer(game: WerewolfGame, seat: number): PlayerState | undefined {
  return game.players.find((item) => item.seat === seat);
}

export function getAlivePlayers(game: WerewolfGame): PlayerState[] {
  return game.players.filter((item) => item.alive);
}

export function getAliveByRole(game: WerewolfGame, role: RoleType): PlayerState[] {
  return game.players.filter((item) => item.alive && item.role === role);
}

export function formatAliveSeats(game: WerewolfGame): string {
  return getAlivePlayers(game)
    .map((item) => `${item.seat}.${item.name}`)
    .join('、');
}

export function parseSeat(value: string): number | undefined {
  const seat = Number(value);
  if (!Number.isInteger(seat) || seat <= 0) {
    return undefined;
  }

  return seat;
}

export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

export function buildRolePool(config: GameConfig): RoleType[] {
  const result: RoleType[] = [];
  (Object.keys(config.roleCounts) as RoleType[]).forEach((role) => {
    for (let i = 0; i < config.roleCounts[role]; i += 1) {
      result.push(role);
    }
  });

  return result;
}

export function tallyVotes(votes: Record<string, number>): [number | undefined, boolean] {
  const counter = new Map<number, number>();
  Object.values(votes).forEach((seat) => {
    const old = counter.get(seat) ?? 0;
    counter.set(seat, old + 1);
  });

  let maxSeat: number | undefined;
  let maxVotes = 0;
  let tie = false;

  counter.forEach((value, seat) => {
    if (value > maxVotes) {
      maxVotes = value;
      maxSeat = seat;
      tie = false;
    } else if (value === maxVotes) {
      tie = true;
    }
  });

  if (!maxSeat) {
    return [undefined, false];
  }

  return [maxSeat, tie];
}

export function seatExistsAndAlive(game: WerewolfGame, seat: number): [boolean, string] {
  const player = getSeatPlayer(game, seat);
  if (!player) {
    return [false, `不存在座号 ${seat}`];
  }

  if (!player.alive) {
    return [false, `目标 ${seat}.${player.name} 已死亡`];
  }

  return [true, 'ok'];
}
