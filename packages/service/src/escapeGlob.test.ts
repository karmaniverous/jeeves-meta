import { describe, expect, it } from 'vitest';

import { escapeGlob } from './escapeGlob.js';

describe('escapeGlob', () => {
  it('escapes parentheses with character classes', () => {
    expect(escapeGlob('project-jeeves-x (C0AMFV5SJKG)')).toBe(
      'project-jeeves-x [(]C0AMFV5SJKG[)]',
    );
  });

  it('escapes square brackets', () => {
    expect(escapeGlob('dir[0]')).toBe('dir[[]0[]]');
  });

  it('escapes curly braces', () => {
    expect(escapeGlob('{a,b}')).toBe('[{]a,b[}]');
  });

  it('escapes asterisks and question marks', () => {
    expect(escapeGlob('file*.txt')).toBe('file[*].txt');
    expect(escapeGlob('file?.txt')).toBe('file[?].txt');
  });

  it('escapes exclamation marks', () => {
    expect(escapeGlob('!negated')).toBe('[!]negated');
  });

  it('leaves normal paths unchanged', () => {
    expect(escapeGlob('j:/domains/slack/dm-jason')).toBe(
      'j:/domains/slack/dm-jason',
    );
  });

  it('handles full Slack channel path', () => {
    expect(escapeGlob('j:/domains/slack/project-jeeves-x (C0AMFV5SJKG)')).toBe(
      'j:/domains/slack/project-jeeves-x [(]C0AMFV5SJKG[)]',
    );
  });
});
