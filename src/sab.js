import {
  MAX_HARDWARE_BUFFER_SIZE,
  MAX_CHANNELS,
  initialSharedState
} from "./constants.js";

export const audioState = new SharedArrayBuffer(
  initialSharedState.length * Int32Array.BYTES_PER_ELEMENT
);

export const audioStateBuffer = new Int32Array(audioState);

// initialSharedState.forEach((val, index) => {
//   audioStateBuffer[index] = val;
// });

export const audioStreamIn = new SharedArrayBuffer(
  MAX_CHANNELS * MAX_HARDWARE_BUFFER_SIZE * Float32Array.BYTES_PER_ELEMENT
);

export const audioStreamOut = new SharedArrayBuffer(
  MAX_CHANNELS * MAX_HARDWARE_BUFFER_SIZE * Float32Array.BYTES_PER_ELEMENT
);