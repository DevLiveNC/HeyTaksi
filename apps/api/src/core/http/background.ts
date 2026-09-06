import { isVercelRuntime } from '../../config/runtime.js';

/**
 * Keep work running after the HTTP response on Fluid Compute (`waitUntil`).
 * Locally the promise is still scheduled; it does not delay the handler.
 */
export function runInBackground(task: Promise<unknown>) {
  if (!isVercelRuntime()) {
    void task;
    return;
  }
  void import('@vercel/functions')
    .then(({ waitUntil }) => waitUntil(task))
    .catch(() => {
      void task;
    });
}
