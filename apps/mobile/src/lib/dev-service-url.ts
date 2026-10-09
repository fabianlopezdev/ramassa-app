interface DevServiceContext {
  readonly isDev: boolean;
  readonly platform: string;
  readonly hostUri?: string;
}

/** Native loopback points at the phone. Follow Metro's private LAN host during
 * development, while keeping hosted environments and public tunnels untouched.
 * https://docs.expo.dev/versions/latest/sdk/constants/#nativeconstants
 */
export function resolveDevServiceUrl(
  value: string | undefined,
  { isDev, platform, hostUri }: DevServiceContext,
): string | undefined {
  if (!isDev || !['android', 'ios'].includes(platform) || !value || !hostUri) return value;
  try {
    const service = new URL(value);
    if (
      service.protocol !== 'http:' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(service.hostname)
    ) {
      return value;
    }
    const host = new URL(hostUri.includes('://') ? hostUri : `http://${hostUri}`).hostname;
    const octets = host.split('.').map(Number);
    const isPrivateIpv4 =
      octets.length === 4 &&
      octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
      (octets[0] === 10 ||
        (octets[0] === 192 && octets[1] === 168) ||
        (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31));
    if (!isPrivateIpv4) return value;
    service.hostname = host;
    return service.toString();
  } catch {
    return value;
  }
}
