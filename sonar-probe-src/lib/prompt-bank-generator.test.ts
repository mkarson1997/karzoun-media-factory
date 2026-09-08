import { describe, expect, it } from 'vitest';
import { generatePromptBank, promptBankToCsv } from './prompt-bank-generator';

describe('prompt bank generator', () => {
  const rows = generatePromptBank();

  it('generates exactly 1000 unique prompts', () => {
    expect(rows).toHaveLength(1000);
    expect(new Set(rows.map((row) => row.id)).size).toBe(1000);
    expect(new Set(rows.map((row) => row.concept)).size).toBe(1000);
  });

  it('keeps the intended general/kids split', () => {
    expect(rows.filter((row) => row.channel === 'GENERAL')).toHaveLength(650);
    expect(rows.filter((row) => row.channel === 'KIDS_CHANNEL_ONLY')).toHaveLength(350);
  });

  it('keeps every Short inside the requested duration window', () => {
    expect(rows.every((row) => row.duration_seconds >= 30 && row.duration_seconds <= 59)).toBe(true);
  });

  it('includes original-content and safety guidance in every generation prompt', () => {
    for (const row of rows) {
      expect(row.prompt).toContain('vertical 9:16 YouTube Short');
      expect(row.prompt).toContain('copyrighted characters');
      expect(row.prompt).toContain('watermarks');
    }
  });

  it('exports an importer-compatible CSV header and 1000 data rows', () => {
    const csv = promptBankToCsv(rows);
    expect(csv.startsWith('id,channel,category,duration_seconds,concept,prompt\n')).toBe(true);
    expect(csv.trimEnd().split('\n')).toHaveLength(1001);
  });
});
