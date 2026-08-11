import '@supabase/functions-js/edge-runtime.d.ts';
import {
  AppError,
  buildExpoMessage,
  chunkItems,
  classifyExpoOutcome,
  EXPO_RECEIPT_BATCH_SIZE,
  EXPO_SEND_BATCH_SIZE,
  getAcceptedExpoTicketId,
  getRetryDelayMs,
  postExpoJson,
  shouldRetryPushDelivery,
  toAppError,
  type ExpoOutcome,
  type ExpoPushMessage,
  type LocalizedPushText,
  type PushAppErrorCode,
  type PushContent,
  type PushContentType,
} from '../_shared/push.ts';

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const MAX_DELIVERIES_PER_INVOCATION = 500;

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
  readonly title: LocalizedPushText | null;
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

function configuredPublishableKeys(): readonly string[] {
  return [
    ...parseNamedKeys(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')),
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY'),
    Deno.env.get('SUPABASE_ANON_KEY'),
  ].filter((entry): entry is string => entry !== undefined && entry.length > 0);
}

function createRpcClient(): RpcClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = configuredPublishableKeys()[0];
  if (url === undefined || key === undefined) throw new AppError('PUSH-7');

  return {
    async rpc(name, args) {
      try {
        const response = await fetch(`${url}/rest/v1/rpc/${encodeURIComponent(name)}`, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            apikey: key,
            'content-type': 'application/json',
          },
          body: JSON.stringify(args),
        });
        const data = (await response.json()) as unknown;
        return response.ok
          ? { data, error: null }
          : {
              data: null,
              error: {
                message:
                  typeof objectRecord(data)?.message === 'string'
                    ? String(objectRecord(data)?.message)
                    : 'Push RPC rejected the request',
              },
            };
      } catch {
        return { data: null, error: { message: 'Push RPC transport failed' } };
      }
    },
  };
}

function withDispatchSecret(client: RpcClient, dispatchSecret: string): RpcClient {
  return {
    rpc(name, args) {
      return client.rpc(name, { ...args, dispatch_secret: dispatchSecret });
    },
  };
}

async function authorize(client: RpcClient, dispatchSecret: string | null): Promise<boolean> {
  if (dispatchSecret === null || dispatchSecret.length < 32 || dispatchSecret.length > 256) {
    return false;
  }
  const result = await client.rpc('authorize_push_dispatch', {
    dispatch_secret: dispatchSecret,
  });
  return result.error === null && result.data === true;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseDeliveryClaims(value: unknown): readonly PushDeliveryClaim[] {
  if (!Array.isArray(value)) throw new AppError('PUSH-7');

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
      (row.content_type !== 'announcement' &&
        row.content_type !== 'event' &&
        row.content_type !== 'message') ||
      typeof row.content_id !== 'string' ||
      (row.content_type === 'message'
        ? row.title !== null || row.body !== null
        : objectRecord(row.title) === null) ||
      (row.body !== null && objectRecord(row.body) === null) ||
      (row.expires_at !== null && typeof row.expires_at !== 'string') ||
      typeof row.attempt_count !== 'number'
    ) {
      throw new AppError('PUSH-7');
    }
    return row as unknown as PushDeliveryClaim;
  });
}

function parseReceiptClaims(value: unknown): readonly PushReceiptClaim[] {
  if (!Array.isArray(value)) throw new AppError('PUSH-7');

  return value.map((item) => {
    const row = objectRecord(item);
    if (
      row === null ||
      typeof row.delivery_id !== 'string' ||
      (row.push_token_id !== null && typeof row.push_token_id !== 'string') ||
      typeof row.ticket_id !== 'string' ||
      typeof row.receipt_attempt_count !== 'number'
    ) {
      throw new AppError('PUSH-7');
    }
    return row as unknown as PushReceiptClaim;
  });
}

function parseTickets(value: unknown, expectedCount: number): readonly ExpoOutcome[] {
  const response = objectRecord(value) as ExpoSendResponse | null;
  if (
    response === null ||
    !Array.isArray(response.data) ||
    response.data.length !== expectedCount
  ) {
    throw new AppError('PUSH-8');
  }
  return response.data.map((ticket) => {
    const record = objectRecord(ticket);
    if (record === null) throw new AppError('PUSH-8');
    return record;
  });
}

function parseReceipts(value: unknown): Readonly<Record<string, ExpoOutcome>> {
  const response = objectRecord(value) as ExpoReceiptResponse | null;
  const data = objectRecord(response?.data);
  if (data === null) throw new AppError('PUSH-3');

  return Object.fromEntries(
    Object.entries(data).map(([ticketId, receipt]) => [ticketId, objectRecord(receipt) ?? {}]),
  );
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
  if (error !== null || data !== results.length) throw new AppError('PUSH-7', { cause: error });
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
  if (error !== null || data !== results.length) throw new AppError('PUSH-7', { cause: error });
}

function addResultMetric(metrics: PushMetrics, state: DeliveryResult['state']): void {
  if (state === 'ticketed') metrics.ticketed += 1;
  if (state === 'retry') metrics.retrying += 1;
  if (state === 'failed') metrics.failed += 1;
  if (state === 'pruned') metrics.pruned += 1;
}

function deliveryFailureResult(
  claim: PushDeliveryClaim,
  errorCode: PushAppErrorCode,
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

function pushErrorCode(error: AppError, fallback: PushAppErrorCode): PushAppErrorCode {
  return error.domain === 'PUSH' ? (error.code as PushAppErrorCode) : fallback;
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
      const response = await postExpoJson(EXPO_SEND_URL, messages, 'PUSH-8', {
        accessToken: Deno.env.get('EXPO_ACCESS_TOKEN'),
      });
      const tickets = parseTickets(response, validClaims.length);
      results = tickets.map((ticket, index) => {
        const claim = validClaims[index]!;
        if (ticket.status !== 'ok' && ticket.status !== 'error') {
          return deliveryFailureResult(claim, 'PUSH-8');
        }
        const classification = classifyExpoOutcome(ticket);
        if (classification === 'delivered') {
          try {
            const ticketId = getAcceptedExpoTicketId(ticket);
            if (ticketId !== null) {
              return { delivery_id: claim.delivery_id, state: 'ticketed', ticket_id: ticketId };
            }
          } catch {
            return deliveryFailureResult(claim, 'PUSH-8');
          }
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
      const appError = toAppError(error, 'PUSH-8');
      const code = pushErrorCode(appError, 'PUSH-8');
      results = validClaims.map((claim) => deliveryFailureResult(claim, code));
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
      const response = await postExpoJson(
        EXPO_RECEIPTS_URL,
        { ids: claimChunk.map((claim) => claim.ticket_id) },
        'PUSH-5',
        { accessToken: Deno.env.get('EXPO_ACCESS_TOKEN') },
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
      const appError = toAppError(error, 'PUSH-5');
      const code = pushErrorCode(appError, 'PUSH-5');
      results = claimChunk.map((claim) => ({
        delivery_id: claim.delivery_id,
        state: 'pending_receipt',
        error_code: code,
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
  if (deliveryResult.error !== null) throw new AppError('PUSH-7', { cause: deliveryResult.error });
  const deliveryClaims = parseDeliveryClaims(deliveryResult.data);
  metrics.claimed = deliveryClaims.length;
  await sendClaimedDeliveries(client, workerId, deliveryClaims, metrics);

  const receiptResult = await client.rpc('claim_push_receipts', {
    claiming_worker_id: workerId,
    claim_limit: EXPO_RECEIPT_BATCH_SIZE,
  });
  if (receiptResult.error !== null) throw new AppError('PUSH-7', { cause: receiptResult.error });
  await checkClaimedReceipts(client, workerId, parseReceiptClaims(receiptResult.data), metrics);

  return metrics;
}

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      const client = createRpcClient();
      const dispatchSecret = request.headers.get('x-push-dispatch-secret');
      if (!(await authorize(client, dispatchSecret))) {
        return Response.json({ ok: false, code: 'PUSH-1' }, { status: 401 });
      }

      const metrics = await dispatchPush(withDispatchSecret(client, dispatchSecret!));
      console.info(JSON.stringify({ event: 'push_dispatch_complete', ...metrics }));
      return Response.json({ ok: true, ...metrics });
    } catch (error) {
      const appError = toAppError(error, 'PUSH-7');
      const code = pushErrorCode(appError, 'PUSH-7');
      console.error(JSON.stringify({ event: 'push_dispatch_failed', code }));
      return Response.json({ ok: false, code }, { status: 500 });
    }
  },
};
