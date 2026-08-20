import { ChannelType, type PrismaClient } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';

const rowSchema = z.object({
  id: z.string().trim().min(1),
  channel: z.enum(['GENERAL', 'KIDS_CHANNEL_ONLY']),
  category: z.string().trim().min(1),
  duration_seconds: z.coerce.number().int().min(30).max(59),
  concept: z.string().trim().min(1),
  prompt: z.string().trim().min(20)
});

type PromptCsvRow = z.infer<typeof rowSchema>;

export interface PromptImportSummary {
  imported: number;
  updated: number;
  rejected: number;
  total: number;
}

export function validatePromptCsv(csvText: string): PromptCsvRow[] {
  const rawRows = parse(csvText, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: false
  }) as unknown[];

  if (rawRows.length > 5000) throw new Error('CSV exceeds the 5,000-row safety limit');

  const valid: PromptCsvRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  rawRows.forEach((raw, index) => {
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(`row ${index + 2}: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
      return;
    }
    if (seen.has(parsed.data.id)) {
      errors.push(`row ${index + 2}: duplicate id inside CSV: ${parsed.data.id}`);
      return;
    }
    seen.add(parsed.data.id);
    valid.push(parsed.data);
  });

  if (errors.length) {
    const preview = errors.slice(0, 10).join(' | ');
    throw new Error(`CSV validation failed: ${preview}${errors.length > 10 ? ` | +${errors.length - 10} more` : ''}`);
  }
  return valid;
}

export async function importPromptCsv(prisma: PrismaClient, csvText: string): Promise<PromptImportSummary> {
  const rows = validatePromptCsv(csvText);
  let imported = 0;
  let updated = 0;

  for (const row of rows) {
    const existing = await prisma.prompt.findUnique({ where: { externalPromptId: row.id }, select: { id: true } });
    await prisma.prompt.upsert({
      where: { externalPromptId: row.id },
      create: {
        externalPromptId: row.id,
        category: row.category,
        concept: row.concept,
        fullPrompt: row.prompt,
        targetDurationSeconds: row.duration_seconds,
        channelType: ChannelType[row.channel],
        active: true
      },
      update: {
        category: row.category,
        concept: row.concept,
        fullPrompt: row.prompt,
        targetDurationSeconds: row.duration_seconds,
        channelType: ChannelType[row.channel]
      }
    });
    existing ? updated++ : imported++;
  }

  return { imported, updated, rejected: 0, total: rows.length };
}
