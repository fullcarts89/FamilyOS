import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ARTIFACTS_DIR } from './env';

const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
/** A little of what led up to the interaction, so the GIF has context. */
const LEAD_IN_MS = 700;

/**
 * Cuts [fromMs, toMs] (offsets from the start of the page's video) out of a Playwright video and
 * writes e2e/artifacts/<name>-<project>.gif with a generated palette (small and crisp).
 */
export async function toGif(
  video: string,
  name: string,
  project: string,
  fromMs: number,
  toMs: number,
): Promise<string> {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const out = resolve(ARTIFACTS_DIR, `${name}-${project}.gif`);
  const start = Math.max(0, fromMs - LEAD_IN_MS) / 1000;
  const duration = (toMs - Math.max(0, fromMs - LEAD_IN_MS)) / 1000;
  const width = project === 'phone' ? 390 : 960;
  const filter =
    `fps=12,scale=${width}:-1:flags=lanczos,split[a][b];` +
    `[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`;
  await new Promise<void>((done, fail) => {
    const ff = spawn(
      FFMPEG,
      [
        '-y',
        '-loglevel',
        'error',
        '-ss',
        start.toFixed(2),
        '-t',
        duration.toFixed(2),
        '-i',
        video,
        '-vf',
        filter,
        '-loop',
        '0',
        out,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let err = '';
    ff.stderr.on('data', (d: Buffer) => (err += d.toString()));
    ff.on('error', fail);
    ff.on('exit', (code) => (code === 0 ? done() : fail(new Error(`ffmpeg failed: ${err}`))));
  });
  return out;
}
