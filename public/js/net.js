// Thin WebSocket wrapper: JSON messages dispatched by their `t` field.
export class Net {
  constructor(handlers) {
    this.handlers = handlers;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws.onopen = () => handlers.open?.();
    this.ws.onclose = e => handlers.close?.(e);
    this.ws.onmessage = e => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      handlers[m.t]?.(m);
    };
  }

  send(msg) {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }
}
