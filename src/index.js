import * as Comlink from 'comlink';
import { apply, curry, prop } from 'ramda';
import SharedArrayBufferMainThread from '@root/mains/sab.main';
import AudioWorkletMainThread from '@root/mains/worklet.main';
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

  const audioWorker = areWorkletsSupportet()
    ? new AudioWorkletMainThread()
    : null;

  if (!audioWorker) {
    console.error(`No detectable WebAudioAPI in current environment`);
    return {};
  }

  const worker = isSabSupported()
    ? new SharedArrayBufferMainThread(audioWorker)
    : null;

  if (worker) {
    await worker.initialize();
    csoundWasmApi = worker.api;
  } else {
    console.error(`No detectable WebAssembly support in current environment`);
    return {};
  }

  return csoundWasmApi;
}
