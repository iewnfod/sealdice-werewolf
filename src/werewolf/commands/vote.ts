import type { CommandContext } from '../interfaces';
import type { PlayerState, StorageRoot, WerewolfGame } from '../types';
import type { VoteTallyResult } from '../core';

type VoteDeps = {
  parseSeat: (value: string) => number | undefined;
  seatExistsAndAlive: (game: WerewolfGame, seat: number) => [boolean, string];
  getPlayer: (game: WerewolfGame, userId: string) => PlayerState | undefined;
  formatAliveSeats: (game: WerewolfGame) => string;
  tallyVotes: (votes: Record<string, number>) => VoteTallyResult;
  killSeat: (game: WerewolfGame, seat: number, reason: string) => string | undefined;
  judgeWinner: (game: WerewolfGame) => string | undefined;
  endGame: (game: WerewolfGame, winner: string) => string;
  initNight: (game: WerewolfGame) => string;
  pushLog: (game: WerewolfGame, text: string) => void;
  writeGame: (storage: StorageRoot, game: WerewolfGame) => void;
  saveStorage: (ext: seal.ExtInfo, storage: StorageRoot) => void;
};

export function handleVoteCommands(arg1: string, command: CommandContext, deps: VoteDeps): boolean {
  const { ctx, msg, cmdArgs, ext, storage, userId, game } = command;
  if (arg1 === '投票警长') {
    if (!game || game.phase !== 'sheriff') {
      seal.replyToSender(ctx, msg, '当前不是警长投票阶段。');
      return true;
    }

    const player = deps.getPlayer(game, userId);
    if (!player || !player.alive) {
      seal.replyToSender(ctx, msg, '你不是存活玩家，不能投票。');
      return true;
    }

    const seat = deps.parseSeat(cmdArgs.getArgN(2));
    if (!seat) {
      seal.replyToSender(ctx, msg, '用法：.狼人杀 投票警长 座号');
      return true;
    }

    const [ok, err] = deps.seatExistsAndAlive(game, seat);
    if (!ok) {
      seal.replyToSender(ctx, msg, err);
      return true;
    }

    game.sheriffVotes[userId] = seat;
    deps.pushLog(game, `${player.seat}.${player.name} 投票警长给 ${seat}号。`);
    deps.writeGame(storage, game);
    deps.saveStorage(ext, storage);
    seal.replyToSender(ctx, msg, `[狼人杀] 你已投票给 ${seat}号。`);
    return true;
  }

  if (arg1 === '结束警长投票') {
    if (!game || game.phase !== 'sheriff') {
      seal.replyToSender(ctx, msg, '当前不是警长投票阶段。');
      return true;
    }

    if (userId !== game.hostUserId) {
      seal.replyToSender(ctx, msg, '只有主持人可结束警长投票。');
      return true;
    }

    const [seat, tie] = deps.tallyVotes(game.sheriffVotes);
    if (!seat || tie) {
      game.sheriffSeat = undefined;
      deps.pushLog(game, '警长投票平票或无人投票，本局无警长。');
    } else {
      game.sheriffSeat = seat;
      deps.pushLog(game, `警长选举完成，${seat}号当选警长。`);
    }

    const pendingNightReport = game.pendingNightReport;
    game.pendingNightReport = undefined;
    const sheriffText = game.sheriffSeat ? `${game.sheriffSeat}号当选警长。` : '本局无警长。';

    if (pendingNightReport) {
      game.phase = 'day';
      game.dayVotes = {};
      deps.writeGame(storage, game);
      deps.saveStorage(ext, storage);
      seal.replyToSender(
        ctx,
        msg,
        `[狼人杀] 警长投票结束，${sheriffText}\n昨夜结果：${pendingNightReport}。存活：${deps.formatAliveSeats(game)}。请使用“.狼人杀 投票 座号”开始白天放逐投票，主持人使用“.狼人杀 结束投票”结算。`,
      );
      return true;
    }

    const prompt = deps.initNight(game);
    deps.writeGame(storage, game);
    deps.saveStorage(ext, storage);
    seal.replyToSender(ctx, msg, `[狼人杀] 警长投票结束，${sheriffText}\n${prompt}`);
    return true;
  }

  if (arg1 === '投票') {
    if (!game || game.phase !== 'day') {
      seal.replyToSender(ctx, msg, '当前不是白天投票阶段。');
      return true;
    }

    const player = deps.getPlayer(game, userId);
    if (!player || !player.alive) {
      seal.replyToSender(ctx, msg, '你不是存活玩家，不能投票。');
      return true;
    }

    const seat = deps.parseSeat(cmdArgs.getArgN(2));
    if (!seat) {
      seal.replyToSender(ctx, msg, '用法：.狼人杀 投票 座号');
      return true;
    }

    const [ok, err] = deps.seatExistsAndAlive(game, seat);
    if (!ok) {
      seal.replyToSender(ctx, msg, err);
      return true;
    }

    game.dayVotes[userId] = seat;
    deps.pushLog(game, `${player.seat}.${player.name} 放逐票投给 ${seat}号。`);
    deps.writeGame(storage, game);
    deps.saveStorage(ext, storage);
    seal.replyToSender(ctx, msg, `[狼人杀] 你已投票给 ${seat}号。`);
    return true;
  }

  if (arg1 === '结束投票') {
    if (!game || game.phase !== 'day') {
      seal.replyToSender(ctx, msg, '当前不是白天投票阶段。');
      return true;
    }

    if (userId !== game.hostUserId) {
      seal.replyToSender(ctx, msg, '只有主持人可结束投票。');
      return true;
    }

    const [seat, tie] = deps.tallyVotes(game.dayVotes);
    if (seat && !tie) {
      const dead = deps.killSeat(game, seat, '白天放逐');
      if (dead) {
        deps.pushLog(game, `${dead} 被白天放逐。`);
      }
    } else {
      deps.pushLog(game, '白天投票平票或无人投票，无人被放逐。');
    }

    const winner = deps.judgeWinner(game);
    let resultText = seat && !tie ? `${seat}号被放逐。` : '平票或无人投票，本轮无人出局。';
    if (winner) {
      resultText = `${resultText}\n${deps.endGame(game, winner)}`;
    } else {
      resultText = `${resultText}\n白天阶段结束，主持人可使用“.狼人杀 下一夜”进入下一夜。`;
    }

    deps.writeGame(storage, game);
    deps.saveStorage(ext, storage);
    seal.replyToSender(ctx, msg, `[狼人杀] ${resultText}`);
    return true;
  }

  if (arg1 === '下一夜') {
    if (!game) {
      seal.replyToSender(ctx, msg, '本群暂无对局。');
      return true;
    }

    if (userId !== game.hostUserId) {
      seal.replyToSender(ctx, msg, '只有主持人可推进阶段。');
      return true;
    }

    if (game.phase !== 'day') {
      seal.replyToSender(ctx, msg, '仅白天阶段可进入下一夜。');
      return true;
    }

    const winner = deps.judgeWinner(game);
    if (winner) {
      const text = deps.endGame(game, winner);
      deps.writeGame(storage, game);
      deps.saveStorage(ext, storage);
      seal.replyToSender(ctx, msg, `[狼人杀] ${text}`);
      return true;
    }

    const prompt = deps.initNight(game);
    deps.writeGame(storage, game);
    deps.saveStorage(ext, storage);
    seal.replyToSender(ctx, msg, `[狼人杀] ${prompt}`);
    return true;
  }

  return false;
}
