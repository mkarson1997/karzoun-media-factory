import { ChannelType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { rankAutopilotCandidates } from './autopilot';

const candidates = [
  { id: '1', externalPromptId: 'KMF-0001', category: 'Space', concept: 'A', targetDurationSeconds: 40, channelType: ChannelType.GENERAL },
  { id: '2', externalPromptId: 'KMF-0002', category: 'Puzzles', concept: 'B', targetDurationSeconds: 42, channelType: ChannelType.GENERAL },
  { id: '3', externalPromptId: 'KMF-0003', category: 'Animals', concept: 'C', targetDurationSeconds: 44, channelType: ChannelType.GENERAL }
];

describe('autopilot ranking', () => {
  it('prefers a proven high-performing category', () => {
    const ranked = rankAutopilotCandidates(candidates, [
      { jobId: 'old-1', category: 'Space', score: 88 },
      { jobId: 'old-2', category: 'Space', score: 92 },
      { jobId: 'old-3', category: 'Puzzles', score: 61 }
    ], []);

    expect(ranked[0].category).toBe('Space');
    expect(ranked[0].categoryAverage).toBe(90);
  });

  it('penalizes recently repeated categories so the queue stays diverse', () => {
    const ranked = rankAutopilotCandidates(candidates, [
      { jobId: 'old-1', category: 'Space', score: 70 },
      { jobId: 'old-2', category: 'Puzzles', score: 69 }
    ], ['Space', 'Space', 'Space']);

    expect(ranked[0].category).not.toBe('Space');
  });

  it('explores categories that have no analytics yet', () => {
    const ranked = rankAutopilotCandidates(candidates, [], []);
    expect(ranked).toHaveLength(3);
    expect(ranked.every((item) => item.selectionScore === 61)).toBe(true);
  });

  it('uses only the latest sample per job id', () => {
    const ranked = rankAutopilotCandidates(candidates, [
      { jobId: 'same-job', category: 'Space', score: 91 },
      { jobId: 'same-job', category: 'Space', score: 10 }
    ], []);
    const space = ranked.find((item) => item.category === 'Space');
    expect(space?.categoryAverage).toBe(91);
    expect(space?.categorySamples).toBe(1);
  });
});
