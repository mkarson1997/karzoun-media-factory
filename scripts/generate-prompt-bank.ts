import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { generatePromptBank, promptBankStats, promptBankToCsv } from '../src/lib/prompt-bank-generator';
import { promptCsvFilename, promptCsvPath } from '../src/lib/prompt-csv-file';

const DEFAULT_PROMPT_CSV = 'Karzoun_Media_Lab_1000_Shorts_Prompts.csv';

async function main() {
  const fileName = promptCsvFilename(process.argv[2], DEFAULT_PROMPT_CSV);
  const output = promptCsvPath(fileName);
  const rows = generatePromptBank();
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, promptBankToCsv(rows), 'utf8');

  const stats = promptBankStats(rows);
  console.log(`Generated ${stats.total} prompts -> ${output}`);
  console.log(`GENERAL=${stats.byChannel.GENERAL ?? 0}`);
  console.log(`KIDS_CHANNEL_ONLY=${stats.byChannel.KIDS_CHANNEL_ONLY ?? 0}`);
  console.log(`Categories=${Object.keys(stats.byCategory).length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Prompt-bank generation failed');
  process.exit(1);
});
