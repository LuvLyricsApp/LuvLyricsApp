import {
  isTrustedBridgeHttpPeer,
  shouldSendPrivateBridgeState,
} from './desktopBridgeSecurity';

describe('shouldSendPrivateBridgeState', () => {
  it('rejects clients before WebSocket setup', () => {
    expect(shouldSendPrivateBridgeState({ handshaken: false, trusted: true })).toBe(false);
  });

  it('rejects unpaired LAN clients after the WebSocket handshake', () => {
    expect(shouldSendPrivateBridgeState({ handshaken: true, trusted: false })).toBe(false);
  });

  it('allows only handshaken and paired desktop clients', () => {
    expect(shouldSendPrivateBridgeState({ handshaken: true, trusted: true })).toBe(true);
  });
});

describe('isTrustedBridgeHttpPeer', () => {
  it('accepts media requests only from an address with a trusted socket', () => {
    const clients = [
      { trusted: false, socket: { remoteAddress: '10.0.0.4' } },
      { trusted: true, socket: { remoteAddress: '::ffff:10.0.0.5' } },
    ];

    expect(isTrustedBridgeHttpPeer('10.0.0.5', clients)).toBe(true);
    expect(isTrustedBridgeHttpPeer('10.0.0.4', clients)).toBe(false);
    expect(isTrustedBridgeHttpPeer('10.0.0.6', clients)).toBe(false);
  });

  it('rejects requests without a remote address', () => {
    expect(isTrustedBridgeHttpPeer(undefined, [])).toBe(false);
  });
});
