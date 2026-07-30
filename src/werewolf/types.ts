export type CampType = 'good' | 'wolf';
export type GameMode = '屠边' | '屠城';
export type RoleType = '狼人' | '预言家' | '女巫' | '猎人' | '守卫' | '村民';
export type PhaseType = 'lobby' | 'sheriff' | 'night' | 'day' | 'ended';
export type NightRole = '守卫' | '狼人' | '预言家' | '女巫';

export interface PlayerState {
  userId: string;
  name: string;
  seat: number;
  role?: RoleType;
  alive: boolean;
}

export interface GameConfig {
  mode: GameMode;
  playerCount: number;
  roleCounts: Record<RoleType, number>;
}

export interface NightState {
  round: number;
  order: NightRole[];
  stepIndex: number;
  wolfTarget?: number;
  guardTarget?: number;
  seerChecked?: number;
  witchSaveUsed: boolean;
  witchPoisonUsed: boolean;
  witchSaveTarget?: number;
  witchPoisonTarget?: number;
}

export interface WerewolfGame {
  groupId: string;
  groupName: string;
  hostUserId: string;
  config: GameConfig;
  phase: PhaseType;
  sheriffSeat?: number;
  players: PlayerState[];
  night?: NightState;
  sheriffVotes: Record<string, number>;
  dayVotes: Record<string, number>;
  logs: string[];
  winner?: string;
  pendingNightReport?: string;
  createdAt: number;
  endedAt?: number;
}

export interface GameHistoryItem {
  id: string;
  startedAt: number;
  endedAt: number;
  mode: GameMode;
  winner: string;
  rounds: number;
  summary: string[];
}

export type StorageRoot = {
  games: Record<string, WerewolfGame>;
  histories: Record<string, GameHistoryItem[]>;
};

export const GOD_ROLES: RoleType[] = ['预言家', '女巫', '猎人', '守卫'];
export const extName = '狼人杀';
export const author = 'Iewnfod';
export const STORAGE_KEY = 'werewolf:state:v1';
export const TIME_ZONE = 'Asia/Shanghai';
export const DEFAULT_CONFIG: GameConfig = {
  mode: '屠边',
  playerCount: 9,
  roleCounts: {
    狼人: 3,
    预言家: 1,
    女巫: 1,
    猎人: 1,
    守卫: 1,
    村民: 2,
  },
};
