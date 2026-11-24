export function headerNow(ms = Date.now()) {
  return { stamp: { sec: Math.floor(ms / 1000), nanosec: (ms % 1000) * 1e6 } };
}
