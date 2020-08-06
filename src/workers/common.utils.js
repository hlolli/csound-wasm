export const handleCsoundStart = (
  workerMessagePort,
  libraryCsound,
  createRealtimeAudioThread,
  logINFO
) => arguments_ => {
  const { csound } = arguments_;

  // account for slash csound in wasi-memfs system
  // libraryCsound.csoundAppendEnv(csound, 'SFDIR', '/csound');
  const startError = libraryCsound.csoundStart(csound);
  const outputName = libraryCsound.csoundGetOutputName(csound) || 'test.wav';
  logINFO(`handleCsoundStart: actual csoundStart result ${startError}, outputName: ${outputName}`);
  if (startError !== 0) {
    workerMessagePort.post(
      `error: csoundStart failed while trying to render ${outputName},` +
        ' look out for errors in options and syntax'
    );
    return startError;
  }

  const isRequestingRtMidiInput = libraryCsound._isRequestingRtMidiInput(csound);
  const isExpectingRealtimeOutput = isRequestingRtMidiInput || outputName.includes('dac');

  if (isExpectingRealtimeOutput) {
    createRealtimeAudioThread(arguments_);
  } else {
    // Do rendering
    workerMessagePort.broadcastPlayState('renderStarted');
    while (libraryCsound.csoundPerformKsmps(csound) === 0) {}
    workerMessagePort.broadcastPlayState('renderEnded');
  }
};

export const instantiateAudioPacket = (numberChannels, numberFrames) => {
  const channels = [];
  for (let chn = 0; chn < numberChannels; chn++) {
    channels.push(new Float64Array(numberFrames));
  }
  return channels;
};
