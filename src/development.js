/* eslint-disable */

import Libcsound from "./index.js";

const orcTest = `
<CsoundSynthesizer>
<CsOptions>
</CsOptions>
<CsInstruments>
sr = 44100
ksmps = 32
nchnls = 2
0dbfs = 1

    instr 1 ;harmonic additive synthesis
;receive general pitch and volume from the score
ibasefrq  =         cpspch(p4) ;convert pitch values to frequency
ibaseamp  =         ampdbfs(p5) ;convert dB to amplitude
;create 8 harmonic partials
aOsc1     poscil    ibaseamp, ibasefrq
aOsc2     poscil    ibaseamp/2, ibasefrq*2
aOsc3     poscil    ibaseamp/3, ibasefrq*3
aOsc4     poscil    ibaseamp/4, ibasefrq*4
aOsc5     poscil    ibaseamp/5, ibasefrq*5
aOsc6     poscil    ibaseamp/6, ibasefrq*6
aOsc7     poscil    ibaseamp/7, ibasefrq*7
aOsc8     poscil    ibaseamp/8, ibasefrq*8
;apply simple envelope
kenv      linen     1, p3/4, p3, p3/4
;add partials and write to output
aOut = aOsc1 + aOsc2 + aOsc3 + aOsc4 + aOsc5 + aOsc6 + aOsc7 + aOsc8
          outs      aOut*kenv, aOut*kenv
    endin

    instr 2 ;inharmonic additive synthesis
ibasefrq  =         cpspch(p4)
ibaseamp  =         ampdbfs(p5)
;create 8 inharmonic partials
aOsc1     poscil    ibaseamp, ibasefrq
aOsc2     poscil    ibaseamp/2, ibasefrq*1.02
aOsc3     poscil    ibaseamp/3, ibasefrq*1.1
aOsc4     poscil    ibaseamp/4, ibasefrq*1.23
aOsc5     poscil    ibaseamp/5, ibasefrq*1.26
aOsc6     poscil    ibaseamp/6, ibasefrq*1.31
aOsc7     poscil    ibaseamp/7, ibasefrq*1.39
aOsc8     poscil    ibaseamp/8, ibasefrq*1.41
kenv      linen     1, p3/4, p3, p3/4
aOut = aOsc1 + aOsc2 + aOsc3 + aOsc4 + aOsc5 + aOsc6 + aOsc7 + aOsc8
          outs aOut*kenv, aOut*kenv
    endin

</CsInstruments>
<CsScore>
;          pch       amp
i 1 0 5    8.00      -13
i 1 3 5    9.00      -17
i 1 5 8    9.02      -15
i 1 6 9    7.01      -15
i 1 7 10   6.00      -13
s
i 2 0 5    8.00      -13
i 2 3 5    9.00      -17
i 2 5 8    9.02      -15
i 2 6 9    7.01      -15
i 2 7 10   6.00      -13
</CsScore>
</CsoundSynthesizer>
;example by Andrés Cabrera
`;

const onGesture = async () => {
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
  await c.csoundSetOption(csound, "-o/csound/nesting/test111.wav");
  await c.csoundSetOption(csound, "--0dbfs=1");
  await c.csoundSetOption(csound, "--nchnls=2");
  await c.csoundSetOption(csound, "--ksmps=1");
  await c.csoundCompileCsd(csound, orcTest);
  // let cnt = 0;
  // await c.csoundPrepareRT(csound);
  c.csoundStart(csound);
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
