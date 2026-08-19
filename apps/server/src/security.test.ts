import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isAgentPath,
  isLoopbackAddress,
  isViewPath,
  requestIsLoopback,
  requestRemoteAddress,
} from "./security.js";

test("isLoopbackAddress accepts loopback forms only", () => {
  assert.equal(isLoopbackAddress("127.0.0.1"), true);
  assert.equal(isLoopbackAddress("::1"), true);
  assert.equal(isLoopbackAddress("::ffff:127.0.0.1"), true);
  assert.equal(isLoopbackAddress("localhost"), true);
  assert.equal(isLoopbackAddress("127.0.0.2"), true);
  assert.equal(isLoopbackAddress("192.168.10.20"), false);
  assert.equal(isLoopbackAddress("10.0.0.4"), false);
  assert.equal(isLoopbackAddress("0.0.0.0"), false);
  assert.equal(isLoopbackAddress(undefined), false);
});

test("requestIsLoopback uses the socket, not the Host header", () => {
  const remote = {
    socket: { remoteAddress: "192.168.10.20" },
    header(name: string) {
      if (name.toLowerCase() === "host") {
        return "127.0.0.1";
      }
      return undefined;
    },
  };
  assert.equal(requestRemoteAddress(remote), "192.168.10.20");
  assert.equal(requestIsLoopback(remote), false);

  const loop = {
    socket: { remoteAddress: "127.0.0.1" },
    header() {
      return "vault.lan:8787";
    },
  };
  assert.equal(requestIsLoopback(loop), true);
});

test("x-foundation-remote override is test-only", () => {
  const previous = process.env.NODE_ENV;
  const req = {
    socket: { remoteAddress: "127.0.0.1" },
    header(name: string) {
      return name.toLowerCase() === "x-foundation-remote" ? "10.0.0.8" : undefined;
    },
  };
  try {
    process.env.NODE_ENV = "test";
    assert.equal(requestRemoteAddress(req), "10.0.0.8");
    assert.equal(requestIsLoopback(req), false);
    process.env.NODE_ENV = "production";
    assert.equal(requestRemoteAddress(req), "127.0.0.1");
    assert.equal(requestIsLoopback(req), true);
  } finally {
    process.env.NODE_ENV = previous;
  }
});

test("view paths stay off-box; mcp and blobs are agent paths", () => {
  assert.equal(isViewPath("/view"), true);
  assert.equal(isViewPath("/view/api/session"), true);
  assert.equal(isViewPath("/view/blobs/11111111-1111-4111-8111-111111111111"), true);
  assert.equal(isViewPath("/mcp"), false);
  assert.equal(isViewPath("/blobs/11111111-1111-4111-8111-111111111111"), false);
  assert.equal(isAgentPath("/mcp"), true);
  assert.equal(isAgentPath("/blobs/11111111-1111-4111-8111-111111111111"), true);
  assert.equal(isAgentPath("/view/blobs/11111111-1111-4111-8111-111111111111"), false);
  assert.equal(isAgentPath("/view/api/graph"), false);
  assert.equal(isAgentPath("/health"), false);
});
