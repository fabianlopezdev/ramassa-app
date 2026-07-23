/**
 * Worker-level constants. They live here rather than in `index.ts` because the
 * Workers runtime treats every named export of the entry module as an
 * additional entrypoint and refuses to start if one is not a handler.
 */

/**
 * How long a minted URL stays usable. Short on purpose: it only has to cover
 * "the user picked a file and the transfer starts", not the transfer itself,
 * which S3 permits to continue past expiry once it has begun.
 */
export const UPLOAD_URL_TTL_SECONDS = 300;
