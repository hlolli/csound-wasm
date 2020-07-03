export const onWorkerMessageEvent = async event => {
  const data = event.data || {};
  if (typeof data === 'object') {
    switch (data.type) {
      case 'returnValue': {
        const promiseReturn = mainThreadCallbackQueue[queueId];
        if (
          typeof promiseReturn === 'object' &&
          typeof promiseReturn.resolve === 'function'
        ) {
          promiseReturn.resolve(data.returnValue);
        }
      }

      case 'log': {
        if (typeof messageCallback === 'function') {
          messageCallback(data.data);
        }

        return;
      }

      case 'playStateChange': {
        if (typeof csoundPlayStateChangeCallback === 'function') {
          csoundPlayStateChangeCallback(data.data);
        }

        // starting csound is 2 step process
        // because of atomic wait, we need to trigger
        // all webaudio stuff from event
        if (data.data === 'realtimePerformanceStarted') {
          hackyCsnd && startWebAudio(hackyCsnd);
        }
      }

      default: {

      }
    }
  }
};
