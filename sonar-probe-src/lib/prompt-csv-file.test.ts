import { describe, expect, it } from 'vitest';
import { promptCsvFilename, promptCsvPath } from './prompt-csv-file';

describe('prompt CSV filename policy', () => {
  it('accepts simple CSV filenames and keeps them under data/', () => {
    expect(promptCsvFilename('prompts.csv', 'fallback.csv')).toBe('prompts.csv');
    expect(promptCsvFilename(undefined, 'fallback.csv')).toBe('fallback.csv');
    expect(promptCsvPath('prompts.csv', '/repo')).toBe('/repo/data/prompts.csv');
  });

  it('rejects paths, traversal attempts and non-CSV files', () => {
    for (const value of [
      '../secret.csv',
      '../../etc/passwd',
      '/tmp/prompts.csv',
      'C:\\temp\\prompts.csv',
      'data/prompts.csv',
      './data/prompts.csv',
      'prompts.json',
      '.csv'
    ]) {
      expect(() => promptCsvFilename(value, 'fallback.csv')).toThrow();
    }
  });
});
