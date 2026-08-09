export interface DesktopBridgeClientAccess {
  handshaken: boolean;
  trusted: boolean;
}

export function shouldSendPrivateBridgeState(client: DesktopBridgeClientAccess): boolean {
  return client.handshaken && client.trusted;
}

interface DesktopBridgeNetworkClient {
  trusted: boolean;
  socket?: { remoteAddress?: string | null };
}

function normalizeRemoteAddress(address: string | null | undefined): string {
  return (address ?? '').replace(/^::ffff:/i, '');
}

export function isTrustedBridgeHttpPeer(
  remoteAddress: string | null | undefined,
  clients: Iterable<DesktopBridgeNetworkClient>
): boolean {
  const normalizedRemote = normalizeRemoteAddress(remoteAddress);
  if (!normalizedRemote) return false;

  for (const client of clients) {
    if (
      client.trusted &&
      normalizeRemoteAddress(client.socket?.remoteAddress) === normalizedRemote
    ) {
      return true;
    }
  }
  return false;
}
