const csound = require('../');

const csd = `
<CsoundSynthesizer>
<CsInstruments>

instr 1
aOut1 vco2 0.3, p4
aOut2 vco2 0.3, p4*1.1
outs aOut1, aOut2
endin

</CsInstruments>
<CsScore>
i1 0 1 100
i1 1 1 200
i1 2 1 300
</CsScore>
</CsoundSynthesizer>
`

csound.playCSD(csd, {ksmps: 1});
setTimeout(() => process.exit(), 10000);
