const csound = require('../');

const beeper = `
instr 1
  asig = poscil:a(0.3, 440)
  outc asig, asig
  prints "HÆÆ"
endin`

const makeBeep = `i 1 0 1`

csound.startRealtime()
csound.compileOrc(beeper);
csound.readScore(makeBeep);

setTimeout(() => process.exit(), 5000);
