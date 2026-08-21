import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { generatePromptBank, promptBankStats, promptBankToCsv } from '../src/lib/prompt-bank-generator';

async function main() {
  const output = resolve(process.argv[2] || './data/Karzoun_Media_Lab_1000_Shorts_Prompts.csv');
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
