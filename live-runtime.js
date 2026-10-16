// Keep at most one pending paint. State updates and command replies are immediate.
export function createRenderScheduler(paint, onError, request = globalThis.requestAnimationFrame,
                                      cancel = globalThis.cancelAnimationFrame) {
  let pending = null;
  const schedule = () => {
    if (pending !== null) return;
    pending = request(() => {
      pending = null;
      try { paint(); } catch (error) { onError(error); }
    });
  };
  schedule.cancel = () => {
    if (pending !== null) cancel(pending);
    pending = null;
  };
  return schedule;
}

// Fixed-size counters only: never retain payloads, credentials or message history.
export class LiveDiagnostics {
  constructor(now = () => performance.now(), wall = () => Date.now()) {
    this.now = now;
    this.wall = wall;
    this.started = now();
    this.lastTick = this.started;
    this.messages = 0;
    this.bytes = 0;
    this.lastReceived = null;
    this.lastStamp = null;
    this.ageAtReceive = null;
    this.minimumAge = null;
    this.receiveGap = null;
    this.renderedMessages = 0;
    this.renderMs = 0;
    this.maxRenderMs = 0;
    this.loopLagMs = 0;
    this.maxLoopLagMs = 0;
    this.renderErrors = 0;
    this.ultrasonicLeftValid = null;
    this.ultrasonicRightValid = null;
  }

  receive(data, bytes = 0) {
    const now = this.now();
    this.receiveGap = this.lastReceived === null ? null : now - this.lastReceived;
    this.lastReceived = now;
    this.messages++;
    this.bytes += bytes;
    this.ultrasonicLeftValid = typeof data?.ultrasonic_left_valid === "boolean"
      ? data.ultrasonic_left_valid : null;
    this.ultrasonicRightValid = typeof data?.ultrasonic_right_valid === "boolean"
      ? data.ultrasonic_right_valid : null;
    const stamp = data?.header?.stamp;
    this.lastStamp = Number.isFinite(stamp?.sec) && Number.isFinite(stamp?.nanosec)
      ? stamp.sec * 1000 + stamp.nanosec / 1e6 : null;
    this.ageAtReceive = this.lastStamp === null ? null : this.wall() - this.lastStamp;
    if (this.ageAtReceive !== null) {
      this.minimumAge = this.minimumAge === null ? this.ageAtReceive
        : Math.min(this.minimumAge, this.ageAtReceive);
    }
  }

  rendered(duration) {
    this.renderMs = duration;
    this.maxRenderMs = Math.max(this.maxRenderMs, duration);
    this.renderedMessages = this.messages;
  }

  tick(periodMs) {
    const now = this.now();
    this.loopLagMs = Math.max(0, now - this.lastTick - periodMs);
    this.maxLoopLagMs = Math.max(this.maxLoopLagMs, this.loopLagMs);
    this.lastTick = now;
  }

  snapshot() {
    return {
      elapsedSeconds: (this.now() - this.started) / 1000,
      dashboardMessages: this.messages,
      dashboardPayloadBytes: this.bytes,
      lastReceiveGapMs: this.receiveGap,
      sinceLastReceiveMs: this.lastReceived === null ? null : this.now() - this.lastReceived,
      snapshotAgeAtReceiveMs: this.ageAtReceive,
      addedAgeSinceBestMs: this.ageAtReceive === null ? null : this.ageAtReceive - this.minimumAge,
      messagesSinceLastPaint: this.messages - this.renderedMessages,
      lastPaintMs: this.renderMs,
      maxPaintMs: this.maxRenderMs,
      lastEventLoopLagMs: this.loopLagMs,
      maxEventLoopLagMs: this.maxLoopLagMs,
      renderErrors: this.renderErrors,
      ultrasonicLeftValid: this.ultrasonicLeftValid,
      ultrasonicRightValid: this.ultrasonicRightValid,
    };
  }
}
