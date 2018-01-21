const csound = require('../index.js');

const csd = `
<CsoundSynthesizer>
<CsInstruments>

instr 1
aOut vco2 0.3, p4
out aOut
endin

</CsInstruments>
<CsScore>
i1 0 1 100
i1 1 1 200
i1 2 1 300
</CsScore>
</CsoundSynthesizer>`

csound.compileCSD(csd, 'example2.wav');
