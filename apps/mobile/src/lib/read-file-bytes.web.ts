/** The web build reads a picked or made file through `fetch` (RAPP-403). */
export async function readFileBytes(uri: string): Promise<Uint8Array> {
  return new Uint8Array(await (await fetch(uri)).arrayBuffer());
}
