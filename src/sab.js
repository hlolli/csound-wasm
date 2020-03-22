import {
  MAX_HARDWARE_BUFFER_SIZE,
  MAX_CHANNELS,
  initialSharedState
} from "./constants.js";

export const audioState = new SharedArrayBuffer(
  initialSharedState.length * Int32Array.BYTES_PER_ELEMENT
);

export const audioStateBuffer = new Int32Array(audioState);

// My hacky way of sending callbacks across to the
// performance worker while it's in a locked state
// audioworklet will never read or write from this buffer
export const callbackBuffer = new SharedArrayBuffer(
  1024 /* callbacks in ring buffer */ *
    1024 /* where each can be 1024 bytes length */
);

export const audioStreamIn = new SharedArrayBuffer(
  MAX_CHANNELS * MAX_HARDWARE_BUFFER_SIZE * Float32Array.BYTES_PER_ELEMENT
);

export const audioStreamOut = new SharedArrayBuffer(
  MAX_CHANNELS * MAX_HARDWARE_BUFFER_SIZE * Float32Array.BYTES_PER_ELEMENT
);
