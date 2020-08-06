// eslint-disable-next-line no-unused-vars
import * as Comlink from 'comlink';
import VanillaWorkerMainThread from '@root/mains/vanilla.main';
import SharedArrayBufferMainThread from '@root/mains/sab.main';
import AudioWorkletMainThread from '@root/mains/worklet.main';
import wasmDataURI from '../lib/libcsound.wasm.zlib';
import log, { logSAB, logWorklet } from '@root/logger';
import { areWorkletsSupportet, isSabSupported } from '@root/utils';
export { Csound };
export default Csound;

/**
 * The default entry for libcsound es7 module
 * @async
 * @return {Promise.<Object>}
 */
async function Csound() {
  var csoundWasmApi;

  const workletSupport = areWorkletsSupportet();
  if (workletSupport) {
    logWorklet(`support detected`);
  } else {
    log.warn(`No AudioWorklet support, falling back to deprecated ScriptProcessor`);
  }

  const audioWorker = workletSupport && new AudioWorkletMainThread();

  if (!audioWorker) {
    log.error('No detectable WebAudioAPI in current environment');
    return {};
  }

  const hasSABSupport = isSabSupported();
  if (!hasSABSupport) {
    log.warn(`SharedArrayBuffers not found, falling back to Vanilla concurrency`);
  } else {
    logSAB(`using SharedArrayBuffers`);
  }
  const worker = hasSABSupport
    ? new SharedArrayBufferMainThread(audioWorker, wasmDataURI)
    : new VanillaWorkerMainThread(audioWorker, wasmDataURI);

  if (worker) {
    if (!hasSABSupport) {
      log(`starting Csound thread initialization via WebWorker`);
    } else {
      logSAB(`starting Csound thread initialization via WebWorker`);
    }
    await worker.initialize();
    csoundWasmApi = worker.api;
  } else {
    log.error('No detectable WebAssembly support in current environment');
    return {};
  }

  return csoundWasmApi;
}
