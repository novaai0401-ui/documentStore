import { describe, it, expect } from 'vitest';
import { fuzzyScore, filterCommands, type Command } from './commands.js';

const cmd = (id: string, title: string, extra: Partial<Command> = {}): Command => ({ id, title, run: () => undefined, ...extra });

describe('fuzzyScore', () => {
  it('returns 0 for an empty query (no preference)', () => {
    expect(fuzzyScore('Resume builder', '')).toBe(0);
  });

  it('returns -1 when not every character matches in order', () => {
    expect(fuzzyScore('Resume builder', 'xyz')).toBe(-1);
    expect(fuzzyScore('abc', 'cab')).toBe(-1); // out of order
  });

  it('matches a subsequence and scores prefix + consecutive hits higher', () => {
    expect(fuzzyScore('Resume builder', 'rb')).toBeGreaterThan(0);
    // A prefix-anchored, consecutive match beats a scattered one.
    expect(fuzzyScore('resume', 'res')).toBeGreaterThan(fuzzyScore('resume', 'rue'));
  });
});

describe('filterCommands', () => {
  const commands = [
    cmd('resume', 'Resume builder', { keywords: 'cv job' }),
    cmd('letter', 'Cover letter', { keywords: 'job application' }),
    cmd('open', 'Open file'),
    cmd('design', 'New blank design'),
  ];

  it('returns all commands for an empty / whitespace query', () => {
    expect(filterCommands(commands, '')).toHaveLength(4);
    expect(filterCommands(commands, '   ')).toHaveLength(4);
  });

  it('ranks the best subsequence match first', () => {
    expect(filterCommands(commands, 'rb')[0].id).toBe('resume');
  });

  it('drops non-matches', () => {
    const out = filterCommands(commands, 'design');
    expect(out.map((c) => c.id)).toEqual(['design']);
  });

  it('matches via keywords as well as the title', () => {
    expect(filterCommands(commands, 'cv').some((c) => c.id === 'resume')).toBe(true);
  });
});
