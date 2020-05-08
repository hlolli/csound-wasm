/* eslint-disable */

const handleMessage = that => event => {
  const [type, payload] = event.data;
  switch (type) {
    case "initializeSab": {
      const { audioState, audioStreamIn, audioStreamOut } = payload;
      that["audioState"] = new Int32Array(audioState);
      that["channels"] = [];
      that["channels_i"] = [];
      that["audioStreamIn"] = audioStreamIn;
      that["audioStreamOut"] = audioStreamOut;
      for (let channelIndex = 0; channelIndex < MAX_CHANNELS; ++channelIndex) {
        that["channels_i"].push(
          new Float64Array(
            audioStreamIn,
            MAX_HARDWARE_BUFFER_SIZE * channelIndex,
            MAX_HARDWARE_BUFFER_SIZE
          )
        );
        that["channels"].push(
          new Float64Array(
            audioStreamOut,
            MAX_HARDWARE_BUFFER_SIZE * channelIndex,
            MAX_HARDWARE_BUFFER_SIZE
          )
        );
      }
      that["nchnls_i"] = Atomics.load(that["audioState"], AUDIO_STATE.NCHNLS_I);
      that["nchnls"] = Atomics.load(that["audioState"], AUDIO_STATE.NCHNLS);
      break;
    }
  }
};

class CsoundWorkletProcessor extends AudioWorkletProcessor {
  constructor(params, params2) {
    super();
    this.audioState = null;
    this.channels_i = [];
    this.channels = [];
    this._b = DEFAULT_SOFTWARE_BUFFER_SIZE;
    this._B = DEFAULT_HARDWARE_BUFFER_SIZE;
    this.nchnls_i = 0;
    this.nchnls = 2;
    this.isPerformingLastTime = false;
    this.preProcessCount = 0;
    this.port.onmessage = handleMessage(this);
  }

  // given that "render quantum" is 128 samples
  // we expect the buffer to be a multiple of 128
  // and we don't need to account for misalignments
  processOutputChannels(outputChannels) {
    const outputReadIndex = this.audioState[AUDIO_STATE.OUTPUT_READ_INDEX];
    const nextReadIndex =
      (outputReadIndex + outputChannels[0].length) % this._B;
    outputChannels.forEach((channelBuffer, channelIndex) => {
      channelBuffer.set(
        this.channels[channelIndex].subarray(
          outputReadIndex,
          nextReadIndex < outputReadIndex ? this._B : nextReadIndex
        )
      );
    });
    Atomics.store(
      this.audioState,
      AUDIO_STATE.OUTPUT_READ_INDEX,
      nextReadIndex
    );
  }

  process(inputs, outputs, parameters) {
    const isPerforming =
      this.audioState &&
      Atomics.load(this.audioState, AUDIO_STATE.IS_PERFORMING) === 1;

    if (
      !this.audioState ||
      Atomics.load(this.audioState, AUDIO_STATE.IS_PAUSED) === 1 ||
      !isPerforming
    ) {
      if (!isPerforming && this.isPerformingLastTime) {
        // Not sure if this is working, but it seems to
        // at minimum unblock the atomic wait in the while loop
        // by giving it another number than 0, in turn, returning
        // "not-equal" instead of "ok"
        Atomics.store(this.audioState, AUDIO_STATE.ATOMIC_NOFITY, 666);
        Atomics.notify(this.audioState, AUDIO_STATE.ATOMIC_NOFITY);
      }
      this.isPerformingLastTime = isPerforming;
      return true;
    }

    this.isPerformingLastTimew = isPerforming;

    const inputChannels = inputs[0];
    const outputChannels = outputs[0];

    if (
      this.audioState[AUDIO_STATE.AVAIL_OUT_BUFS] <= this._b // outputChannels[0].length * 4
    ) {
      Atomics.notify(this.audioState, AUDIO_STATE.ATOMIC_NOFITY, 1);
    }

    const readIndex = this.audioState[AUDIO_STATE.OUTPUT_READ_INDEX];

    const nextReadIndex = (readIndex + outputChannels[0].length) % this._B;

    outputChannels.forEach((channelBuffer, channelIndex) => {
      channelBuffer.set(
        this.channels[channelIndex].subarray(
          readIndex,
          nextReadIndex < readIndex ? this._B : nextReadIndex
        )
      );
    });

    if (this.nchnls_i > 0) {
      this.channels_i[0].set(inputChannels[0], readIndex);
    }
    // inputChannels.forEach((channelBuffer, channelIndex) => {
    //   this.channels_i[channelIndex this.nchnls_i].set(channelBuffer, readIndex);
    // });

    Atomics.store(
      this.audioState,
      AUDIO_STATE.OUTPUT_READ_INDEX,
      nextReadIndex
    );

    // this.processOutputChannels(outputChannels);
    // subtract the available output buffers, all channels are the same length
    Atomics.sub(
      this.audioState,
      AUDIO_STATE.AVAIL_OUT_BUFS,
      outputChannels[0].length
    );

    // if (this.audioState[AUDIO_STATE.AVAIL_OUT_BUFS] > 0) {
    // } else {
    //   console.log("Buffer underrun");
    // }

    return true;
  }
}

registerProcessor("csound-worklet-processor", CsoundWorkletProcessor);
