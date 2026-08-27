import { describe, expect, it } from 'vitest';
import { AppGateway, type SocketWithAuth } from './app.gateway.js';

function gatewayWithServer(server: unknown): AppGateway {
  const gateway = Object.create(AppGateway.prototype) as AppGateway;
  gateway.server = server as AppGateway['server'];
  return gateway;
}

function mockSocket(profileId: string): SocketWithAuth {
  return {
    data: {
      user: { sub: 'user-account', email: 'a@b.com', profileId },
    },
  } as SocketWithAuth;
}

describe('AppGateway.addConversationToSocket', () => {
  it('grants in-memory access when @WebSocketServer is a Namespace (sockets is a Map)', () => {
    const socket = mockSocket('profile-1');
    const gateway = gatewayWithServer({
      sockets: new Map([['sid-1', socket]]),
    });

    gateway.addConversationToSocket('profile-1', 'conv-1');

    expect(socket.data.conversationIds?.has('conv-1')).toBe(true);
  });

  it('does not throw when the connected-sockets map has no nested .sockets', () => {
    const gateway = gatewayWithServer({
      sockets: new Map(),
    });

    expect(() =>
      gateway.addConversationToSocket('profile-1', 'conv-1'),
    ).not.toThrow();
  });

  it('still walks Server-shaped sockets.sockets maps', () => {
    const socket = mockSocket('profile-2');
    const gateway = gatewayWithServer({
      sockets: { sockets: new Map([['sid-2', socket]]) },
    });

    gateway.addConversationToSocket('profile-2', 'conv-2');

    expect(socket.data.conversationIds?.has('conv-2')).toBe(true);
  });
});
