/**
 * Where the render rig decides a preview frame is ready, and the world it asks in.
 *
 * Every wait here is `frame.evaluate`, which needs only the frame's own main execution context.
 * Playwright's `waitForSelector` and `waitForFunction` need its injected script as well, and
 * `waitForSelector` needs that script in the utility world -- an isolated world Chromium creates per
 * document through a command whose failure is swallowed and whose creation event is dropped for a
 * frame the driver considers stale. With `timeout: 0` a world that never arrives is a wait that
 * never ends, which is what three cases did on CI's Chrome while an evaluate in the same frame
 * reported the marker already present. The diagnosis prints a bounded probe of that world now, so
 * the next run measures it rather than inferring it.
 *
 * The frame is resolved again on every attempt rather than bound once, so a document committed after
 * a wait began is the one the predicate runs in.
 */

const POLL_MS = 25
const EVALUATE_MS = 1000

/** The mounted preview frame, or null before one exists. */
export function previewFrame(page) {
  return page.frames().find((one) => one !== page.mainFrame()) ?? null
}

const abandonAfter = (ms) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms)
    timer.unref?.()
  })

/**
 * Polls `predicate` inside the preview frame until it holds or the case ends.
 *
 * Returns rather than throws when the signal aborts: `untilAborted` has already printed the reading
 * by then, and a rejection raised after vitest has given up has nobody left to catch it.
 */
export async function pollFrameUntil(page, predicate, signal) {
  while (!signal?.aborted) {
    const frame = previewFrame(page)
    // An evaluate carries no timeout of its own and waits on the frame's main context, so one that
    // never answers is abandoned here rather than outliving the frame it was asked of.
    const met = frame
      ? await Promise.race([
          frame.evaluate(predicate).catch(() => false),
          abandonAfter(EVALUATE_MS)
        ])
      : false
    if (met) {
      return
    }
    await abandonAfter(POLL_MS)
  }
}
