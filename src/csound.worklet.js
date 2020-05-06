/* eslint-disable */

// Somehow es import don't work :(
const MAX_HARDWARE_BUFFER_SIZE = 16384;
const MAX_CHANNELS = 32;

// Enum helper
export const AUDIO_STATE = {
  ATOMIC_NOFIFY: 0,
  IS_PERFORMING: 1,
  IS_PAUSED: 2,
  NCHNLS: 3,
  NCHNLS_I: 4,
  HW_BUFFER_SIZE: 5,
  SW_BUFFER_SIZE: 6,
  AVAIL_IN_BUFS: 7,
  AVAIL_OUT_BUFS: 8,
  INPUT_READ_INDEX: 9,
  OUTPUT_READ_INDEX: 10,
  INPUT_WRITE_INDEX: 11,
  OUTPUT_WRITE_INDEX: 12,
  CALLBACK_BUFFER_INDEX: 13,
  AVAIL_CALLBACKS: 14
};

const handleMessage = that => event => {
  const [type, payload] = event.data;
  switch (type) {
    case "initializeSab": {
      const { audioState, audioStreamIn, audioStreamOut } = payload;
      that["audioState"] = new Int32Array(audioState);
      const channels_i = [];
      const channels = [];
      that["audioStreamIn"] = audioStreamIn;
      that["audioStreamOut"] = audioStreamOut;
      for (let channelIndex = 0; channelIndex < MAX_CHANNELS; ++channelIndex) {
        channels_i.push(
          new Float64Array(
            audioStreamIn,
            MAX_HARDWARE_BUFFER_SIZE * channelIndex,
            MAX_HARDWARE_BUFFER_SIZE
          )
        );
        channels.push(
          new Float64Array(
            audioStreamOut,
            MAX_HARDWARE_BUFFER_SIZE * channelIndex,
            MAX_HARDWARE_BUFFER_SIZE
          )
        );
      }
      that["channels_i"] = channels_i;
      that["channels"] = channels;
      break;
    }
  }
};

class CsoundWorkletProcessor extends AudioWorkletProcessor {
  audioState = null;
  channels_i = [];
  channels = [];
  nchnls_i = 0;
  nchnls = 2;

  isPerformingLastTime = false;

  constructor(params, params2) {
    super();
    this.port.onmessage = handleMessage(this);
  }

  processOutputChannels(outputChannels, _B, _b) {
    const outputReadIndex = Atomics.load(
      this.audioState,
      AUDIO_STATE.OUTPUT_READ_INDEX
    );
    const nextReadIndex = outputReadIndex + outputChannels[0].length;

    if (nextReadIndex < _B) {
      outputChannels.forEach((channelBuffer, channelIndex) => {
        const channel = this.channels[channelIndex];
        if (!isNaN(channel[0])) {
          channelBuffer.set(channel.subarray(outputReadIndex, nextReadIndex));
        }
      });
      Atomics.add(
        this.audioState,
        AUDIO_STATE.OUTPUT_READ_INDEX,
        outputChannels[0].length
      );
    } else {
      const overflow = nextReadIndex - _B;
      outputChannels.forEach((channelBuffer, channelIndex) => {
        const channel = this.channels[channelIndex];
        const firstHalf = channel.subarray(outputReadIndex, _B);
        const secondHalf = channel.subarray(0, overflow);
        channelBuffer.set(firstHalf);
        if (overflow > 0) {
          channelBuffer.set(secondHalf, firstHalf.length);
        }
      });
      Atomics.store(this.audioState, AUDIO_STATE.OUTPUT_READ_INDEX, overflow);
    }
  }

  nullifyBuffers(inputChannels, outputChannels) {
    inputChannels.forEach(b => b.fill(0));
    outputChannels.forEach(b => b.fill(0));
  }

  process(inputs, outputs, parameters) {
    const isPerforming =
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
      this.nullifyBuffers(inputs[0], outputs[0]);
      return true;
    }

    this.isPerformingLastTime = isPerforming;
    const inputChannels = inputs[0];
    const outputChannels = outputs[0];
    // Hardware buffer size
    const _B = this.audioState[AUDIO_STATE.HW_BUFFER_SIZE];
    // Software buffer size
    const _b = this.audioState[AUDIO_STATE.SW_BUFFER_SIZE];

    if (
      this.audioState[AUDIO_STATE.AVAIL_OUT_BUFS] <=
      outputChannels[0].length * 2
    ) {
      Atomics.notify(this.audioState, AUDIO_STATE.ATOMIC_NOFITY, 1);
    }

    if (this.audioState[AUDIO_STATE.AVAIL_OUT_BUFS] > 0) {
      this.processOutputChannels(outputChannels, _B, _b);
      // subtract the available output buffers, all channels are the same length
      Atomics.sub(
        this.audioState,
        AUDIO_STATE.AVAIL_OUT_BUFS,
        outputChannels[0].length
      );
    } else {
      this.nullifyBuffers(inputChannels, outputChannels);
    }

    return true;
  }
}

registerProcessor("csound-worklet-processor", CsoundWorkletProcessor);
