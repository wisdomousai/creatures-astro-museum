// The loops in the frames: each plays, muted, while the visitor stands in front of it and
// looks its way, and goes back to its still when they move on. A few at most at once, the
// nearest; none for visitors who'd rather nothing moved. The video is fetched only the
// first time it's wanted.
import { type Object3D, SRGBColorSpace, type Texture, Vector3, VideoTexture } from 'three';

interface Screen {
  src: string;
  material: { map: Texture | null; needsUpdate: boolean };
  object: Object3D;
  still: Texture | null;
  video?: HTMLVideoElement;
  texture?: VideoTexture;
  playing: boolean;
}

const NEAR = 7;
const MAX = 3;

export class Videos {
  private screens: Screen[] = [];
  private calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private t = 0;
  private at = new Vector3();
  private normal = new Vector3();
  private to = new Vector3();

  add(src: string, material: Screen['material'], object: Object3D) {
    this.screens.push({ src, material, object, still: material.map, playing: false });
  }

  /** The screens' videos for an object (an exhibit), for the player: the first. */
  srcFor(object: Object3D): string | null {
    for (const s of this.screens) {
      let o: Object3D | null = s.object;
      while (o && o !== object) o = o.parent;
      if (o) return s.src;
    }
    return null;
  }

  update(dt: number, eye: Vector3, forward: Vector3) {
    if (this.calm) return;
    this.t += dt;
    if (this.t < 0.2) return;
    this.t = 0;
    const want = this.screens
      .map((s) => {
        s.object.getWorldPosition(this.at);
        this.normal.set(0, 0, 1).transformDirection(s.object.matrixWorld);
        this.to.copy(this.at).sub(eye);
        const d = this.to.length();
        this.to.divideScalar(d || 1);
        // In front of it, near enough, and looking its way.
        const ok = d < NEAR && this.normal.dot(this.to) < -0.2 && forward.dot(this.to) > 0.55;
        return { s, d, ok };
      })
      .filter((x) => x.ok)
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX)
      .map((x) => x.s);
    for (const s of this.screens) {
      if (want.includes(s)) this.play(s);
      else if (s.playing) this.stop(s);
    }
  }

  private play(s: Screen) {
    if (s.playing) return;
    s.playing = true;
    if (!s.video) {
      const v = document.createElement('video');
      v.src = s.src;
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.crossOrigin = 'anonymous';
      v.preload = 'auto';
      s.video = v;
      s.texture = new VideoTexture(v);
      s.texture.colorSpace = SRGBColorSpace;
      // The still stays until there's a picture to show.
      v.addEventListener('playing', () => {
        if (!s.playing) return;
        s.material.map = s.texture!;
        s.material.needsUpdate = true;
      });
    } else if (s.video.readyState >= 2) {
      s.material.map = s.texture!;
      s.material.needsUpdate = true;
    }
    s.video.play().catch(() => {
      // (Not allowed to play: the still it is.)
      s.playing = false;
    });
  }

  private stop(s: Screen) {
    s.playing = false;
    s.video?.pause();
    s.material.map = s.still;
    s.material.needsUpdate = true;
  }

  dispose() {
    for (const s of this.screens) {
      s.video?.pause();
      s.video?.removeAttribute('src');
      s.texture?.dispose();
    }
  }
}
