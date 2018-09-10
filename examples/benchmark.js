const csound = require('../');

const interval = 0.500

const beeper = `
gilast init 0

instr 1
 icur times
 prints "delta: %fms\\n",  ((icur - gilast) - ${interval}) * 1000
 gilast = icur
 asig = poscil:a(0.05, 240)
 outc asig, asig
endin

event_i("e", 0, 20)
`


csound.startRealtime();
csound.compileOrc(beeper);
setInterval(() => csound.inputMessage('i 1 0 0.1'), interval * 1000);

csound.on('end', () => process.exit());
