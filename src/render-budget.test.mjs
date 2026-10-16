import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderBudget } from './render-budget.js';

function harness(options = {}, gl = null) {
  let now = 0;
  const changes = [];
  const renderer = { getContext: () => gl ?? { getExtension: () => null } };
  const budget = createRenderBudget(renderer, {
    width: 1280, height: 720, devicePixelRatio: 2,
    ...options,
    onScale: (ratio, previous) => changes.push({ ratio, previous, at: now }),
  });
  return {
    budget, changes,
    frames(duration, interval = 1000 / 60, cpu = 3) {
      const until = now + duration;
      while (now < until) {
        now += interval;
        budget.begin(now);
        budget.end(now + cpu);
      }
    },
    gap(duration) { now += duration; },
  };
}

test('starts at a bounded density without resizing the renderer', () => {
  const desktop = harness();
  const small = harness({ width: 390 });
  const lowDpr = harness({ devicePixelRatio: 1 });
  assert.equal(desktop.budget.ratio, 1.35);
  assert.equal(small.budget.ratio, 1.1);
  assert.equal(lowDpr.budget.ratio, 1);
  assert.equal(desktop.changes.length, 0);
});

test('stable 60fps does not oscillate or lower density', () => {
  const run = harness();
  run.frames(12000);
  assert.equal(run.budget.ratio, 1.35);
  assert.deepEqual(run.changes, []);
  assert.ok(Math.abs(run.budget.stats.frameMs - 1000 / 60) < .1);
});

test('mild sustained slow rendering lowers density in bounded, spaced small steps', () => {
  const run = harness();
  run.frames(30000, 23, 4);
  assert.equal(run.budget.ratio, .8);
  assert.ok(run.changes.length >= 5);
  assert.equal(run.changes[0].ratio, 1.3);
  for (let index = 1; index < run.changes.length; index++) {
    assert.ok(run.changes[index].at - run.changes[index - 1].at >= 4000);
  }
  const count = run.changes.length;
  run.frames(10000, 23, 4);
  assert.equal(run.changes.length, count);
});

test('severe sustained frame pressure gets a faster proportional drop within the 25% limit', () => {
  const run = harness();
  run.frames(3500, 40, 4);
  assert.equal(run.changes.length, 1);
  assert.equal(run.budget.ratio, 1.1);
  assert.ok(run.changes[0].ratio >= run.changes[0].previous * .75);
  run.frames(8000, 40, 4);
  assert.equal(run.budget.ratio, .8);
  for (let index = 1; index < run.changes.length; index++) {
    assert.ok(run.changes[index].at - run.changes[index - 1].at >= 4000);
    assert.ok(run.changes[index].ratio >= run.changes[index].previous * .75);
  }
});

test('a tab-switch gap and a one-off long frame do not reduce density', () => {
  const run = harness();
  run.frames(4000);
  run.gap(3000);
  run.frames(1, 16.667, 200);
  run.frames(4000);
  run.frames(1, 60, 30);
  run.frames(3000);
  assert.equal(run.budget.ratio, 1.35);
  assert.deepEqual(run.changes, []);
});

test('density recovers cautiously after a long stable streak', () => {
  const run = harness();
  run.frames(6000, 33.333, 4);
  const low = run.budget.ratio;
  run.frames(6000);
  assert.equal(run.budget.ratio, low);
  run.frames(75000);
  assert.ok(run.budget.ratio > low);
  assert.ok(run.budget.ratio <= 1.5);
  const raises = run.changes.filter(change => change.ratio > change.previous);
  assert.ok(raises.length >= 2);
  for (let index = 1; index < raises.length; index++) {
    assert.ok(raises[index].at - raises[index - 1].at >= 20000);
  }
});

test('resize clamps mobile maximum once and repeated identical sizes do nothing', () => {
  const run = harness();
  run.budget.resize(390, 844, 2);
  assert.equal(run.budget.ratio, 1.25);
  assert.equal(run.changes.length, 1);
  run.budget.resize(390, 844, 2);
  assert.equal(run.changes.length, 1);
  run.frames(5000);
  assert.equal(run.changes.length, 1);
});

test('4K and 5K initial drawing buffers stay within the absolute desktop pixel budget', () => {
  for (const [width, height] of [[3840, 2160], [5120, 2880], [3840, 2140]]) {
    const run = harness({ width, height });
    assert.ok(width * height * run.budget.ratio ** 2 <= 4000000 + .0001);
    assert.ok(run.budget.ratio < .8);
    assert.equal(run.changes.length, 0);
    const initial = run.budget.ratio;
    // A capped density below the usual minimum keeps a relative adaptive range.
    run.frames(35000, 33.333, 4);
    assert.ok(width * height * run.budget.ratio ** 2 <= 4000000 + .0001);
    assert.ok(run.budget.ratio < initial);
    assert.ok(run.budget.ratio >= initial * .75);
  }
});

test('severe load on a 4K viewport adapts below its allocation cap and stops at its relative floor', () => {
  const run = harness({ width: 3840, height: 2160 });
  const initial = run.budget.ratio;
  run.frames(3500, 40, 4);
  assert.ok(run.budget.ratio < initial);
  assert.ok(run.budget.ratio >= initial * .75);
  run.frames(30000, 40, 4);
  assert.equal(run.budget.ratio, initial * .75);
  for (const change of run.changes) {
    assert.ok(change.ratio <= initial);
    assert.ok(change.ratio >= initial * .75);
    assert.ok(change.ratio >= change.previous * .75);
  }
  const count = run.changes.length;
  run.frames(10000, 40, 4);
  assert.equal(run.changes.length, count);
});

test('a huge resize applies its cap once and preserves the cap through recovery', () => {
  const run = harness();
  run.budget.resize(5120, 2880, 2);
  assert.equal(run.changes.length, 1);
  assert.ok(5120 * 2880 * run.budget.ratio ** 2 <= 4000000 + .0001);
  run.budget.resize(5120, 2880, 2);
  run.frames(40000);
  assert.equal(run.changes.length, 1);
});

test('a very tall small viewport stays within the absolute mobile pixel budget', () => {
  const run = harness({ width: 600, height: 2400 });
  assert.ok(600 * 2400 * run.budget.ratio ** 2 <= 1000000 + .0001);
  run.frames(40000);
  assert.ok(600 * 2400 * run.budget.ratio ** 2 <= 1000000 + .0001);
});

test('a limited GPU never allocates a drawing buffer beyond its supported texture dimensions', () => {
  let changes = 0;
  const budget = createRenderBudget({
    getContext: () => ({ getExtension: () => null }),
    capabilities: { maxTextureSize: 256 },
  }, { width: 1280, height: 720, devicePixelRatio: 2, onScale: () => changes++ });
  assert.equal(budget.ratio, .2);
  assert.ok(Math.max(1280, 720) * budget.ratio <= 256);
  budget.resize(5120, 2880, 2);
  assert.equal(budget.ratio, .05);
  assert.ok(Math.max(5120, 2880) * budget.ratio <= 256);
  budget.resize(5120, 2880, 2);
  assert.equal(changes, 1);
  for (let now = 40; now < 20000; now += 40) {
    budget.begin(now);
    budget.end(now + 4);
  }
  assert.equal(budget.ratio, .05 * .75);
});

function fakeGpu() {
  const extension = { TIME_ELAPSED_EXT: 10, GPU_DISJOINT_EXT: 11 };
  let active;
  let release = false;
  let disjoint = false;
  let gpuDuration = 24;
  let resultReads = 0;
  const deleted = [];
  return {
    QUERY_RESULT_AVAILABLE: 12,
    QUERY_RESULT: 13,
    getExtension: () => extension,
    getParameter: () => disjoint,
    createQuery: () => ({}),
    beginQuery: (_target, query) => { active = query; },
    endQuery: () => { active.duration = gpuDuration * 1e6; active = null; },
    getQueryParameter: (query, key) => {
      if (key === 12) return release;
      assert.equal(release, true, 'must not request a result before it is available');
      resultReads++;
      return query.duration;
    },
    deleteQuery: query => deleted.push(query),
    release: () => { release = true; },
    disjoint: value => { disjoint = value; },
    duration: value => { gpuDuration = value; },
    get resultReads() { return resultReads; },
    deleted,
  };
}

test('GPU timings remain asynchronous and catch GPU pressure at otherwise stable 60fps', () => {
  const gl = fakeGpu();
  const run = harness({}, gl);
  run.frames(200);
  assert.equal(gl.resultReads, 0);
  gl.release();
  run.frames(6000);
  assert.ok(gl.resultReads > 0);
  assert.ok(run.budget.ratio < 1.35);
  assert.ok(run.budget.stats.gpuMs > 20);
  run.budget.dispose();
  assert.ok(gl.deleted.length > 0);
  const ratio = run.budget.ratio;
  run.frames(5000, 33.333);
  assert.equal(run.budget.ratio, ratio);
});

test('severe measured GPU pressure gets the bounded proportional drop without waiting for missed frames', () => {
  const gl = fakeGpu();
  gl.duration(40);
  gl.release();
  const run = harness({}, gl);
  run.frames(3500);
  assert.equal(run.changes.length, 1);
  assert.equal(run.budget.ratio, 1.1);
  assert.ok(run.changes[0].ratio >= run.changes[0].previous * .75);
});

test('a fast GPU on a 30hz display does not trigger unnecessary density reduction', () => {
  const gl = fakeGpu();
  gl.duration(5);
  gl.release();
  const run = harness({}, gl);
  run.frames(12000, 33.333, 3);
  assert.equal(run.budget.ratio, 1.35);
  assert.deepEqual(run.changes, []);
});

test('disjoint GPU timestamps are discarded rather than counted as slow work', () => {
  const gl = fakeGpu();
  const run = harness({}, gl);
  run.frames(200);
  gl.disjoint(true);
  run.frames(2000);
  assert.equal(gl.resultReads, 0);
  assert.equal(run.budget.ratio, 1.35);
  gl.disjoint(false);
  gl.duration(5);
  gl.release();
  run.frames(5000);
  assert.equal(run.budget.ratio, 1.35);
});

test('hidden frames and resume do not poison adaptation', () => {
  const previous = globalThis.document;
  globalThis.document = { hidden: false };
  try {
    const run = harness();
    run.frames(3000);
    globalThis.document.hidden = true;
    run.frames(20000, 1000, 100);
    globalThis.document.hidden = false;
    run.frames(3000);
    assert.equal(run.budget.ratio, 1.35);
    assert.deepEqual(run.changes, []);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
