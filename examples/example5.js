const csound = require('../index.js');

const csd = `
    <CsoundSynthesizer>
      <CsOptions>
	-+rtmidi=null -M0
      </CsOptions>
      <CsInstruments>
	;Example by Andrés Cabrera

	sr = 44100
	ksmps = 32
	nchnls = 2
	0dbfs = 1

        massign   0, 1 ;assign all MIDI channels to instrument 1
	
	instr 1
	iCps    cpsmidi   ;get the frequency from the key pressed
	iAmp    ampmidi   0dbfs * 0.3 ;get the amplitude
	aOut    poscil    iAmp, iCps ;generate a sine tone
	kenv	mxadsr	0.1, 0, 1, 0.5
	aOut *= kenv
        outs      aOut, aOut ;write it to the output
	endin

      </CsInstruments>
      <CsScore>
      </CsScore>
    </CsoundSynthesizer>
`

csound.enableMidi();
csound.playCSD(csd);
