import * as Comlink from 'comlink';
import { api as API } from '@root/libcsound';
import VanillaWorker from '@root/workers/vanilla.worker';
import { MAX_CHANNELS, MAX_HARDWARE_BUFFER_SIZE } from '@root/constants.js';

import {
  messageEventHandler,
  mainMessagePortAudio,
  mainMessagePort,
  workerMessagePort
} from '@root/mains/messages.main';

class VanillaWorkerMainThread {
  constructor(audioWorker, wasmDataURI) {
    this.audioStreamIn = new Float64Array(
      MAX_CHANNELS * MAX_HARDWARE_BUFFER_SIZE * Float64Array.BYTES_PER_ELEMENT
    );
    this.audioStreamOut = new Float64Array(
      MAX_CHANNELS * MAX_HARDWARE_BUFFER_SIZE * Float64Array.BYTES_PER_ELEMENT
    );

    this.wasmDataURI = wasmDataURI;
    this.api = {};
  }

  async initialize() {
    console.log('INIT');
    const csoundWorker = new Worker(VanillaWorker());
    const audioStreamIn = this.audioStreamIn;
    const audioStreamOut = this.audioStreamOut;
    mainMessagePort.onmessage = messageEventHandler(this);
    mainMessagePortAudio.onmessage = messageEventHandler(this);
    csoundWorker.postMessage({ msg: 'initMessagePort' }, [workerMessagePort]);
    workerMessagePort.start();
    console.log('PROXYPRE');
    const proxyPort = Comlink.wrap(csoundWorker);
    await proxyPort.initialize(this.wasmDataURI);
    console.log('PROXYPOST');

    for (const apiK of Object.keys(API)) {
      const reference = API[apiK];
      async function callback(...arguments_) {
        return await proxyPort.callUncloned(apiK, arguments_);
      }

      switch (apiK) {
        case 'csoundStart': {
          const csoundStart = async function(csound) {
            if (!csound || typeof csound !== 'number') {
              console.error(
                'csoundStart expects first parameter to be instance of Csound'
              );
              return -1;
            }

            await callback({
              audioStreamIn,
              audioStreamOut,
              csound
            });
          };

          csoundStart.toString = () => reference.toString();
          this.api.csoundStart = csoundStart.bind(this);
          break;
        }

        default: {
          callback.toString = () => reference.toString();
          this.api[apiK] = callback;
          break;
        }
      }
    }
  }
}

export default VanillaWorkerMainThread;
