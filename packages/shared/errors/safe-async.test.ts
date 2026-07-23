import { describe, expect, test } from 'bun:test';
import { AppError, err, ok, safeAsync } from './index';

describe('Result helpers', () => {
  test('ok wraps a value with the ok discriminant', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  test('err wraps an error with the not-ok discriminant', () => {
    const failure = new AppError('DB-1');
    const result = err(failure);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(failure);
    }
  });
});

describe('safeAsync', () => {
  test('resolves ok with the operation value', async () => {
    const result = await safeAsync(async () => 'loaded');
    expect(result).toEqual({ ok: true, value: 'loaded' });
  });

  test('a thrown AppError comes back as err with the SAME error (no double wrap)', async () => {
    const failure = new AppError('AUTH-2');
    const result = await safeAsync(async () => {
      throw failure;
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(failure);
    }
  });

  test('a thrown plain Error is normalized under the caller-declared code with context', async () => {
    const result = await safeAsync(
      async () => {
        throw new Error('storage bucket unreachable');
      },
      { code: 'UPLOAD-1', context: { fileName: 'photo.jpg' } },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UPLOAD-1');
      expect(result.error.context.fileName).toBe('photo.jpg');
      expect(result.error.cause).toBeInstanceOf(Error);
    }
  });

  test('a synchronous throw inside the operation is also caught', async () => {
    const result = await safeAsync((): Promise<never> => {
      throw new AppError('VALIDATION-1');
    });
    expect(result.ok).toBe(false);
  });

  test('onError observes every failure exactly once', async () => {
    const observed: AppError[] = [];
    await safeAsync(
      async () => {
        throw new AppError('SYNC-1');
      },
      { onError: (error) => observed.push(error) },
    );

    expect(observed).toHaveLength(1);
    expect(observed[0]?.code).toBe('SYNC-1');
  });

  test('onError is not called on success', async () => {
    const observed: AppError[] = [];
    await safeAsync(async () => 'fine', { onError: (error) => observed.push(error) });
    expect(observed).toHaveLength(0);
  });

  test('NEVER rejects, even when onError itself throws (the hard rule)', async () => {
    const result = await safeAsync(
      async () => {
        throw new AppError('DB-1');
      },
      {
        onError: () => {
          throw new Error('broken error hook');
        },
      },
    );
    expect(result.ok).toBe(false);
  });
});
