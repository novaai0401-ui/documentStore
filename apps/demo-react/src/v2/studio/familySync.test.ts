import { describe, it, expect } from 'vitest';
import { projectToEntries, entriesToProject, tallyVotes, winningVariant, voterId } from './familySync.js';
import type { FamilyProject } from './familyStudio.js';

const proj = (): FamilyProject => ({
  themeId: 'diwali',
  members: [
    { id: 'a', name: 'Aai', photo: 'data:image/png;base64,xxx', costume: '👑' },
    { id: 'b', name: 'Rohan', photo: '', costume: '' },
  ],
  votes: [0, 0, 0],
});

describe('family live sync codec', () => {
  it('round-trips a project through the synced entries (photos + order preserved)', () => {
    const entries = projectToEntries(proj());
    expect(entries.theme).toBe('diwali');
    const back = entriesToProject(entries);
    expect(back.themeId).toBe('diwali');
    expect(back.members.map((m) => m.id)).toEqual(['a', 'b']);
    expect(back.members[0]!.photo).toContain('data:image'); // contributed photo rides along
    expect(back.members[0]!.costume).toBe('👑');
  });

  it('per-member keys let two relatives edit different members without conflict', () => {
    // Simulate the LWW-Map: start from host entries, apply two independent updates.
    const entries = projectToEntries(proj());
    // Relative A adds a photo to member b; theme + member a untouched.
    entries['member:b'] = JSON.stringify({ id: 'b', name: 'Rohan', photo: 'data:image/png;base64,yyy', costume: '🕶️' });
    const back = entriesToProject(entries);
    expect(back.members[1]!.photo).toContain('yyy');
    expect(back.members[0]!.photo).toContain('xxx'); // A's edit didn't clobber
  });

  it('surfaces a member who added themselves before the order entry arrived', () => {
    const entries = projectToEntries(proj());
    entries['member:c'] = JSON.stringify({ id: 'c', name: 'Dubai Cousin', photo: '', costume: '' });
    const back = entriesToProject(entries);
    expect(back.members.map((m) => m.name)).toContain('Dubai Cousin');
  });

  it('tallies one vote per voter and re-voting moves the vote (LWW)', () => {
    let entries: Record<string, string> = {};
    entries = { ...entries, 'vote:v1': '0', 'vote:v2': '1', 'vote:v3': '1' };
    expect(tallyVotes(entries, 3)).toEqual([1, 2, 0]);
    // v1 changes their mind → variant 1 (same key overwritten).
    entries['vote:v1'] = '1';
    expect(tallyVotes(entries, 3)).toEqual([0, 3, 0]);
    expect(winningVariant(tallyVotes(entries, 3))).toBe(1);
  });

  it('ignores out-of-range / garbage votes', () => {
    const entries = { 'vote:v1': '9', 'vote:v2': 'nope', 'vote:v3': '2' };
    expect(tallyVotes(entries, 3)).toEqual([0, 0, 1]);
    expect(winningVariant([0, 0, 0])).toBe(-1);
  });

  it('projectToEntries includes each per-voter vote', () => {
    const entries = projectToEntries(proj(), { v1: 2, v2: 2 });
    expect(entries['vote:v1']).toBe('2');
    expect(tallyVotes(entries, 3)).toEqual([0, 0, 2]);
  });

  it('voterId is stable within a session', () => {
    expect(voterId()).toBe(voterId());
    expect(voterId()).toMatch(/^v/);
  });
});
