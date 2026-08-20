import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { importPromptCsv } from '../src/lib/prompt-import';

const prisma = new PrismaClient();

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: npm run import:prompts -- <path-to-prompts.csv>');

  const filePath = path.resolve(process.cwd(), input);
  if (!fs.existsSync(filePath)) throw new Error(`CSV file not found: ${filePath}`);

  const text = fs.readFileSync(filePath, 'utf8');
  const summary = await importPromptCsv(prisma, text);
  console.log(`Imported: ${summary.imported}`);
  console.log(`Updated: ${summary.updated}`);
  console.log(`Rejected: ${summary.rejected}`);
  console.log(`Total processed: ${summary.total}`);
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Prompt import failed');
    process.exit(1);
  });
