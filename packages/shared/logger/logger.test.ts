import { describe, expect, test } from 'bun:test';
import { AppError } from '../errors';
import type { ErrorReporter } from './error-reporter';
import { createLogger, type LogEntry } from './logger';
import { REDACTED } from './redact';

function createCapturingSink() {
  const entries: LogEntry[] = [];
  return { entries, sink: (entry: LogEntry) => entries.push(entry) };
}

function createCapturingReporter() {
  const captured: { error: AppError; context: Record<string, unknown> }[] = [];
  const reporter: ErrorReporter = {
    captureError: (error, context) => captured.push({ error, context: context ?? {} }),
  };
  return { captured, reporter };
}

describe('createLogger — structure and levels', () => {
  test('emits structured entries with level, message, and redacted context', () => {
    const { entries, sink } = createCapturingSink();
    const logger = createLogger({ sink });

    logger.info('attendance saved', { eventId: 'evt-1', name: 'Amina Rahimi' });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.level).toBe('info');
    expect(entries[0]?.message).toBe('attendance saved');
    expect(entries[0]?.context.eventId).toBe('evt-1');
    expect(entries[0]?.context.name).toBe(REDACTED);
  });

  test('suppresses entries below the minimum level', () => {
    const { entries, sink } = createCapturingSink();
    const logger = createLogger({ sink, minimumLevel: 'warn' });

    logger.debug('noise');
    logger.info('noise');
    logger.warn('kept');
    logger.error('kept');

    expect(entries.map((entry) => entry.level)).toEqual(['warn', 'error']);
  });

  test('merges bound base context into every entry', () => {
    const { entries, sink } = createCapturingSink();
    const logger = createLogger({ sink, baseContext: { runtime: 'mobile' } });

    logger.info('boot');

    expect(entries[0]?.context.runtime).toBe('mobile');
  });
});

describe('createLogger — error reporting', () => {
  test('logger.error normalizes the failure to AppError and reports it with redacted context', () => {
    const { sink } = createCapturingSink();
    const { captured, reporter } = createCapturingReporter();
    const logger = createLogger({ sink, reporter });

    logger.error('upload failed', {
      error: new AppError('UPLOAD-1'),
      fileName: 'photo.jpg',
      phone: '+34 612 345 678',
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]?.error.code).toBe('UPLOAD-1');
    expect(captured[0]?.context.fileName).toBe('photo.jpg');
    expect(captured[0]?.context.phone).toBe(REDACTED);
  });

  test('logger.error on a plain thrown value still reports a typed AppError', () => {
    const { sink } = createCapturingSink();
    const { captured, reporter } = createCapturingReporter();
    const logger = createLogger({ sink, reporter });

    logger.error('something broke', { error: new Error('boom') });

    expect(captured[0]?.error.name).toBe('AppError');
    expect(captured[0]?.error.code).toBe('UNEXPECTED-1');
  });

  test('warn and below never reach the reporter', () => {
    const { sink } = createCapturingSink();
    const { captured, reporter } = createCapturingReporter();
    const logger = createLogger({ sink, reporter });

    logger.warn('degraded', { error: new AppError('NETWORK-1') });

    expect(captured).toHaveLength(0);
  });

  test('a throwing reporter never breaks logging', () => {
    const { entries, sink } = createCapturingSink();
    const logger = createLogger({
      sink,
      reporter: {
        captureError: () => {
          throw new Error('reporter down');
        },
      },
    });

    expect(() => logger.error('still logs', { error: new AppError('DB-1') })).not.toThrow();
    expect(entries).toHaveLength(1);
  });

  test('a throwing sink never breaks the caller', () => {
    const logger = createLogger({
      sink: () => {
        throw new Error('sink down');
      },
    });
    expect(() => logger.info('fine')).not.toThrow();
  });
});
