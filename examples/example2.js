const csound = require('../');

const beeper = `
instr 1
  kfreq chnget "amazingChannel"
  asig = poscil:a(0.3, kfreq)
  outc asig, asig
endin`

const makeBeep = `i 1 0 10`

csound.startRealtime();
csound.compileOrc(beeper);
setInterval(()=> csound.setControlChannel('amazingChannel', Math.random()*500+50), 50)
csound.inputMessage(makeBeep);
setTimeout(() => process.exit(), 15000);
