import pkg from '../package.json';
import { handleLobbyCommands } from './werewolf/commands/lobby';
import { handleMetaCommands } from './werewolf/commands/meta';
import { handleVoteCommands } from './werewolf/commands/vote';
import { canStartGame, cloneDefaultConfig, parseConfigArgs, summarizeRoles } from './werewolf/config';
import { buildRolePool, createRet, formatAliveSeats, getPlayer, getSeatPlayer, parseSeat, pushLog, seatExistsAndAlive, shuffle, tallyVotes } from './werewolf/core';
import { advanceNightStep, currentNightRole, endGame, initNight, judgeWinner, killSeat } from './werewolf/flow';
import { formatHelp } from './werewolf/help';
import type { CommandContext } from './werewolf/interfaces';
import { handleNightActionPrivate, findPrivateActionGame } from './werewolf/role-actions';
import { renderStatus } from './werewolf/status';
import { parseStorage, persistFinishedGame, readGame, removeGame, saveStorage, writeGame } from './werewolf/storage';
import { author, extName } from './werewolf/types';

const version = pkg.version;

function collectArgs(cmdArgs: seal.CmdArgs, startIndex: number): string[] {
  const result: string[] = [];
  for (let i = startIndex; ; i += 1) {
    const value = cmdArgs.getArgN(i);
    if (!value) {
      break;
    }
    result.push(value);
  }
  return result;
}

function buildCommandContext(ctx: seal.MsgContext, msg: seal.Message, cmdArgs: seal.CmdArgs, ext: seal.ExtInfo): CommandContext {
  const storage = parseStorage(ext);
  const groupId = ctx.group?.groupId ?? '';
  const userId = ctx.player.userId;
  const game = groupId ? readGame(storage, groupId) : undefined;
  return { ctx, msg, cmdArgs, ext, storage, groupId, userId, game };
}

function solvePrivateCommand(command: CommandContext, arg1: string): boolean {
  const { ctx, msg, cmdArgs, ext, storage } = command;
  if (arg1 !== '行动') {
    seal.replyToSender(ctx, msg, '私聊仅支持“.狼人杀 行动 ...”');
    return true;
  }

  const game = findPrivateActionGame(storage, ctx.player.userId, getPlayer, currentNightRole);
  if (!game) {
    seal.replyToSender(ctx, msg, '未找到你可执行行动的夜晚对局。');
    return true;
  }

  const args = collectArgs(cmdArgs, 2);
  const [ok, privateMsg, groupMsg] = handleNightActionPrivate(game, ctx.player.userId, args, {
    parseSeat,
    getPlayer,
    getSeatPlayer,
    seatExistsAndAlive,
    currentNightRole,
    advanceNightStep,
    pushLog,
  });
  if (!ok) {
    seal.replyToSender(ctx, msg, privateMsg);
    return true;
  }

  writeGame(storage, game);
  saveStorage(ext, storage);
  seal.replyToSender(ctx, msg, privateMsg);
  if (groupMsg) {
    seal.replyGroup(ctx, msg, `[狼人杀] ${groupMsg}`);
  }
  return true;
}

function solveGroupCommand(command: CommandContext, arg1: string): boolean {
  if (
    handleLobbyCommands(
      arg1,
      command,
      {
        cloneDefaultConfig,
        parseConfigArgs,
        summarizeRoles,
        canStartGame,
        buildRolePool,
        shuffle,
        initNight,
        getPlayer,
        pushLog,
        writeGame,
        removeGame,
        saveStorage,
      },
    )
  ) {
    return true;
  }

  if (
    handleVoteCommands(
      arg1,
      command,
      {
        parseSeat,
        seatExistsAndAlive,
        getPlayer,
        formatAliveSeats,
        tallyVotes,
        killSeat,
        judgeWinner,
        endGame,
        initNight,
        pushLog,
        writeGame,
        saveStorage,
      },
    )
  ) {
    return true;
  }

  return handleMetaCommands(
    arg1,
    command,
    {
      renderStatus,
      pushLog,
      persistFinishedGame,
      removeGame,
      saveStorage,
    },
  );
}

function main(): void {
  let ext = seal.ext.find(extName);
  if (!ext) {
    ext = seal.ext.new(extName, author, version);
    seal.ext.register(ext);
  }

  const werewolfCmd = seal.ext.newCmdItemInfo();
  werewolfCmd.name = '狼人杀';
  werewolfCmd.help = formatHelp();
  werewolfCmd.solve = (ctx, msg, cmdArgs) => {
    const arg1 = cmdArgs.getArgN(1);
    const ret = createRet(false);
    if (!arg1 || arg1 === 'help') {
      ret.showHelp = true;
      return ret;
    }

    const command = buildCommandContext(ctx, msg, cmdArgs, ext);
    if (ctx.isPrivate) {
      solvePrivateCommand(command, arg1);
      return ret;
    }

    const handled = solveGroupCommand(command, arg1);
    if (!handled) {
      seal.replyToSender(ctx, msg, `未知命令：${arg1}，可用“.狼人杀 help”查看帮助。`);
    }
    return ret;
  };

  ext.cmdMap['狼人杀'] = werewolfCmd;
}

main();
