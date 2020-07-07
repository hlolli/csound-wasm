export const handleCsoundStart = (
  workerMessagePort,
  libraryCsound,
  createRealtimeAudioThread
) => args => {
  const { csound } = args;
  // account for slash csound in wasi-memfs system
  libraryCsound.csoundAppendEnv(csound, 'SFDIR', '/csound');
  const startError = libraryCsound.csoundStart(csound);
  if (startError !== 0) {
    workerMessagePort.post(
      `error: csoundStart failed while trying to render ${outputName},` +
        ' look out for errors in options and syntax'
    );
    return startError;
  }

  const outputName = libraryCsound.csoundGetOutputName(csound) || 'test.wav';
  const isExpectingRealtimeOutput = outputName.includes('dac');

  if (isExpectingRealtimeOutput) {
    createRealtimeAudioThread(args);
  }
};
