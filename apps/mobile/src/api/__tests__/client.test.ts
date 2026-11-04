import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { request } from '../client';
import { z } from 'zod';

class MockXMLHttpRequest {
  public method = 'GET';
  public url = '';
  public timeout = 0;
  public headers: Record<string, string> = {};
  public status = 200;
  public statusText = 'OK';
  public responseText = JSON.stringify({ success: true, data: { ok: true } });
  public response = JSON.stringify({ success: true, data: { ok: true } });
  public onload: (() => void) | null = null;
  public onerror: ((e: any) => void) | null = null;
  public ontimeout: (() => void) | null = null;
  public onabort: (() => void) | null = null;

  public open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  public setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }

  public getAllResponseHeaders() {
    return 'Content-Type: application/json\r\n';
  }

  public send(_body?: any) {
    // In tests, can be triggered manually or simulated
  }

  public abort = vi.fn(() => {
    if (this.onabort) this.onabort();
  });
}

const Schema = z.object({ ok: z.boolean() });

describe('ApiClient XHR Abort & Lifecycle Management', () => {
  const originalXHR = (global as any).XMLHttpRequest;
  let currentXhr: MockXMLHttpRequest;

  beforeEach(() => {
    currentXhr = new MockXMLHttpRequest();
    (global as any).XMLHttpRequest = vi.fn(() => currentXhr);
  });

  afterEach(() => {
    (global as any).XMLHttpRequest = originalXHR;
  });

  it('aborts immediately before send if signal is already aborted without calling xhr.send', async () => {
    const controller = new AbortController();
    controller.abort();

    const form = new FormData();
    const sendSpy = vi.spyOn(currentXhr, 'send');

    await expect(
      request(Schema, '/upload', {
        method: 'POST',
        body: form,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      code: 'ABORTED',
    });

    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('aborts cleanly during upload when signal fires, cleans up handlers, and does not retry', async () => {
    const controller = new AbortController();
    const form = new FormData();

    let sendCalled = false;
    currentXhr.send = () => {
      sendCalled = true;
      // Simulate signal aborting during upload
      controller.abort();
    };

    const reqPromise = request(Schema, '/upload', {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });

    await expect(reqPromise).rejects.toMatchObject({
      code: 'ABORTED',
    });

    expect(sendCalled).toBe(true);
    expect(currentXhr.abort).toHaveBeenCalled();
    // Handlers cleaned up
    expect(currentXhr.onload).toBeNull();
    expect(currentXhr.onerror).toBeNull();
    expect(currentXhr.ontimeout).toBeNull();
    expect(currentXhr.onabort).toBeNull();
  });

  it('cleans up handlers and does not reject or throw if signal aborts after response is received', async () => {
    const controller = new AbortController();
    const form = new FormData();

    currentXhr.send = () => {
      // Simulate synchronous response
      if (currentXhr.onload) currentXhr.onload();
    };

    const res = await request(Schema, '/upload', {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });

    expect(res.ok).toBe(true);
    // Handlers cleaned up on success
    expect(currentXhr.onload).toBeNull();
    expect(currentXhr.onerror).toBeNull();

    // Aborting AFTER response has been processed does not crash or throw
    expect(() => controller.abort()).not.toThrow();
  });

  it('handles XHR timeout cleanly with proper network timeout error and cleans up handlers', async () => {
    const form = new FormData();

    currentXhr.send = () => {
      if (currentXhr.ontimeout) currentXhr.ontimeout();
    };

    await expect(
      request(Schema, '/upload', {
        method: 'POST',
        body: form,
        timeoutMs: 100,
        anonymous: true,
      }),
    ).rejects.toMatchObject({
      code: 'NETWORK_TIMEOUT',
    });

    expect(currentXhr.onload).toBeNull();
    expect(currentXhr.onerror).toBeNull();
    expect(currentXhr.ontimeout).toBeNull();
  });
});
