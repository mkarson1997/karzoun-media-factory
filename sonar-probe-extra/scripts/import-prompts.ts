import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { importPromptCsv } from '../src/lib/prompt-import';
import { promptCsvFilename, promptCsvPath } from '../src/lib/prompt-csv-file';

const prisma = new PrismaClient();

async function main() {
  const fileName = promptCsvFilename(process.argv[2], 'Karzoun_Media_Lab_1000_Shorts_Prompts.csv');
  const filePath = promptCsvPath(fileName);
  if (!fs.existsSync(filePath)) throw new Error(`CSV file not found in data/: ${fileName}`);

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
