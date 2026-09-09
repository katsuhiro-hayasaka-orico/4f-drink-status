import { describe, expect, it } from 'vitest';
import { ApiError } from './api.js';
import { classifyPostError, outcomeMessage } from './postOutcome.js';

describe('classifyPostError', () => {
  it('reads a status as the server saying no', () => {
    expect(classifyPostError(new ApiError(429, '投稿が多すぎます'))).toBe('rejected');
    expect(classifyPostError(new ApiError(400, '不正な投稿です'))).toBe('rejected');
    expect(classifyPostError(new ApiError(500, 'サーバーでエラーが発生しました'))).toBe('rejected');
  });

  it('treats a failed fetch as no verdict at all', () => {
    // api.ts wraps a network failure as ApiError(0): the request may have
    // reached the server, so the only honest answer is "unknown".
    expect(classifyPostError(new ApiError(0, 'サーバーに接続できませんでした'))).toBe('unknown');
  });

  it('treats anything that is not an ApiError as unknown', () => {
    expect(classifyPostError(new TypeError('crypto.randomUUID is not a function'))).toBe('unknown');
    expect(classifyPostError('nope')).toBe('unknown');
    expect(classifyPostError(undefined)).toBe('unknown');
  });
});

describe('outcomeMessage', () => {
  it('tells a rejected poster their input is still there', () => {
    expect(outcomeMessage('rejected')).toContain('残してある');
  });

  it('sends an unknown outcome to the board before retrying', () => {
    // Retrying blindly could double-post; the breakdown table is the check.
    expect(outcomeMessage('unknown')).toContain('投稿の内訳');
  });
});
