/* eslint-disable */

import Libcsound from "./index.js";

const orcTest = `
<CsoundSynthesizer>
<CsOptions>
</CsOptions>
<CsInstruments>

sr = 44100
ksmps = 128
nchnls = 2
0dbfs = 1.0
A4 = 440

instr 1
  kfreq = mtof(69)
  printks2 "midi 69   -> %f\n", kfreq

  kmidi = ftom(442)
  printks2 "freq 442  -> %f\n", kmidi

  kmidi = ftom(442,1)
  printks2 "freq 442  -> %f rounded\n", kmidi

  kfreq = mtof(kmidi)
  printks "midi %f -> %f\n", 1, kmidi, kfreq

  imidi = ftom:i(440)
  print imidi

  ifreq = mtof:i(60)
  print ifreq

  turnoff
endin

instr 2
  imidis0[] fillarray 60, 62, 64, 69
  ifreqs0[] mtof imidis0
  printarray ifreqs0, "", "ifreqs0"

  kfreqs[] fillarray 220, 440, 880
  kmidis[] ftom kfreqs
  puts "kfreqs", 1
  printarray kmidis, 1, "%.2f", "kmidis"
  turnoff
endin

</CsInstruments>
<CsScore>
i 1 0 1
i 2 0 1
</CsScore>
</CsoundSynthesizer>
`;

const onGesture = async () => {
  console.log("ONG");
  if (window.audioCtx === null) {
    window.audioCtx = new AudioContext({
      latencyHint: "playback",
      sampleRate: 44100
    });
    const module = await audioCtx.audioWorklet.addModule(worklet);
    const audioWorker = new AudioWorkletNode(
      audioCtx,
      "csound-worklet-processor",
      { numberOfOutputs: 2 }
    );
    audioWorker.port.postMessage([
      "initializeSab",
      { audioState, audioStreamIn, audioStreamOut }
    ]);
    audioWorker.connect(audioCtx.destination);
  }
};

export default async function init() {
  const c = await Libcsound();
  // console.log(c);
  document
    .getElementById("gesture-sensor")
    .addEventListener("click", onGesture);
  const csound = await c.csoundCreate();
  await c.csoundInitialize(0);
  await c.setMessageCallback(log => {
    console.log(log);
  });
  // await c.csoundSetOption(csound, "-o/csound/nesting/test111.wav");
  await c.csoundSetOption(csound, "--0dbfs=1");
  await c.csoundSetOption(csound, "--nchnls=2");
  await c.csoundSetOption(csound, "--ksmps=1");
  await c.csoundCompileCsd(csound, orcTest);
  // let cnt = 0;
  // await c.csoundPrepareRT(csound);
  await c.csoundStart(csound);
  // const sr = await csoundWorker.csoundGetSr(csound);
  // return 0;
}

init().then(r => {});

if (module.hot) {
  module.hot.accept(["./worker.js", "./csound.worklet.js"], function() {
    console.log("Accepting the updated printMe module!");
    init().then(r => {});
  });
}
