import * as Comlink from 'comlink';
import { apply, curry, prop } from 'ramda';
import VanillaWorkerMainThread from '@root/mains/vanilla.main';
import SharedArrayBufferMainThread from '@root/mains/sab.main';
import AudioWorkletMainThread from '@root/mains/worklet.main';
import wasmDataURI from '../lib/libcsound.wasm.zlib';
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
    console.error('No detectable WebAudioAPI in current environment');
    return {};
  }
  console.log('PRE');
  const worker = false //isSabSupported()
    ? new SharedArrayBufferMainThread(audioWorker, wasmDataURI)
    : new VanillaWorkerMainThread(audioWorker, wasmDataURI);
  console.log('POST');
  if (worker) {
    await worker.initialize();
    csoundWasmApi = worker.api;
  } else {
    console.error('No detectable WebAssembly support in current environment');
    return {};
  }
  console.log('EXPORT API', csoundWasmApi);
  return csoundWasmApi;
}
