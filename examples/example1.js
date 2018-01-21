const csound = require('../index.js');

const beeper = `instr 1
                  asig = poscil:a(0.3, 440)
                  outc asig, asig
                endin`

const makeBeep = `i 1 0 1`

csound.compileOrc(beeper);
csound.readScore(makeBeep);

setTimeout(() => process.exit(), 3000);
