import { spawn } from 'node:child_process';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { creativePlanSchema, type CreativePlan } from './creative-director';
import { ensureLocalMediaRoot, localMediaFilename, localMediaUrl, resolveLocalMediaPath } from './local-media';
import type { VideoGenerationProvider, VideoGenerationRequest, VideoGenerationResult } from './providers';

const WIDTH = 720;
const HEIGHT = 1280;
const FONT = '/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf';

function safeId(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80) || 'job';
}

function wrapCaption(value: string, lineLength = 30) {
  const words = value.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const current = lines.at(-1);
    if (!current || current.length + word.length + 1 > lineLength) lines.push(word);
    else lines[lines.length - 1] = `${current} ${word}`;
  }
  return lines.slice(0, 3).join('\n');
}

function filterPath(value: string) {
  return value.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''");
}

function boundedSecond(value: number, durationSeconds: number) {
  if (!Number.isFinite(value)) throw new Error('Local renderer received a non-finite timeline value');
  return Math.max(0, Math.min(durationSeconds, value));
}

export function localDemoFilter(plan: CreativePlan, textFiles: string[], durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 3 || durationSeconds > 180) {
    throw new Error('Local renderer duration must be between 3 and 180 seconds');
  }
  if (textFiles.length !== plan.shots.length + 1) throw new Error('Local renderer caption files do not match the validated plan');

  const filters = [
    `drawbox=x='mod(t*55\\,${WIDTH + 280})-280':y=80:w=280:h=280:color=0x6366f1@0.22:t=fill`,
    `drawbox=x='${WIDTH}-mod(t*38\\,${WIDTH + 360})':y=780:w=360:h=360:color=0x06b6d4@0.18:t=fill`,
    `drawbox=x=42:y=70:w=${WIDTH - 84}:h=${HEIGHT - 210}:color=white@0.035:t=3`,
    `drawtext=fontfile='${FONT}':textfile='${filterPath(textFiles[0])}':fontcolor=white:fontsize=48:line_spacing=12:x=(w-text_w)/2:y=170:box=1:boxcolor=0x050816@0.72:boxborderw=24:enable='between(t\\,0\\,${Math.min(5, durationSeconds)})'`
  ];
  const palette = ['0x312e81', '0x164e63', '0x3f1d58', '0x713f12', '0x134e4a', '0x4c1d95'];
  plan.shots.forEach((shot, index) => {
    const start = boundedSecond(shot.startSecond, durationSeconds);
    const end = boundedSecond(shot.endSecond, durationSeconds);
    if (end <= start) throw new Error('Local renderer received an invalid shot range');
    filters.push(`drawbox=x=0:y=0:w=iw:h=ih:color=${palette[index % palette.length]}@0.20:t=fill:enable='between(t\\,${start}\\,${end})'`);
    filters.push(`drawtext=fontfile='${FONT}':textfile='${filterPath(textFiles[index + 1])}':fontcolor=white:fontsize=38:line_spacing=10:x=(w-text_w)/2:y=900:box=1:boxcolor=black@0.68:boxborderw=22:enable='between(t\\,${start}\\,${end})'`);
    filters.push(`drawtext=fontfile='${FONT}':text='${String(index + 1).padStart(2, '0')}':fontcolor=white@0.52:fontsize=24:x=64:y=1080:enable='between(t\\,${start}\\,${end})'`);
  });
  filters.push('fade=t=in:st=0:d=0.5', `fade=t=out:st=${Math.max(0, durationSeconds - 0.6)}:d=0.6`, 'format=yuv420p');
  return filters.join(',');
}

async function runFfmpeg(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'], shell: false });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-5000); });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg exited ${code}: ${stderr.replace(/\s+/g, ' ').slice(-700)}`)));
  });
}

function parsePlan(input: VideoGenerationRequest) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.prompt);
  } catch {
    throw new Error('Local renderer requires a valid JSON creative plan');
  }
  return creativePlanSchema.parse(parsed);
}

export class LocalDemoVideoProvider implements VideoGenerationProvider {
  async generateVideo(input: VideoGenerationRequest): Promise<VideoGenerationResult> {
    const plan = parsePlan(input);
    const root = await ensureLocalMediaRoot();
    const stamp = Date.now();
    const filename = `kmf-${safeId(input.externalJobId || input.jobId)}-${stamp}.mp4`;
    const outputPath = resolveLocalMediaPath(filename);
    const workDir = path.join(root, `.work-${safeId(input.jobId)}-${stamp}`);
    await mkdir(workDir, { recursive: true });
    try {
      const captions = [wrapCaption(plan.hook, 26), ...plan.shots.map((shot) => wrapCaption(shot.narration || shot.visualPrompt, 32))];
      const textFiles = await Promise.all(captions.map(async (caption, index) => {
        const filename = path.join(workDir, `caption-${index}.txt`);
        await writeFile(filename, caption, 'utf8');
        return filename;
      }));
      const requestedDuration = Number(input.durationSeconds);
      if (!Number.isFinite(requestedDuration)) throw new Error('Local renderer requires a finite duration');
      const duration = Math.max(3, Math.min(180, requestedDuration));
      await runFfmpeg([
        '-hide_banner', '-loglevel', 'warning', '-y',
        '-f', 'lavfi', '-i', `color=c=0x07101f:s=${WIDTH}x${HEIGHT}:r=30:d=${duration}`,
        '-vf', localDemoFilter(plan, textFiles, duration),
        '-t', String(duration), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outputPath
      ]);
      const fileStat = await stat(outputPath);
      if (!fileStat.isFile() || fileStat.size < 1024) throw new Error('FFmpeg did not produce a usable MP4');
      return {
        providerJobId: `local-demo:${filename}`,
        status: 'READY_FOR_REVIEW',
        providerStatus: 'completed',
        videoUrl: localMediaUrl(filename),
        actualDuration: duration,
        providerMetadata: { renderer: 'ffmpeg', width: WIDTH, height: HEIGHT, bytes: fileStat.size, filename, costUsd: 0 }
      };
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  async getJobStatus(providerJobId: string): Promise<VideoGenerationResult> {
    try {
      const filename = localMediaFilename(providerJobId);
      const fileStat = await stat(resolveLocalMediaPath(filename));
      if (!fileStat.isFile() || fileStat.size < 1024) throw new Error('asset is empty');
      return { providerJobId, status: 'READY_FOR_REVIEW', providerStatus: 'completed', videoUrl: localMediaUrl(filename), providerMetadata: { renderer: 'ffmpeg', bytes: fileStat.size, filename, costUsd: 0 } };
    } catch (error) {
      return { providerJobId, status: 'FAILED', providerStatus: 'missing', failureReason: error instanceof Error ? error.message : 'Local media asset missing' };
    }
  }

  async cancelJob(): Promise<void> {}
}
