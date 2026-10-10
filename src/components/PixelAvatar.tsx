import React from 'react';

export type AvatarId = 'boy' | 'girl' | 'robot';
export type AccessoryId = 'none' | 'glasses' | 'shades' | 'cap' | 'beanie' | 'crown';

export interface AvatarConfig {
  char: AvatarId;
  skin: string;
  hair: string;
  bg: string;
  accessory: AccessoryId;
}

interface AvatarDef {
  id: AvatarId;
  label: string;
  palette: Record<string, string>;
  grid: string[];
}

interface AccessoryDef {
  id: AccessoryId;
  label: string;
  palette: Record<string, string>;
  /** Null for 'none'. 12 rows of 12 chars, '.' is transparent. */
  grid: string[] | null;
}

const SKIN = '#f0c297';
const SKIN_GIRL = '#f6cf9f';
const EYE = '#1c1a18';
const MOUTH = '#3a2c26';

export const AVATARS: AvatarDef[] = [
  {
    id: 'boy',
    label: 'Boy',
    palette: { H: '#232020', S: SKIN, E: EYE, M: MOUTH, B: '#3f6fb5' },
    grid: [
      '....HHHH....',
      '..HHHHHHHH..',
      '.HHHHHHHHHH.',
      '.HHSSSSSSHH.',
      '.HHSSSSSSHH.',
      'SHHSESSSEHHS',
      'SHHSESSSEHHS',
      '.HHSSMMSSHH.',
      '.HHSSSSSSHH.',
      '..HSSSSSSH..',
      '...SSSSSS...',
      '..BBBBBBBB..',
    ],
  },
  {
    id: 'girl',
    label: 'Girl',
    palette: { H: '#26211f', S: SKIN_GIRL, E: EYE, M: MOUTH, B: '#b54f8a' },
    grid: [
      '....HHHH....',
      '..HHHHHHHH..',
      '.HHHHHHHHHH.',
      '.HHSSSSSSHH.',
      '.HHSSSSSSHH.',
      '.HHSESSESHH.',
      '.HHSESSESHH.',
      '.HHSSMMSSHH.',
      '.HHSSSSSSHH.',
      '.HHSSSSSSHH.',
      '.HHSSSSSSHH.',
      '.HHHBBBBHHH.',
    ],
  },
  {
    id: 'robot',
    label: 'Robot',
    palette: { R: '#9fb0bf', D: '#232c38', C: '#38e1ff', Y: '#ffcf3f', B: '#3d5a80' },
    grid: [
      '.....YY.....',
      '.....DD.....',
      '..RRRRRRRR..',
      '.RRRRRRRRRR.',
      '.RDDDDDDDDR.',
      '.RDCCDDCCDR.',
      '.RDDDDDDDDR.',
      '.RDRRRRRRDR.',
      '.RRRRRRRRRR.',
      '..RRRRRRRR..',
      '...RRRRRR...',
      '.BBBBBBBBBB.',
    ],
  },
];

export const SKIN_TONES: { name: string; value: string }[] = [
  { name: 'Fair', value: '#f6dcc3' },
  { name: 'Honey', value: '#e0a878' },
  { name: 'Bronze', value: '#c68a5e' },
  { name: 'Bark', value: '#8d5a33' },
  { name: 'Deep', value: '#5f3a22' },
];

export const HAIR_COLORS: { name: string; value: string }[] = [
  { name: 'Black', value: '#232020' },
  { name: 'Brunette', value: '#5b3a29' },
  { name: 'Ginger', value: '#b56a2e' },
  { name: 'Blond', value: '#e8c33a' },
  { name: 'Silver', value: '#9aa0a8' },
  { name: 'Ocean', value: '#3f6fb5' },
];

export const BACKGROUNDS: { name: string; value: string }[] = [
  { name: 'Dusk', value: '#2a2a35' },
  { name: 'Lagoon', value: '#1d4e5f' },
  { name: 'Berry', value: '#5b2a3a' },
  { name: 'Moss', value: '#2f5233' },
  { name: 'Ember', value: '#6b4a1f' },
  { name: 'Grape', value: '#41417a' },
];

export const ACCESSORIES: AccessoryDef[] = [
  { id: 'none', label: 'None', palette: {}, grid: null },
  {
    id: 'glasses',
    label: 'Glasses',
    palette: { X: '#26313f' },
    grid: [
      '............',
      '............',
      '............',
      '............',
      '..XXXXXXXX..',
      '..X.X..X.X..',
      '..XXX..XXX..',
      '............',
      '............',
      '............',
      '............',
      '............',
    ],
  },
  {
    id: 'shades',
    label: 'Shades',
    palette: { X: '#1f2937', W: '#ffffff' },
    grid: [
      '............',
      '............',
      '............',
      '............',
      '............',
      '..XXXWXXXX..',
      '..XXXXXXXX..',
      '............',
      '............',
      '............',
      '............',
      '............',
    ],
  },
  {
    id: 'cap',
    label: 'Cap',
    palette: { X: '#2b4a7a' },
    grid: [
      '...XXXXXX...',
      '..XXXXXXXX..',
      '.XXXXXXXXXX.',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
    ],
  },
  {
    id: 'beanie',
    label: 'Beanie',
    palette: { X: '#b5462f', W: '#f5f0e8' },
    grid: [
      '.....WW.....',
      '....XXXX....',
      '..XXXXXXXX..',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
    ],
  },
  {
    id: 'crown',
    label: 'Crown',
    palette: { X: '#ffcf3f', J: '#e14b4b' },
    grid: [
      '..X..XX..X..',
      '..XXJXXXXX..',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
      '............',
    ],
  },
];

export const DEFAULT_AVATAR: AvatarConfig = {
  char: 'boy',
  skin: SKIN_TONES[0]!.value,
  hair: HAIR_COLORS[0]!.value,
  bg: BACKGROUNDS[0]!.value,
  accessory: 'none',
};

/** Fixed look for the Student Chatbot Assistant. */
export const BOT_AVATAR: AvatarConfig = {
  ...DEFAULT_AVATAR,
  char: 'robot',
};

const isAvatarId = (value: unknown): value is AvatarId =>
  value === 'boy' || value === 'girl' || value === 'robot';

const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);

const isAccessoryId = (value: unknown): value is AccessoryId =>
  ACCESSORIES.some((item) => item.id === value);

const AVATAR_KEY = 'coursemates_avatar';

export function loadAvatarConfig(): AvatarConfig {
  try {
    const saved = localStorage.getItem(AVATAR_KEY);
    if (isAvatarId(saved)) return { ...DEFAULT_AVATAR, char: saved };
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<AvatarConfig>;
      return {
        char: isAvatarId(parsed.char) ? parsed.char : DEFAULT_AVATAR.char,
        skin: isHexColor(parsed.skin) ? parsed.skin : DEFAULT_AVATAR.skin,
        hair: isHexColor(parsed.hair) ? parsed.hair : DEFAULT_AVATAR.hair,
        bg: isHexColor(parsed.bg) ? parsed.bg : DEFAULT_AVATAR.bg,
        accessory: isAccessoryId(parsed.accessory) ? parsed.accessory : DEFAULT_AVATAR.accessory,
      };
    }
  } catch {
    /* Storage may be unavailable in private browsers. */
  }
  return { ...DEFAULT_AVATAR };
}

export function saveAvatarConfig(config: AvatarConfig) {
  try {
    localStorage.setItem(AVATAR_KEY, JSON.stringify(config));
  } catch {
    /* Storage may be unavailable in private browsers. */
  }
}

/** Deterministic decorative look for a peer handle. No identity implied. */
export function avatarConfigForHandle(handle: string): AvatarConfig {
  let hash = 0;
  for (let i = 0; i < handle.length; i += 1) hash = (hash * 31 + handle.charCodeAt(i)) | 0;
  const at = (offset: number, length: number) => Math.abs((hash >> offset) % length);
  return {
    char: AVATARS[at(0, AVATARS.length)]!.id,
    skin: SKIN_TONES[at(2, SKIN_TONES.length)]!.value,
    hair: HAIR_COLORS[at(4, HAIR_COLORS.length)]!.value,
    bg: BACKGROUNDS[at(6, BACKGROUNDS.length)]!.value,
    accessory: ACCESSORIES[at(8, ACCESSORIES.length)]!.id,
  };
}

export const PixelAvatar: React.FC<{ config: AvatarConfig; size?: number }> = ({
  config,
  size = 32,
}) => {
  const def = AVATARS.find((avatar) => avatar.id === config.char) ?? AVATARS[0]!;
  const accessory = ACCESSORIES.find((item) => item.id === config.accessory);
  const cells: React.ReactNode[] = [];
  def.grid.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      if (cell === '.') return;
      const fill =
        cell === 'S' ? config.skin : cell === 'H' ? config.hair : (def.palette[cell] ?? null);
      if (!fill) return;
      cells.push(<rect key={`b-${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={fill} />);
    });
  });
  accessory?.grid?.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      if (cell === '.') return;
      const fill = accessory.palette[cell];
      if (!fill) return;
      cells.push(<rect key={`a-${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={fill} />);
    });
  });
  return (
    <svg
      viewBox="0 0 12 12"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      <rect x={0} y={0} width={12} height={12} fill={config.bg} />
      {cells}
    </svg>
  );
};
