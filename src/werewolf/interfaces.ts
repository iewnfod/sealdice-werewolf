import type { PlayerState, StorageRoot, WerewolfGame } from './types';

export type BoolResult = [boolean, string];
export type NightActionResult = [boolean, string, string];

export interface CommandContext {
  ctx: seal.MsgContext;
  msg: seal.Message;
  cmdArgs: seal.CmdArgs;
  ext: seal.ExtInfo;
  storage: StorageRoot;
  groupId: string;
  userId: string;
  game?: WerewolfGame;
}

export interface CommonDeps {
  parseSeat: (value: string) => number | undefined;
  getPlayer: (game: WerewolfGame, userId: string) => PlayerState | undefined;
  getSeatPlayer: (game: WerewolfGame, seat: number) => PlayerState | undefined;
  seatExistsAndAlive: (game: WerewolfGame, seat: number) => BoolResult;
  pushLog: (game: WerewolfGame, text: string) => void;
}
