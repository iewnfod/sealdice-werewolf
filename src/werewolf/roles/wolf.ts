import type { NightActionResult } from '../interfaces';
import type { PlayerState, WerewolfGame } from '../types';

type WolfDeps = {
  parseSeat: (value: string) => number | undefined;
  seatExistsAndAlive: (game: WerewolfGame, seat: number) => [boolean, string];
  pushLog: (game: WerewolfGame, text: string) => void;
  advanceNightStep: (game: WerewolfGame) => string;
};

export function handleWolfAction(game: WerewolfGame, player: PlayerState, args: string[], deps: WolfDeps): NightActionResult {
  const seat = deps.parseSeat(args[0]);
  if (!seat) {
    return [false, '行动格式：.狼人杀 行动 座号', ''];
  }

  const [ok, err] = deps.seatExistsAndAlive(game, seat);
  if (!ok) {
    return [false, err, ''];
  }

  game.night!.wolfTarget = seat;
  deps.pushLog(game, `狼人 ${player.seat}.${player.name} 提交袭击目标 ${seat}号。`);
  return [true, `本夜狼人目标已记录：${seat}号。`, deps.advanceNightStep(game)];
}
