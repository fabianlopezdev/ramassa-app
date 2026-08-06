import '@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from '@supabase/supabase-js';
import {
  buildExpoMessage,
  chunkItems,
  classifyExpoOutcome,
  EXPO_RECEIPT_BATCH_SIZE,
  EXPO_SEND_BATCH_SIZE,
  getRetryDelayMs,
  isPushError,
  isTransientExpoStatus,
  PushError,
  shouldRetryPushDelivery,
  toPushError,
  type ExpoOutcome,
  type ExpoPushMessage,
  type LocalizedPushText,
  type PushContent,
  type PushContentType,
} from '../_shared/push.ts';

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const MAX_DELIVERIES_PER_INVOCATION = 500;
const MAX_HTTP_ATTEMPTS = 3;

interface RpcError {
  readonly message: string;
}

interface RpcResult {
  readonly data: unknown;
  readonly error: RpcError | null;
}

interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
}

interface PushDeliveryClaim {
  readonly delivery_id: string;
  readonly publication_id: string;
  readonly push_token_id: string;
  readonly recipient_id: string;
  readonly token: string;
  readonly language: string;
  readonly content_type: PushContentType;
  readonly content_id: string;
  readonly title: LocalizedPushText;
  readonly body: LocalizedPushText | null;
  readonly expires_at: string | null;
  readonly attempt_count: number;
}

interface PushReceiptClaim {
  readonly delivery_id: string;
  readonly push_token_id: string | null;
  readonly ticket_id: string;
  readonly receipt_attempt_count: number;
}

interface ExpoTicket extends ExpoOutcome {
  readonly id?: unknown;
}

interface ExpoSendResponse {
  readonly data?: unknown;
}

interface ExpoReceiptResponse {
  readonly data?: unknown;
}

interface DeliveryResult {
  readonly delivery_id: string;
  readonly state: 'ticketed' | 'retry' | 'failed' | 'pruned';
  readonly ticket_id?: string;
  readonly error_code?: string;
  readonly next_attempt_at?: string;
}

interface ReceiptResult {
  readonly delivery_id: string;
  readonly state: 'delivered' | 'retry' | 'failed' | 'pruned' | 'pending_receipt';
  readonly error_code?: string;
  readonly next_attempt_at?: string;
}

interface PushMetrics {
  claimed: number;
  ticketed: number;
  delivered: number;
  retrying: number;
  failed: number;
  pruned: number;
  receiptsPending: number;
}

function parseNamedKeys(value: string | undefined): readonly string[] {
  if (value === undefined) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    const record = objectRecord(parsed);
    return record === null
      ? []
      : Object.values(record).filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

function configuredSecretKeys(): readonly string[] {
  return [
    ...parseNamedKeys(Deno.env.get('SUPABASE_SECRET_KEYS')),
    Deno.env.get('SUPABASE_SECRET_KEY'),
    // Supabase CLI 2.90 injects only the legacy service-role key locally. This
    // fallback is local compatibility; hosted projects use a modern secret key.
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  ].filter((entry): entry is string => entry !== undefined && entry.length > 0);
}

async function matchesSecretKey(candidate: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [candidateHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(candidate)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const candidateBytes = new Uint8Array(candidateHash);
  const expectedBytes = new Uint8Array(expectedHash);
  let difference = candidateBytes.length ^ expectedBytes.length;
  for (let index = 0; index < candidateBytes.length; index += 1) {
    difference |= candidateBytes[index]! ^ expectedBytes[index]!;
  }
  return difference === 0;
}

async function authorize(request: Request): Promise<boolean> {
  const candidate = request.headers.get('apikey');
  if (candidate === null) return false;
  const matches = await Promise.all(
    configuredSecretKeys().map((expected) => matchesSecretKey(candidate, expected)),
  );
  return matches.some(Boolean);
}

function createAdminClient(): RpcClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = configuredSecretKeys()[0];
  if (url === undefined || key === undefined) throw new PushError('PUSH-7');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as RpcClient;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseDeliveryClaims(value: unknown): readonly PushDeliveryClaim[] {
  if (!Array.isArray(value)) throw new PushError('PUSH-7');

  return value.map((item) => {
    const row = objectRecord(item);
    if (
      row === null ||
      typeof row.delivery_id !== 'string' ||
      typeof row.publication_id !== 'string' ||
      typeof row.push_token_id !== 'string' ||
      typeof row.recipient_id !== 'string' ||
      typeof row.token !== 'string' ||
      typeof row.language !== 'string' ||
      (row.content_type !== 'announcement' && row.content_type !== 'event') ||
      typeof row.content_id !== 'string' ||
      objectRecord(row.title) === null ||
      (row.body !== null && objectRecord(row.body) === null) ||
      (row.expires_at !== null && typeof row.expires_at !== 'string') ||
      typeof row.attempt_count !== 'number'
    ) {
      throw new PushError('PUSH-7');
    }
    return row as unknown as PushDeliveryClaim;
  });
}

function parseReceiptClaims(value: unknown): readonly PushReceiptClaim[] {
  if (!Array.isArray(value)) throw new PushError('PUSH-7');

  return value.map((item) => {
    const row = objectRecord(item);
    if (
      row === null ||
      typeof row.delivery_id !== 'string' ||
      (row.push_token_id !== null && typeof row.push_token_id !== 'string') ||
      typeof row.ticket_id !== 'string' ||
      typeof row.receipt_attempt_count !== 'number'
    ) {
      throw new PushError('PUSH-7');
    }
    return row as unknown as PushReceiptClaim;
  });
}

function parseTickets(value: unknown, expectedCount: number): readonly ExpoTicket[] {
  const response = objectRecord(value) as ExpoSendResponse | null;
  if (
    response === null ||
    !Array.isArray(response.data) ||
    response.data.length !== expectedCount
  ) {
    throw new PushError('PUSH-3');
  }
  return response.data.map((ticket) => objectRecord(ticket) ?? {});
}

function parseReceipts(value: unknown): Readonly<Record<string, ExpoOutcome>> {
  const response = objectRecord(value) as ExpoReceiptResponse | null;
  const data = objectRecord(response?.data);
  if (data === null) throw new PushError('PUSH-3');

  return Object.fromEntries(
    Object.entries(data).map(([ticketId, receipt]) => [ticketId, objectRecord(receipt) ?? {}]),
  );
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function postExpo(
  url: string,
  body: unknown,
  failureCode: 'PUSH-2' | 'PUSH-5',
): Promise<unknown> {
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');

  for (let attempt = 1; attempt <= MAX_HTTP_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(accessToken === undefined ? {} : { authorization: `Bearer ${accessToken}` }),
        },
        body: JSON.stringify(body),
      });

      if (response.ok) return await response.json();
      if (!isTransientExpoStatus(response.status)) throw new PushError('PUSH-3');
    } catch (error) {
      if (isPushError(error) && error.code === 'PUSH-3') throw error;
      if (attempt === MAX_HTTP_ATTEMPTS) {
        throw new PushError(failureCode, { cause: error });
      }
    }

    await sleep(getRetryDelayMs(attempt));
  }

  throw new PushError(failureCode);
}

function retryAt(attempt: number): string {
  return new Date(Date.now() + getRetryDelayMs(attempt)).toISOString();
}

async function recordDeliveryResults(
  client: RpcClient,
  workerId: string,
  results: readonly DeliveryResult[],
): Promise<void> {
  if (results.length === 0) return;
  const { data, error } = await client.rpc('record_push_delivery_results', {
    recording_worker_id: workerId,
    results,
  });
  if (error !== null || data !== results.length) throw new PushError('PUSH-7', { cause: error });
}

async function recordReceiptResults(
  client: RpcClient,
  workerId: string,
  results: readonly ReceiptResult[],
): Promise<void> {
  if (results.length === 0) return;
  const { data, error } = await client.rpc('record_push_receipt_results', {
    recording_worker_id: workerId,
    results,
  });
  if (error !== null || data !== results.length) throw new PushError('PUSH-7', { cause: error });
}

function addResultMetric(metrics: PushMetrics, state: DeliveryResult['state']): void {
  if (state === 'ticketed') metrics.ticketed += 1;
  if (state === 'retry') metrics.retrying += 1;
  if (state === 'failed') metrics.failed += 1;
  if (state === 'pruned') metrics.pruned += 1;
}

function deliveryFailureResult(
  claim: PushDeliveryClaim,
  errorCode: PushError['code'],
): DeliveryResult {
  return shouldRetryPushDelivery(errorCode, claim.attempt_count)
    ? {
        delivery_id: claim.delivery_id,
        state: 'retry',
        error_code: errorCode,
        next_attempt_at: retryAt(claim.attempt_count),
      }
    : { delivery_id: claim.delivery_id, state: 'failed', error_code: errorCode };
}

async function sendClaimedDeliveries(
  client: RpcClient,
  workerId: string,
  claims: readonly PushDeliveryClaim[],
  metrics: PushMetrics,
): Promise<void> {
  for (const claimChunk of chunkItems(claims, EXPO_SEND_BATCH_SIZE)) {
    const messages: ExpoPushMessage[] = [];
    const validClaims: PushDeliveryClaim[] = [];
    const invalidResults: DeliveryResult[] = [];

    for (const claim of claimChunk) {
      try {
        const content: PushContent = {
          contentType: claim.content_type,
          contentId: claim.content_id,
          title: claim.title,
          body: claim.body,
          expiresAt: claim.expires_at,
        };
        messages.push(buildExpoMessage(claim.token, content, claim.language));
        validClaims.push(claim);
      } catch {
        invalidResults.push({
          delivery_id: claim.delivery_id,
          state: 'failed',
          error_code: 'PUSH-3',
        });
      }
    }

    await recordDeliveryResults(client, workerId, invalidResults);
    invalidResults.forEach((result) => addResultMetric(metrics, result.state));
    if (messages.length === 0) continue;

    let results: DeliveryResult[];
    try {
      const response = await postExpo(EXPO_SEND_URL, messages, 'PUSH-2');
      const tickets = parseTickets(response, validClaims.length);
      results = tickets.map((ticket, index) => {
        const claim = validClaims[index]!;
        const classification = classifyExpoOutcome(ticket);
        if (classification === 'delivered' && typeof ticket.id === 'string') {
          return { delivery_id: claim.delivery_id, state: 'ticketed', ticket_id: ticket.id };
        }
        if (classification === 'pruned') {
          return { delivery_id: claim.delivery_id, state: 'pruned', error_code: 'PUSH-4' };
        }
        if (classification === 'retry') {
          return deliveryFailureResult(claim, 'PUSH-2');
        }
        return { delivery_id: claim.delivery_id, state: 'failed', error_code: 'PUSH-4' };
      });
    } catch (error) {
      const appError = toPushError(error, 'PUSH-2');
      results = validClaims.map((claim) => deliveryFailureResult(claim, appError.code));
    }

    await recordDeliveryResults(client, workerId, results);
    results.forEach((result) => addResultMetric(metrics, result.state));
  }
}

async function checkClaimedReceipts(
  client: RpcClient,
  workerId: string,
  claims: readonly PushReceiptClaim[],
  metrics: PushMetrics,
): Promise<void> {
  for (const claimChunk of chunkItems(claims, EXPO_RECEIPT_BATCH_SIZE)) {
    let results: ReceiptResult[];
    try {
      const response = await postExpo(
        EXPO_RECEIPTS_URL,
        { ids: claimChunk.map((claim) => claim.ticket_id) },
        'PUSH-5',
      );
      const receipts = parseReceipts(response);
      results = claimChunk.map((claim) => {
        const receipt = receipts[claim.ticket_id];
        if (receipt === undefined) {
          return { delivery_id: claim.delivery_id, state: 'pending_receipt' };
        }
        const classification = classifyExpoOutcome(receipt);
        if (classification === 'delivered') {
          return { delivery_id: claim.delivery_id, state: 'delivered' };
        }
        if (classification === 'pruned') {
          return { delivery_id: claim.delivery_id, state: 'pruned', error_code: 'PUSH-4' };
        }
        if (classification === 'retry') {
          return shouldRetryPushDelivery('PUSH-2', claim.receipt_attempt_count)
            ? {
                delivery_id: claim.delivery_id,
                state: 'retry',
                error_code: 'PUSH-2',
                next_attempt_at: retryAt(claim.receipt_attempt_count),
              }
            : { delivery_id: claim.delivery_id, state: 'failed', error_code: 'PUSH-2' };
        }
        return { delivery_id: claim.delivery_id, state: 'failed', error_code: 'PUSH-4' };
      });
    } catch (error) {
      const appError = toPushError(error, 'PUSH-5');
      results = claimChunk.map((claim) => ({
        delivery_id: claim.delivery_id,
        state: 'pending_receipt',
        error_code: appError.code,
      }));
    }

    await recordReceiptResults(client, workerId, results);
    for (const result of results) {
      if (result.state === 'delivered') metrics.delivered += 1;
      if (result.state === 'retry') metrics.retrying += 1;
      if (result.state === 'failed') metrics.failed += 1;
      if (result.state === 'pruned') metrics.pruned += 1;
      if (result.state === 'pending_receipt') metrics.receiptsPending += 1;
    }
  }
}

async function dispatchPush(client: RpcClient): Promise<PushMetrics> {
  const workerId = crypto.randomUUID();
  const metrics: PushMetrics = {
    claimed: 0,
    ticketed: 0,
    delivered: 0,
    retrying: 0,
    failed: 0,
    pruned: 0,
    receiptsPending: 0,
  };

  const deliveryResult = await client.rpc('claim_push_deliveries', {
    claiming_worker_id: workerId,
    claim_limit: MAX_DELIVERIES_PER_INVOCATION,
  });
  if (deliveryResult.error !== null) throw new PushError('PUSH-7', { cause: deliveryResult.error });
  const deliveryClaims = parseDeliveryClaims(deliveryResult.data);
  metrics.claimed = deliveryClaims.length;
  await sendClaimedDeliveries(client, workerId, deliveryClaims, metrics);

  const receiptResult = await client.rpc('claim_push_receipts', {
    claiming_worker_id: workerId,
    claim_limit: EXPO_RECEIPT_BATCH_SIZE,
  });
  if (receiptResult.error !== null) throw new PushError('PUSH-7', { cause: receiptResult.error });
  await checkClaimedReceipts(client, workerId, parseReceiptClaims(receiptResult.data), metrics);

  return metrics;
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (!(await authorize(request))) {
      return Response.json({ ok: false, code: 'PUSH-1' }, { status: 401 });
    }

    try {
      const metrics = await dispatchPush(createAdminClient());
      console.info(JSON.stringify({ event: 'push_dispatch_complete', ...metrics }));
      return Response.json({ ok: true, ...metrics });
    } catch (error) {
      const appError = toPushError(error, 'PUSH-7');
      console.error(JSON.stringify({ event: 'push_dispatch_failed', code: appError.code }));
      return Response.json({ ok: false, code: appError.code }, { status: 500 });
    }
  },
};
