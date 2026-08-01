import { describe, expect, test } from 'bun:test';
import type { LogEntry } from '@ramassa/shared/logger';
import { createDevLogBuffer, filterLogEntries } from './dev-log-buffer';

function entry(level: LogEntry['level'], message: string): LogEntry {
  return { level, message, context: {}, timestamp: '2026-07-24T00:00:00.000Z' };
}

describe('createDevLogBuffer', () => {
  test('its sink collects entries newest first', () => {
    const buffer = createDevLogBuffer({ capacity: 5 });
    buffer.sink(entry('info', 'first'));
    buffer.sink(entry('warn', 'second'));
    expect(buffer.entries().map((item) => item.message)).toEqual(['second', 'first']);
  });

  test('drops the oldest past capacity, so a chatty screen cannot leak memory', () => {
    const buffer = createDevLogBuffer({ capacity: 2 });
    for (const message of ['a', 'b', 'c']) {
      buffer.sink(entry('info', message));
    }
    expect(buffer.entries().map((item) => item.message)).toEqual(['c', 'b']);
  });

  test('clear empties it', () => {
    const buffer = createDevLogBuffer({ capacity: 2 });
    buffer.sink(entry('info', 'a'));
    buffer.clear();
    expect(buffer.entries()).toEqual([]);
  });

  test('each entry carries a distinct id for list keys', () => {
    const buffer = createDevLogBuffer({ capacity: 5 });
    buffer.sink(entry('info', 'same'));
    buffer.sink(entry('info', 'same'));
    const ids = buffer.entries().map((item) => item.id);
    expect(new Set(ids).size).toBe(2);
  });

  test('a subscriber is notified on every write, so the viewer can re-render', () => {
    const buffer = createDevLogBuffer({ capacity: 5 });
    let notifications = 0;
    const unsubscribe = buffer.subscribe(() => {
      notifications += 1;
    });
    buffer.sink(entry('info', 'a'));
    buffer.sink(entry('info', 'b'));
    unsubscribe();
    buffer.sink(entry('info', 'c'));
    expect(notifications).toBe(2);
  });

  test('entries() is referentially stable until a write, so useSyncExternalStore cannot loop', () => {
    const buffer = createDevLogBuffer({ capacity: 5 });
    buffer.sink(entry('info', 'a'));
    const first = buffer.entries();
    expect(buffer.entries()).toBe(first);
    buffer.sink(entry('info', 'b'));
    expect(buffer.entries()).not.toBe(first);
  });
});

describe('filterLogEntries', () => {
  const entries = [
    entry('error', 'e'),
    entry('warn', 'w'),
    entry('info', 'i'),
    entry('debug', 'd'),
  ];

  test('keeps entries at or above the chosen level', () => {
    expect(filterLogEntries(entries, 'warn').map((item) => item.level)).toEqual(['error', 'warn']);
  });

  test('debug keeps everything', () => {
    expect(filterLogEntries(entries, 'debug')).toHaveLength(4);
  });

  test('error keeps only errors', () => {
    expect(filterLogEntries(entries, 'error').map((item) => item.message)).toEqual(['e']);
  });
});
