/* SPDX-License-Identifier: Apache-2.0
 * RESENTMENT OS - the in-browser model, off the main thread.
 *
 * WebLLM runs the model on WebGPU inside this worker so the desktop keeps
 * drawing while weights load and tokens decode. This is the only file in
 * the desktop that loads code from a CDN, and it is only ever loaded when
 * the user picks "In your browser" as the provider.
 */
import { WebWorkerMLCEngineHandler } from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.84/+esm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);
