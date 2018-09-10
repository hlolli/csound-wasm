const csound = require('../');

const beeper = `
instr 1
  asig = poscil:a(0.1, 440)
  outc asig, asig
endin

event_i("e", 0, 3)
`

const makeBeep = `i 1 0 2`

csound.startRealtime();
csound.compileOrc(beeper);
csound.readScore(makeBeep);
csound.on('end', () => {console.log("END"); process.exit(0);});

