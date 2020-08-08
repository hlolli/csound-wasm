// eslint-disable-next-line no-unused-vars
import * as Comlink from 'comlink';
import VanillaWorkerMainThread from '@root/mains/vanilla.main';
import SharedArrayBufferMainThread from '@root/mains/sab.main';
import AudioWorkletMainThread from '@root/mains/worklet.main';
import ScriptProcessorNodeMainThread from '@root/mains/old-spn.main';
import wasmDataURI from '../lib/libcsound.wasm.zlib';
import log, { logSAB, logSPN, logWorklet } from '@root/logger';
import { areWorkletsSupportet, isSabSupported, isScriptProcessorNodeSupported } from '@root/utils';
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
  const spnSupport = isScriptProcessorNodeSupported();

  if (workletSupport) {
    logWorklet(`support detected`);
  } else if (spnSupport) {
    logSPN(`support detected`);
  } else {
    log.warn(`No WebAudio Support detected`);
  }

  const audioWorker = new ScriptProcessorNodeMainThread();

  // const audioWorker = workletSupport
  //   ? new AudioWorkletMainThread()
  //   : spnSupport
  //   ? new ScriptProcessorNodeMainThread()
  //   : undefined;

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

  const worker = false // hasSABSupport
    ? new SharedArrayBufferMainThread(audioWorker, wasmDataURI)
    : new VanillaWorkerMainThread(audioWorker, wasmDataURI);

  if (worker) {
    log(`starting Csound thread initialization via WebWorker`);
    await worker.initialize();
    csoundWasmApi = worker.api;
  } else {
    log.error('No detectable WebAssembly support in current environment');
    return {};
  }

  return csoundWasmApi;
}
