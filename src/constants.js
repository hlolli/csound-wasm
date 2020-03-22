export const MAX_HARDWARE_BUFFER_SIZE = 16384;
// const MAX_SOFTWARE_BUFFER_SIZE = 8192;
export const DEFAULT_HARDWARE_BUFFER_SIZE = 4096;
export const DEFAULT_SOFTWARE_BUFFER_SIZE = 1024;
export const MAX_CHANNELS = 32;
// const DEFAULT_SR = 44100;

export const initialSharedState = [
  0, // 1 = Worklet requests new buffer data (atomic notify)
  0, // 1 = Csound is currently performing
  0, // 1 = Csound is currently paused
  2, // n = nchnls
  0, // n = ncnls_i
  DEFAULT_HARDWARE_BUFFER_SIZE, // n = [hardware -B] bufferSize
  DEFAULT_SOFTWARE_BUFFER_SIZE, // n = [software -b] bufferSize
  0, // n = number of input buffers available
  0, // n = number of output buffers available
  0, // n = buffer read index of input buffer
  0, // n = buffer read index of output buffer
  0, // n = buffer write index of input buffer
  0 // n = buffer write index of output buffer
];

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
  OUTPUT_WRITE_INDEX: 12
};
