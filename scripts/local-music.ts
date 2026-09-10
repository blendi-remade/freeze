import type { Plugin } from 'vite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  falMediaUrl,
  MAX_MUSIC_VIDEO_BYTES,
  musicMixArgs,
} from '../lib/music-plan';

const exec = promisify(execFile);
export function localMusic(): Plugin {
  return {
    name: 'freeze-local-music',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.split('?')[0] !== '/api/local-music') return next();
        res.setHeader('Cache-Control', 'no-store');
        let dir: string | undefined;
        try {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end();
            return;
          }
          if (
            req.headers.origin &&
            new URL(req.headers.origin).host !== req.headers.host
          )
            throw new Error('Cross-origin requests are not allowed.');
          const buffers: Buffer[] = [];
          let size = 0;
          for await (const chunk of req) {
            const bytes = Buffer.from(chunk);
            size += bytes.length;
            if (size > MAX_MUSIC_VIDEO_BYTES + 1024 * 1024)
              throw new Error('Finished video exceeds the music upload limit.');
            buffers.push(bytes);
          }
          const request = new Request('http://localhost/api/local-music', {
            method: 'POST',
            headers: { 'Content-Type': req.headers['content-type'] || '' },
            body: Buffer.concat(buffers),
          });
          const form = await request.formData();
          const video = form.get('video');
          if (
            !(video instanceof File) ||
            !video.size ||
            video.size > MAX_MUSIC_VIDEO_BYTES
          )
            throw new Error('A finished video is required.');
          const audioUrl = falMediaUrl(form.get('audioUrl'));
          dir = await mkdtemp(join(tmpdir(), 'freeze-music-'));
          const source = join(dir, 'video.mp4'),
            music = join(dir, 'music.m4a'),
            output = join(dir, 'with-music.mp4');
          await writeFile(source, new Uint8Array(await video.arrayBuffer()));
          const response = await fetch(audioUrl, {
            redirect: 'error',
            signal: AbortSignal.timeout(60000),
          });
          if (!response.ok)
            throw new Error('Could not download the generated music.');
          await writeFile(music, new Uint8Array(await response.arrayBuffer()));
          const { stdout } = await exec('ffprobe', [
            '-v',
            'error',
            '-show_streams',
            '-show_format',
            '-of',
            'json',
            source,
          ]);
          const probe = JSON.parse(stdout);
          const duration = Number(probe.format?.duration);
          const audio = probe.streams?.some(
            (stream: { codec_type: string }) => stream.codec_type === 'audio',
          );
          await exec(
            'ffmpeg',
            [
              '-hide_banner',
              '-loglevel',
              'error',
              ...musicMixArgs(duration, Boolean(audio), source, music, output),
            ],
            { timeout: 300000, maxBuffer: 2 * 1024 * 1024 },
          );
          res.setHeader('Content-Type', 'video/mp4');
          res.end(await readFile(output));
        } catch (error) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error:
                error instanceof Error ? error.message : 'Could not add music.',
            }),
          );
        } finally {
          if (dir) await rm(dir, { recursive: true, force: true });
        }
      });
    },
  };
}
