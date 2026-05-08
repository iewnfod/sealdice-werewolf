import type { NightActionResult } from '../interfaces';
import type { PlayerState, WerewolfGame } from '../types';

type GuardDeps = {
  parseSeat: (value: string) => number | undefined;
  seatExistsAndAlive: (game: WerewolfGame, seat: number) => [boolean, string];
  pushLog: (game: WerewolfGame, text: string) => void;
  advanceNightStep: (game: WerewolfGame) => string;
};

export function handleGuardAction(game: WerewolfGame, player: PlayerState, args: string[], deps: GuardDeps): NightActionResult {
  const seat = deps.parseSeat(args[0]);
  if (!seat) {
    return [false, '行动格式：.狼人杀 行动 座号', ''];
  }

  const [ok, err] = deps.seatExistsAndAlive(game, seat);
  if (!ok) {
    return [false, err, ''];
  }

  game.night!.guardTarget = seat;
  deps.pushLog(game, `守卫 ${player.seat}.${player.name} 守护了 ${seat}号。`);
  return [true, `你守护了 ${seat}号。`, deps.advanceNightStep(game)];
}
