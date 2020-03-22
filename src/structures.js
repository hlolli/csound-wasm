export const CSOUND_PARAMS = [
  /* debug mode, 0 or 1 */
  ["debug_mode", "int"],
  /* number of frames in in/out buffers */
  ["buffer_frames", "int"],
  /* number of frames in in/out hardware buffers */
  ["hardware_buffer_frames", "int"],
  /* graph displays, 0 or 1 */
  ["displays", "int"],
  /* use ASCII graphs, 0 or 1 */
  ["ascii_graphs", "int"],
  /* use postscript graphs, 0 or 1 */
  ["postscript_graphs", "int"],
  /* message printout control */
  ["message_level", "int"],
  /* tempo (sets Beatmode)  */
  ["tempo", "int"],
  /* bell, 0 or 1 */
  ["ring_bell", "int"],
  /* use cscore for processing */
  ["use_cscore", "int"],
  /* terminate performance at the end */
  ["terminate_on_midi", "int"],
  /* print heart beat, 0 or 1 */
  ["heartbeat", "int"],
  /* defer GEN01 load, 0 or 1 */
  ["defer_gen01_load", "int"],
  /* pfield to map midi key no */
  ["midi_key", "int"],
  /* pfield to map midi key no as cps */
  ["midi_key_cps", "int"],
  /* pfield to map midi key no as oct */
  ["midi_key_oct", "int"],
  /* pfield to map midi key no as pch */
  ["midi_key_pch", "int"],
  /* pfield to map midi velocity */
  ["midi_velocity", "int"],
  /* pfield to map midi velocity as amplitude */
  ["midi_velocity_amp", "int"],
  /* disable relative paths from files, 0 or 1 */
  ["no_default_paths", "int"],
  /* number of threads for multicore performance */
  ["number_of_threads", "int"],
  /* do not compile, only check syntax */
  ["syntax_check_only", "int"],
  /* csd line error reporting */
  ["csd_line_counts", "int"],
  /* deprecated, kept for backwards comp.  */
  ["compute_weights", "int"],
  /* use realtime priority mode, 0 or 1 */
  ["realtime_mode", "int"],
  /* use sample-level score event accuracy */
  ["sample_accurate", "int"],
  /* overriding sample rate */
  ["sample_rate_override", "MYFLT"],
  /* overriding control rate */
  ["control_rate_override", "MYFLT"],
  /* overriding number of out channels */
  ["nchnls_override", "int"],
  /* overriding number of in channels */
  ["nchnls_i_override", "int"],
  /* overriding 0dbfs */
  ["e0dbfs_override", "MYFLT"],
  /* daemon mode */
  ["daemon", "int"],
  /* ksmps override */
  ["ksmps_override", "int"],
  /* fft_lib */
  ["FFT_library", "int"]
];
