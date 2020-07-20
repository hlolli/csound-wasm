export const MAX_HARDWARE_BUFFER_SIZE = 16384;
export const DEFAULT_HARDWARE_BUFFER_SIZE = 4096;
export const DEFAULT_SOFTWARE_BUFFER_SIZE = 512;
export const MAX_CHANNELS = 32;

export const initialSharedState = [
  0, // 1 = Worklet requests new buffer data (atomic notify)
  0, // 1 = Csound is currently performing
  0, // 1 = Csound is currently paused
  0, // 1 = STOP
  2, // n = nchnls
  0, // n = ncnls_i
  DEFAULT_HARDWARE_BUFFER_SIZE, // n = [hardware -B] bufferSize
  DEFAULT_SOFTWARE_BUFFER_SIZE, // n = [software -b] bufferSize
  0, // n = number of input buffers available
  0, // n = number of output buffers available
  0, // n = buffer read index of input buffer
  0, // n = buffer read index of output buffer
  0, // n = buffer write index of input buffer
  0, // n = buffer write index of output buffer
  0, // n = the read index of the callback buffer
  0, // n = amount of callbacks waiting from main thread
  44100, // sample rate
];

// Enum helper for SAB
export const AUDIO_STATE = {
  ATOMIC_NOTIFY: 0,
  IS_PERFORMING: 1,
  IS_PAUSED: 2,
  STOP: 3,
  NCHNLS: 4,
  NCHNLS_I: 5,
  HW_BUFFER_SIZE: 6,
  SW_BUFFER_SIZE: 7,
  AVAIL_IN_BUFS: 8,
  AVAIL_OUT_BUFS: 9,
  INPUT_READ_INDEX: 10,
  OUTPUT_READ_INDEX: 11,
  INPUT_WRITE_INDEX: 12,
  OUTPUT_WRITE_INDEX: 13,
  CALLBACK_BUFFER_INDEX: 14,
  AVAIL_CALLBACKS: 15,
  SAMPLE_RATE: 16,
};
