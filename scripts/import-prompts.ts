import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse';
import { ChannelType, PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const rowSchema = z.object({
  id: z.string().trim().min(1),
  channel: z.enum(['GENERAL', 'KIDS_CHANNEL_ONLY']),
  category: z.string().trim().min(1),
  duration_seconds: z.coerce.number().int().min(30).max(59),
  concept: z.string().trim().min(1),
  prompt: z.string().trim().min(20)
});

type CsvRow = z.infer<typeof rowSchema>;

async function readCsv(filePath: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const rows: unknown[] = [];
    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, bom: true, skip_empty_lines: true, trim: true, relax_quotes: false }))
      .on('data', (row) => rows.push(row))
      .on('error', reject)
      .on('end', () => resolve(rows));
  });
}

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: npm run import:prompts -- <path-to-prompts.csv>');

  const filePath = path.resolve(process.cwd(), input);
  if (!fs.existsSync(filePath)) throw new Error(`CSV file not found: ${filePath}`);

  const rawRows = await readCsv(filePath);
  const valid: CsvRow[] = [];
  const rejected: Array<{ row: number; reason: string }> = [];
  const seen = new Set<string>();

  rawRows.forEach((raw, index) => {
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) {
      rejected.push({ row: index + 2, reason: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
      return;
    }
    if (seen.has(parsed.data.id)) {
      rejected.push({ row: index + 2, reason: `duplicate id inside CSV: ${parsed.data.id}` });
      return;
    }
    seen.add(parsed.data.id);
    valid.push(parsed.data);
  });

  if (rejected.length) {
    console.error(`Validation failed. ${rejected.length} row(s) rejected:`);
    for (const item of rejected.slice(0, 25)) console.error(`- row ${item.row}: ${item.reason}`);
    if (rejected.length > 25) console.error(`...and ${rejected.length - 25} more`);
    process.exitCode = 1;
    return;
  }

  let imported = 0;
  let updated = 0;

  for (const row of valid) {
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

  console.log(`Imported: ${imported}`);
  console.log(`Updated: ${updated}`);
  console.log('Rejected: 0');
  console.log(`Total processed: ${valid.length}`);
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Prompt import failed');
    process.exit(1);
  });
