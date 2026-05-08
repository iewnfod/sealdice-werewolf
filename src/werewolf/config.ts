import { DEFAULT_CONFIG } from './types';
import type { GameConfig, GameMode, RoleType, WerewolfGame } from './types';

export function isRoleType(value: string): value is RoleType {
  return ['狼人', '预言家', '女巫', '猎人', '守卫', '村民'].includes(value);
}

export function parseMode(raw: string): GameMode | undefined {
  const normalized = raw.trim().toLowerCase();
  if (normalized === '屠边' || normalized === 'tb' || normalized === '屠边/tb') {
    return '屠边';
  }

  if (normalized === '屠城' || normalized === 'tc' || normalized === '屠城/tc') {
    return '屠城';
  }

  return undefined;
}

export function summarizeRoles(config: GameConfig): string {
  return (Object.keys(config.roleCounts) as RoleType[])
    .map((role) => `${role}x${config.roleCounts[role]}`)
    .join('，');
}

export function countRoleTotal(config: GameConfig): number {
  return Object.values(config.roleCounts).reduce((sum, value) => sum + value, 0);
}

export function cloneDefaultConfig(): GameConfig {
  return {
    mode: DEFAULT_CONFIG.mode,
    playerCount: DEFAULT_CONFIG.playerCount,
    roleCounts: {
      狼人: DEFAULT_CONFIG.roleCounts.狼人,
      预言家: DEFAULT_CONFIG.roleCounts.预言家,
      女巫: DEFAULT_CONFIG.roleCounts.女巫,
      猎人: DEFAULT_CONFIG.roleCounts.猎人,
      守卫: DEFAULT_CONFIG.roleCounts.守卫,
      村民: DEFAULT_CONFIG.roleCounts.村民,
    },
  };
}

export function canStartGame(game: WerewolfGame): [boolean, string] {
  const roleTotal = countRoleTotal(game.config);
  if (roleTotal !== game.config.playerCount) {
    return [false, `角色数量总和(${roleTotal})与总人数(${game.config.playerCount})不一致`];
  }

  if (game.players.length !== game.config.playerCount) {
    return [false, `当前人数 ${game.players.length}/${game.config.playerCount}，请继续加入后再开局`];
  }

  return [true, 'ok'];
}

export function parseConfigArgs(game: WerewolfGame, args: string[]): [boolean, string] {
  if (args.length >= 1) {
    const mode = parseMode(args[0]);
    if (!mode) {
      return [false, '模式需为“屠边/tb”或“屠城/tc”'];
    }

    game.config.mode = mode;
  }

  if (args.length >= 2) {
    const count = Number(args[1]);
    if (!Number.isInteger(count) || count <= 0) {
      return [false, '人数必须是正整数'];
    }

    game.config.playerCount = count;
  }

  if (args.length > 2) {
    (Object.keys(game.config.roleCounts) as RoleType[]).forEach((role) => {
      game.config.roleCounts[role] = 0;
    });
  }

  const specifiedRoles = new Set<RoleType>();
  for (let i = 2; i < args.length; i += 1) {
    const raw = args[i];
    const parts = raw.split('=');
    if (parts.length !== 2) {
      return [false, `参数格式错误：${raw}，应为 角色=数量`];
    }

    const roleRaw = parts[0];
    const value = Number(parts[1]);
    if (!isRoleType(roleRaw)) {
      return [false, `未知角色：${parts[0]}`];
    }

    if (!Number.isInteger(value) || value < 0) {
      return [false, `角色数量需为非负整数：${raw}`];
    }

    game.config.roleCounts[roleRaw] = value;
    specifiedRoles.add(roleRaw);
  }

  if (specifiedRoles.size > 0 && !specifiedRoles.has('村民')) {
    const nonVillagerTotal = (Object.keys(game.config.roleCounts) as RoleType[])
      .filter((role) => role !== '村民')
      .reduce((sum, role) => sum + game.config.roleCounts[role], 0);
    const villagerCount = game.config.playerCount - nonVillagerTotal;
    if (villagerCount < 0) {
      return [false, `非村民角色总数(${nonVillagerTotal})超过总人数(${game.config.playerCount})`];
    }
    game.config.roleCounts.村民 = villagerCount;
  }

  return [true, 'ok'];
}
