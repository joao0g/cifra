/* Drives the SHIPPED src/lib/sounds.ts (bundled with esbuild) with a
   gesture-enforcing Audio stub: play() rejects outside a gesture unless
   that element already played inside one (the iOS blessed-element rule).
   Asserts one real play per trigger, silence when disabled, same-element
   warm->real serialisation, and cleanup after end/error.
   Usage: node scripts/verify-sounds-stub.mjs [scratchDir] */
import { buildSync } from 'esbuild';
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const scratch = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'sounds-stub-'));
fs.mkdirSync(scratch, { recursive: true });
const bundlePath = path.join(scratch, 'sounds.bundle.cjs');

buildSync({
  entryPoints: ['src/lib/sounds.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: bundlePath,
  define: { 'import.meta.env.BASE_URL': '"/"' },
  logLevel: 'silent',
});

const requireFresh = () => {
  delete createRequire(import.meta.url).cache?.[bundlePath];
  // Bust node resolution cache manually: fresh copy per load.
  const tmp = path.join(scratch, `sounds.${Date.now()}.${Math.random().toString(36).slice(2)}.cjs`);
  fs.copyFileSync(bundlePath, tmp);
  return createRequire(import.meta.url)(tmp);
};

// ---- Stubs (installed before each module load) ----
let instances = [];
let plays = [];
globalThis.__gesture = false;

class StubAudio {
  constructor() {
    this.muted = false;
    this.volume = 1;
    this.currentTime = 0;
    this.preload = '';
    this._src = '';
    this.dead = false;
    this.blessed = false;
    this.onended = null;
    this.onerror = null;
    this.onpause = null;
    instances.push(this);
  }
  set src(v) { this._src = v; }
  get src() { return this._src; }
  getAttribute(n) { return n === 'src' ? this._src || null : null; }
  setAttribute() {}
  removeAttribute(n) { if (n === 'src') { this._src = ''; this.dead = true; } }
  load() {}
  pause() {}
  play() {
    plays.push({ el: this, muted: this.muted, src: this._src });
    if (!this.blessed && !globalThis.__gesture) {
      return Promise.reject(new Error('NotAllowedError'));
    }
    this.blessed = true;
    return Promise.resolve();
  }
}
globalThis.Audio = StubAudio;
globalThis.MediaMetadata = class { constructor(o) { this.o = o; } };
globalThis.navigator = { mediaSession: { metadata: null, playbackState: 'none' } };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.fetch = () => Promise.resolve({ ok: true });

const tick = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
const live = () => instances.filter((t) => !t.dead);
let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra && !cond ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
};
const playsFor = (el) => plays.filter((p) => p.el === el);

const gesture = (open, fn) => { globalThis.__gesture = open; fn(); };

// A. deposit: unlock in gesture, real play outside gesture reuses element
{
  instances = []; plays = [];
  const m = requireFresh();
  gesture(true, () => m.unlockAudio());
  await tick();
  check('A1 warm plays once per kind (muted)', plays.length === 2 && plays.every((p) => p.muted === true), `plays=${plays.length}`);
  gesture(false, () => m.playSound('deposito', true));
  await tick();
  const real = plays.filter((p) => !p.muted);
  check('A2 one unmuted deposit play outside gesture', real.length === 1 && real[0].src.includes('deposito.wav'), JSON.stringify(plays.map((p) => ({ m: p.muted, s: p.src }))));
  const tag = real[0]?.el;
  check('A3 real play reused the blessed element', tag && playsFor(tag).length === 2 && playsFor(tag)[0].muted === true, `playsOnTag=${tag ? playsFor(tag).length : 0}`);
  tag._end = () => tag.onended && tag.onended();
  tag._end();
  await tick();
  check('A4 element dead after ended', tag.dead === true);
  check('A5 media session cleared', globalThis.navigator.mediaSession.metadata === null);
  const before = instances.length;
  gesture(true, () => m.unlockAudio());
  await tick();
  check('A6 slot dropped: unlock recreates element', instances.length > before, `before=${before} after=${instances.length}`);
}

// B. disabled toggle: silence
{
  instances = []; plays = [];
  const m = requireFresh();
  gesture(true, () => { m.playSound('deposito', false); m.playSound('enviar', false); });
  await tick();
  check('B1 no play when disabled', plays.length === 0, `plays=${plays.length}`);
}

// C. send race: playSound while warm in flight serialises on same element
{
  instances = []; plays = [];
  const m = requireFresh();
  gesture(true, () => { m.unlockAudio(); m.playSound('enviar', true); });
  await tick(12);
  const envTags = instances.filter((t) => playsFor(t).some((p) => (p.src || '').includes('enviar')));
  check('C1 single element for enviar', envTags.length === 1, `tags=${envTags.length}`);
  const seq = envTags.length === 1 ? playsFor(envTags[0]) : [];
  check('C2 warm muted first, real unmuted second', seq.length === 2 && seq[0].muted === true && seq[1].muted === false && seq[1].src.includes('enviar.mp3'), JSON.stringify(seq.map((p) => ({ m: p.muted, s: p.src }))));
  gesture(false, () => {});
  envTags[0].onended && envTags[0].onended();
  await tick();
  check('C3 element dead after ended', envTags[0].dead === true);
  check('C4 no live elements left for enviar', live().filter((t) => t === envTags[0]).length === 0);
}

// D. out-of-gesture with no unlock: denied play cleans up
{
  instances = []; plays = [];
  const m = requireFresh();
  gesture(false, () => m.playSound('enviar', true));
  await tick();
  check('D1 denied play leaves no live element', live().length === 0, `live=${live().length}`);
}

// E. error event mid-play cleans up
{
  instances = []; plays = [];
  const m = requireFresh();
  gesture(true, () => m.unlockAudio());
  await tick();
  gesture(true, () => m.playSound('enviar', true));
  await tick();
  const real = plays.filter((p) => !p.muted);
  check('E1 real play happened', real.length === 1, `real=${real.length}`);
  const tag = real[0].el;
  tag.onerror && tag.onerror();
  await tick();
  check('E2 element dead after error', tag.dead === true);
  check('E3 no live elements remain', live().length === 0, `live=${live().length}`);
}

console.log(failures === 0 ? 'ALL STUB CHECKS PASSED' : `${failures} STUB CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
