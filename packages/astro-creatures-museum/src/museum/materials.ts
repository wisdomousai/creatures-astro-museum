// The building's materials, made by name (the kit's parts carry only names: blender/kit.py)
// in the crew's look. In colour the halls are painted, a colour a wing; on paper all is
// paper and ink; in ink the lights are down.
import {
  CanvasTexture,
  Color,
  type Material,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';

export type Look = 'ink' | 'paper' | 'colour';
export type Role =
  | 'Wall'
  | 'Trim'
  | 'Frame'
  | 'Plinth'
  | 'Wood'
  | 'Velvet'
  | 'Brass'
  | 'Glow'
  | 'Floor'
  | 'Dark';

export interface Palette {
  roles: Record<Role, string>;
  /** The walls' paint: the lobby's, then a wing's each, in turn. */
  rooms: string[];
  /** The floor's two tones, and the ceiling. */
  floor: [string, string];
  ceiling: string;
  /** The page colour behind it all, and the words on signs and labels. */
  paper: string;
  ink: string;
  /** How bright the lights are. */
  light: number;
}

export const PALETTES: Record<Look, Palette> = {
  colour: {
    roles: {
      Wall: '#ffffff',
      Trim: '#27434d',
      Frame: '#c9973b',
      Plinth: '#f5f0e6',
      Wood: '#a9683c',
      Velvet: '#b8403a',
      Brass: '#d6aa4c',
      Glow: '#fff1cc',
      Floor: '#d8c7a6',
      Dark: '#2a2622',
    },
    rooms: ['#f1e7d0', '#cfe4dc', '#f2d4c3', '#dcd8f0', '#f3e3a8'],
    floor: ['#e7dcc4', '#c9b48e'],
    ceiling: '#fbf8f1',
    paper: '#f4f4f1',
    ink: '#1d2b30',
    light: 1,
  },
  paper: {
    roles: {
      Wall: '#ffffff',
      Trim: '#1a1a19',
      Frame: '#1a1a19',
      Plinth: '#f7f7f4',
      Wood: '#e4e4df',
      Velvet: '#55554f',
      Brass: '#8d8d86',
      Glow: '#ffffff',
      Floor: '#ecece8',
      Dark: '#55554f',
    },
    rooms: ['#f4f4f1', '#efefeb', '#f4f4f1', '#efefeb', '#f4f4f1'],
    floor: ['#ecece8', '#dcdcd6'],
    ceiling: '#fafaf8',
    paper: '#f4f4f1',
    ink: '#111111',
    light: 1,
  },
  ink: {
    roles: {
      Wall: '#ffffff',
      Trim: '#0f0f0e',
      Frame: '#d9d9d2',
      Plinth: '#2f2f2c',
      Wood: '#3a3631',
      Velvet: '#6b2f2c',
      Brass: '#b89548',
      Glow: '#ffe7b0',
      Floor: '#22221f',
      Dark: '#0d0d0c',
    },
    rooms: ['#3a3935', '#30383a', '#3b3330', '#34323d', '#3b392c'],
    floor: ['#2a2926', '#1d1c1a'],
    ceiling: '#2a2a27',
    paper: '#1f1f1d',
    ink: '#ecece8',
    light: 0.62,
  },
};

export class Materials {
  readonly look: Look;
  readonly palette: Palette;
  private made = new Map<string, Material>();

  constructor(look: Look) {
    this.look = look;
    this.palette = PALETTES[look];
  }

  /** The material for a part's role (a kit material's name, `Wall.001` and all). */
  role(name: string): Material {
    const role = (name.replace(/\.\d+$/, '') as Role) in this.palette.roles
      ? (name.replace(/\.\d+$/, '') as Role)
      : 'Wall';
    let m = this.made.get(role);
    if (m) return m;
    const colour = this.palette.roles[role];
    if (role === 'Glow') m = new MeshBasicMaterial({ color: colour });
    else
      m = new MeshStandardMaterial({
        color: colour,
        roughness: role === 'Brass' ? 0.32 : role === 'Velvet' ? 0.9 : role === 'Frame' ? 0.4 : 0.62,
        metalness: role === 'Brass' ? 0.85 : role === 'Frame' && this.look === 'colour' ? 0.55 : 0,
      });
    m.name = role;
    this.made.set(role, m);
    return m;
  }

  /** A room's wall paint: the lobby's (0), or a wing's (1, 2...). */
  room(i: number): Color {
    const rooms = this.palette.rooms;
    return new Color(rooms[i % rooms.length]);
  }

  /** A floor for a room: big toy tiles in the lobby, boards in the halls. */
  floor(kind: 'tiles' | 'boards'): Texture {
    const key = `floor-${kind}`;
    const hit = this.textures.get(key);
    if (hit) return hit;
    const [a, b] = this.palette.floor;
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d')!;
    if (kind === 'tiles') {
      // Two metres of floor: four tiles, a checker with rounded grout.
      g.fillStyle = shade(b, -0.12);
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) {
          g.fillStyle = (i + j) % 2 ? a : b;
          roundRect(g, i * 128 + 4, j * 128 + 4, 120, 120, 14);
        }
    } else {
      // Two metres of boards, staggered.
      g.fillStyle = shade(b, -0.18);
      g.fillRect(0, 0, 512, 512);
      const rows = 8;
      for (let j = 0; j < rows; j++) {
        const off = (j % 2) * 128 + (j % 3) * 40;
        for (let i = -1; i < 3; i++) {
          const x = i * 256 + off;
          const t = ((i * 7 + j * 13) % 5) / 5;
          g.fillStyle = mix(a, b, 0.35 + t * 0.4);
          roundRect(g, x + 3, j * 64 + 3, 250, 58, 6);
        }
      }
    }
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.anisotropy = 8;
    this.textures.set(key, tex);
    return tex;
  }
  private textures = new Map<string, Texture>();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
}

/** A colour lightened (+) or darkened (-) by k. */
export function shade(hex: string, k: number): string {
  const c = new Color(hex);
  return '#' + (k < 0 ? c.multiplyScalar(1 + k) : c.lerp(new Color(1, 1, 1), k)).getHexString();
}

export function mix(a: string, b: string, t: number): string {
  return '#' + new Color(a).lerp(new Color(b), t).getHexString();
}
