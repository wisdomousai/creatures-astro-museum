// A film's controls, toy-like as the museum is: a big round play button, a brass knob on
// a track to scrub with, the time, sound and the whole screen. For the museum's player
// (museum/player.ts) and for <Film> on a page (components/mdx/Film.astro). The keys, while
// the film has the focus: space or K plays and pauses, the arrows go back and on 5 s, M
// for the sound, F for the whole screen.
import './film.css';

const SVG = 'http://www.w3.org/2000/svg';
const ICONS = {
  play: 'M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z',
  pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  sound: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15 8.5a5 5 0 0 1 0 7M17.5 6a8.5 8.5 0 0 1 0 12',
  muted: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9.5l5 5M20.5 9.5l-5 5',
  whole: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
};

function icon(name: keyof typeof ICONS): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

function setIcon(button: HTMLButtonElement, name: keyof typeof ICONS) {
  button.replaceChildren(icon(name));
}

function button(className: string, label: string, name: keyof typeof ICONS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.setAttribute('aria-label', label);
  setIcon(b, name);
  return b;
}

/** 75 → '1:15'. */
export function clock(s: number) {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/**
 * Put controls on a film: `figure` holds the video (and gets the bar, after it). The
 * video's own controls go. Returns a function that takes them off again.
 */
export function filmControls(figure: HTMLElement, video: HTMLVideoElement): () => void {
  video.controls = false;
  figure.classList.add('m-film');
  if (!figure.hasAttribute('tabindex')) figure.tabIndex = 0;

  const bar = document.createElement('div');
  bar.className = 'm-film-bar';
  const play = button('m-film-play', 'Play', 'play');
  const scrub = document.createElement('input');
  scrub.type = 'range';
  scrub.className = 'm-film-scrub';
  scrub.min = '0';
  scrub.max = '1000';
  scrub.value = '0';
  scrub.setAttribute('aria-label', 'Seek');
  const time = document.createElement('span');
  time.className = 'm-film-time';
  const sound = button('m-film-small', 'Mute', video.muted ? 'muted' : 'sound');
  const whole = button('m-film-small', 'Whole screen', 'whole');
  bar.append(play, scrub, time, sound, whole);
  video.after(bar);

  const toggle = () => (video.paused || video.ended ? void video.play().catch(() => {}) : video.pause());
  const show = () => {
    const d = video.duration || 0;
    const t = video.currentTime;
    if (!scrubbing) scrub.value = String(d ? Math.round((t / d) * 1000) : 0);
    scrub.style.setProperty('--p', `${d ? (t / d) * 100 : 0}%`);
    scrub.setAttribute('aria-valuetext', `${clock(t)} of ${clock(d)}`);
    time.textContent = `${clock(t)} / ${clock(d)}`;
  };
  const playing = () => {
    const on = !video.paused && !video.ended;
    setIcon(play, on ? 'pause' : 'play');
    play.setAttribute('aria-label', on ? 'Pause' : 'Play');
    figure.classList.toggle('m-film-on', on);
  };
  const loud = () => {
    setIcon(sound, video.muted ? 'muted' : 'sound');
    sound.setAttribute('aria-label', video.muted ? 'Sound on' : 'Mute');
  };
  let scrubbing = false;

  const on: [EventTarget, string, EventListener][] = [
    [play, 'click', toggle],
    [video, 'click', toggle],
    [video, 'play', playing],
    [video, 'pause', playing],
    [video, 'ended', playing],
    [video, 'timeupdate', show],
    [video, 'loadedmetadata', show],
    [video, 'durationchange', show],
    [video, 'volumechange', loud],
    [scrub, 'pointerdown', () => (scrubbing = true)],
    [scrub, 'pointerup', () => (scrubbing = false)],
    [
      scrub,
      'input',
      () => {
        if (video.duration) video.currentTime = (Number(scrub.value) / 1000) * video.duration;
        show();
      },
    ],
    [sound, 'click', () => (video.muted = !video.muted)],
    [
      whole,
      'click',
      () => (document.fullscreenElement ? document.exitFullscreen() : figure.requestFullscreen?.()),
    ],
    [
      figure,
      'keydown',
      ((e: KeyboardEvent) => {
        // (The scrubber has its own arrow keys; buttons their own space.)
        const t = e.target as HTMLElement;
        if (t === scrub && e.key.startsWith('Arrow')) return;
        if (t.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
        const k = e.key.toLowerCase();
        if (k === ' ' || k === 'k') toggle();
        else if (k === 'arrowleft') video.currentTime = Math.max(0, video.currentTime - 5);
        else if (k === 'arrowright') video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
        else if (k === 'm') video.muted = !video.muted;
        else if (k === 'f') whole.click();
        else return;
        e.preventDefault();
        e.stopPropagation();
      }) as EventListener,
    ],
  ];
  for (const [t, type, f] of on) t.addEventListener(type, f);
  show();
  playing();
  loud();

  return () => {
    for (const [t, type, f] of on) t.removeEventListener(type, f);
    bar.remove();
    figure.classList.remove('m-film', 'm-film-on');
  };
}
