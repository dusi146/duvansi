const TARGET_MS = 1000 / 60;
const WINDOW_MS = 1500;
const WARMUP_MS = 1000;
const LOWER_COOLDOWN_MS = 4000;
const RAISE_COOLDOWN_MS = 20000;
const GOOD_STREAK_MS = 14000;
const MAX_PENDING_QUERIES = 4;

const clock = () => globalThis.performance?.now?.() ?? Date.now();
const hidden = () => typeof document !== 'undefined' && document.hidden;
const rounded = value => Math.round(value * 100) / 100;

function limits(width, height, dpr, maxTextureSize) {
  const small = width <= 600;
  const deviceRatio = Math.max(.1, Number.isFinite(dpr) ? dpr : 1);
  const pixels = Math.max(1, Number.isFinite(width) ? width : 1)
    * Math.max(1, Number.isFinite(height) ? height : 1);
  // Bound the full-resolution/MSAA allocation before the first rendered frame,
  // even on a 4K/5K monitor where device DPR alone cannot express its cost.
  const pixelCap = Math.sqrt((small ? 1000000 : 4000000) / pixels);
  const textureCap = maxTextureSize / Math.max(1, width, height);
  const max = Math.min(deviceRatio, small ? 1.25 : 1.5, pixelCap, textureCap);
  return { min: max <= .8 ? max * .75 : .8, max, initial: Math.min(max, small ? 1.1 : 1.35) };
}

/**
 * Adjusts pixel density only; every scene, material and interaction keeps running.
 * begin/end bracket a rendered frame. onScale owns drawing-buffer/target resizing.
 * Timer queries are polled asynchronously, never with a GPU wait or a gl.finish().
 */
export function createRenderBudget(renderer, {
  width = 1,
  height = 1,
  devicePixelRatio = 1,
  onScale = () => {},
} = {}) {
  const supportedTextureSize = renderer.capabilities?.maxTextureSize;
  const maxTextureSize = Number.isFinite(supportedTextureSize) && supportedTextureSize > 0
    ? supportedTextureSize : Infinity;
  let caps = limits(width, height, devicePixelRatio, maxTextureSize);
  let ratio = caps.initial;
  let disposed = false;
  let gl;
  let timer;
  try {
    gl = renderer.getContext();
    timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!gl.createQuery || !gl.getQueryParameter) timer = null;
  } catch { timer = null; }

  // Fixed buffers avoid allocations and sorting in the animation loop.
  const frameTimes = new Float64Array(256);
  const frameDurations = new Float32Array(256);
  const cpuDurations = new Float32Array(256);
  const gpuTimes = new Float64Array(64);
  const gpuDurations = new Float32Array(64);
  let frameCount = 0;
  let gpuCount = 0;
  let frameIndex = 0;
  let gpuIndex = 0;
  let lastBegin = null;
  let frameStart = null;
  let frameInterval = 0;
  let warmupUntil = null;
  let lastEvaluation = -Infinity;
  let lastChange = -Infinity;
  let slowSince = null;
  let goodSince = null;
  let suspended = false;
  let queryFrame = 0;
  let activeQuery = null;
  const pending = [];
  const spare = [];
  let cpuMs = null;
  let frameMs = null;
  let gpuMs = null;

  function deleteQuery(query) {
    try { gl.deleteQuery(query); } catch { /* Context loss also releases queries. */ }
  }

  function clearQueries() {
    if (activeQuery) {
      try { gl.endQuery(timer.TIME_ELAPSED_EXT); } catch { /* A lost context has no active query. */ }
      deleteQuery(activeQuery);
      activeQuery = null;
    }
    pending.forEach(item => deleteQuery(item.query));
    spare.forEach(deleteQuery);
    pending.length = 0;
    spare.length = 0;
  }

  function clearTiming() {
    frameCount = 0;
    gpuCount = 0;
    frameIndex = 0;
    gpuIndex = 0;
    lastBegin = null;
    frameStart = null;
    warmupUntil = null;
    lastEvaluation = -Infinity;
    slowSince = null;
    goodSince = null;
    cpuMs = null;
    frameMs = null;
    gpuMs = null;
  }

  function reset() {
    clearQueries();
    clearTiming();
  }

  function changeScale(next, now) {
    next = Math.min(caps.max, Math.max(caps.min, caps.max < .1 ? next : rounded(next)));
    if (Math.abs(next - ratio) < Math.min(.005, caps.max * .01)) return;
    const previous = ratio;
    ratio = next;
    lastChange = now;
    // Reallocation and shader warmup must not be mistaken for slow steady rendering.
    reset();
    onScale(ratio, previous);
  }

  function pollQueries(now) {
    if (!timer || !pending.length) return;
    try {
      if (gl.getParameter(timer.GPU_DISJOINT_EXT)) {
        // GPU timestamps spanning a clock reset are invalid, even if available.
        reset();
        return;
      }
      for (let count = 0; count < MAX_PENDING_QUERIES && pending.length; count++) {
        const item = pending[0];
        if (!gl.getQueryParameter(item.query, gl.QUERY_RESULT_AVAILABLE)) break;
        // RESULT is read only after AVAILABLE, so this cannot wait for GPU work.
        const duration = gl.getQueryParameter(item.query, gl.QUERY_RESULT) / 1e6;
        pending.shift();
        spare.push(item.query);
        if (duration > 0 && duration < 100 && now - item.at <= WINDOW_MS) {
          gpuMs = gpuMs === null ? duration : gpuMs + (duration - gpuMs) * .15;
          if (warmupUntil !== null && item.at >= warmupUntil) {
            gpuTimes[gpuIndex] = item.at;
            gpuDurations[gpuIndex] = duration;
            gpuIndex = (gpuIndex + 1) % gpuTimes.length;
            gpuCount = Math.min(gpuCount + 1, gpuTimes.length);
          }
        }
      }
    } catch {
      // Unsupported/lost timer facilities fall back to frame and CPU timings.
      clearQueries();
      timer = null;
    }
  }

  function evaluate(now) {
    if (now < warmupUntil || now - lastEvaluation < 250) return;
    lastEvaluation = now;
    let count = 0, sumCpu = 0, sumFrame = 0, slowFrames = 0;
    let oldest = now;
    for (let index = 0; index < frameCount; index++) {
      const at = frameTimes[index];
      if (at < now - WINDOW_MS) continue;
      count++;
      oldest = Math.min(oldest, at);
      sumCpu += cpuDurations[index];
      sumFrame += frameDurations[index];
      if (frameDurations[index] > TARGET_MS * 1.22) slowFrames++;
    }
    if (count < 12 || now - oldest < 800) return;
    let measuredGpu = 0, sumGpu = 0;
    for (let index = 0; index < gpuCount; index++) {
      if (gpuTimes[index] < now - WINDOW_MS) continue;
      measuredGpu++;
      sumGpu += gpuDurations[index];
    }
    const averageCpu = sumCpu / count;
    const averageFrame = sumFrame / count;
    const averageGpu = measuredGpu >= 5 ? sumGpu / measuredGpu : null;
    const frameOverBudget = averageFrame > TARGET_MS * 1.22 && slowFrames / count > .3;
    // A low-refresh display should keep its detail when measured GPU work fits.
    const slow = averageGpu !== null
      ? averageGpu > TARGET_MS * 1.03 || (frameOverBudget && averageCpu > TARGET_MS * .86)
      : frameOverBudget || averageCpu > TARGET_MS * .86;
    const good = averageFrame < TARGET_MS * 1.07 && slowFrames / count < .05
      && averageCpu < TARGET_MS * .6 && (averageGpu === null || averageGpu < TARGET_MS * .66);
    if (slow) {
      goodSince = null;
      slowSince ??= now;
      if (now - slowSince >= 750 && now - lastChange >= LOWER_COOLDOWN_MS) {
        const pressure = Math.max(averageGpu ?? 0, frameOverBudget ? averageFrame : 0);
        let next = Math.floor((ratio - .001) * 10) / 10;
        if (pressure > TARGET_MS * 1.5) {
          // Pixel cost grows with density squared. React to a sustained large
          // overrun in one bounded step, retaining the same warmup/cooldown.
          const proportional = ratio * Math.sqrt(TARGET_MS * .94 / pressure);
          const bounded = Math.max(ratio * .75, proportional);
          // Round upward so quantization never exceeds the 25% step limit.
          next = Math.ceil((bounded - .00001) * 10) / 10;
          // Extremely low hardware caps can be smaller than a tenth-step.
          if (next >= ratio) next = Math.max(bounded, ratio * .9);
        }
        changeScale(next, now);
      }
    } else {
      slowSince = null;
      if (good) {
        goodSince ??= now;
        if (now - goodSince >= GOOD_STREAK_MS && now - lastChange >= RAISE_COOLDOWN_MS) {
          changeScale(Math.floor((ratio + .1001) * 10) / 10, now);
        }
      } else goodSince = null;
    }
  }

  function begin(now = clock()) {
    if (disposed) return;
    if (hidden()) {
      if (!suspended) reset();
      suspended = true;
      return;
    }
    if (suspended) { reset(); suspended = false; }
    if (lastBegin !== null && (now - lastBegin > 100 || now < lastBegin)) reset();
    pollQueries(now);
    warmupUntil ??= now + WARMUP_MS;
    frameInterval = lastBegin === null ? 0 : now - lastBegin;
    lastBegin = now;
    frameStart = now;
    if (timer && !activeQuery && (++queryFrame % 4 === 0) && pending.length < MAX_PENDING_QUERIES) {
      try {
        activeQuery = spare.pop() || gl.createQuery();
        if (activeQuery) gl.beginQuery(timer.TIME_ELAPSED_EXT, activeQuery);
      } catch {
        clearQueries();
        timer = null;
      }
    }
  }

  function end(now = clock()) {
    if (disposed || frameStart === null) return;
    const cpu = now - frameStart;
    if (activeQuery) {
      try {
        gl.endQuery(timer.TIME_ELAPSED_EXT);
        pending.push({ query: activeQuery, at: frameStart });
        activeQuery = null;
      } catch {
        clearQueries();
        timer = null;
      }
    }
    frameStart = null;
    if (cpu < 0 || cpu > 100) { reset(); return; }
    cpuMs = cpuMs === null ? cpu : cpuMs + (cpu - cpuMs) * .08;
    if (frameInterval > 0) {
      frameMs = frameMs === null ? frameInterval : frameMs + (frameInterval - frameMs) * .08;
    }
    if (now >= warmupUntil && frameInterval > 0) {
      frameTimes[frameIndex] = now;
      frameDurations[frameIndex] = frameInterval;
      cpuDurations[frameIndex] = cpu;
      frameIndex = (frameIndex + 1) % frameTimes.length;
      frameCount = Math.min(frameCount + 1, frameTimes.length);
      evaluate(now);
    }
  }

  function resize(nextWidth, nextHeight, nextDpr = devicePixelRatio) {
    if (disposed) return;
    if (nextWidth === width && nextHeight === height && nextDpr === devicePixelRatio) return;
    width = nextWidth;
    height = nextHeight;
    devicePixelRatio = nextDpr;
    caps = limits(width, height, devicePixelRatio, maxTextureSize);
    reset();
    const clamped = Math.max(caps.min, Math.min(caps.max, ratio));
    if (clamped !== ratio) {
      const previous = ratio;
      ratio = clamped;
      onScale(ratio, previous);
    }
  }

  return {
    begin, end, resize, reset,
    get ratio() { return ratio; },
    get stats() { return { gpuMs, cpuMs, frameMs, samples: frameCount, timerQueries: Boolean(timer) }; },
    dispose() {
      if (disposed) return;
      reset();
      disposed = true;
    },
  };
}
