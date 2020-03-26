#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <limits.h>
#include "csound.h"
#include "csoundCore.h"
#include "Opcodes/emugens/emugens_common.h"
#include "Opcodes/scansyn.h"

// returns the address of a string
// pointer which is writable from js
char* allocStringMem (int length) {
  char *ptr = NULL;
  ptr = malloc((length * sizeof(char)) + 1);
  return ptr;
}

// free the allocated String Memory
// (this could be unneccecary, dont know)
void freeStringMem (char* ptr) {
  free(ptr);
}

CSOUND_PARAMS* allocCsoundParams() {
  CSOUND_PARAMS* ptr = NULL;
  ptr = malloc(sizeof(CSOUND_PARAMS));
  return ptr;
}

void freeCsoundParams(CSOUND_PARAMS* ptr) {
  free(ptr);
}

int csoundStartWasi(CSOUND *csound) {
  const char* outputDev = csoundGetOutputName(csound);
  // detect realtime mode automatically
  if (strcmp("dac", outputDev) == 0) {
    csoundSetHostImplementedAudioIO(csound, 1, 0);
  }
  return csoundStart(csound);
}


extern int sensevents(CSOUND *);

// The built-in performKsmps has mutex and setjmp
// which we don't have in wasi based wasm
int csoundPerformKsmpsWasi(CSOUND *csound)
{
  int done;
  if (UNLIKELY(!(csound->engineStatus & CS_STATE_COMP))) {
    csound->Warning(csound,
                    Str("Csound not ready for performance: csoundStart() "
                        "has not been called\n"));
    return CSOUND_ERROR;
  }
  done = sensevents(csound);
  if (done || csound->performState == -1) {
    csoundMessage(csound, Str("Score finished in csoundPerformKsmps() with %d.\n"), done);
    return done;
  } else {
    csound->kperf(csound);
    return 0;
  }
}

// c
/* extern int32_t emugens_init_(CSOUND *); */
/* extern int32_t scansyn_init_(CSOUND *); */
/* extern int32_t scansynx_init_(CSOUND *); */
// c++
/* extern int csoundModuleCreate_signalflowgraph(CSOUND *); */
/* extern int csoundModuleInit_signalflowgraph(CSOUND* ); */
/* extern int csoundModuleInit_ampmidid(CSOUND* csound); */

/* void _wasi_init_csound_modules(CSOUND *csound) { */
/*   emugens_init_(csound); */
/*   scansyn_init_(csound); */
/*   scansynx_init_(csound); */
/*   /\* csoundModuleCreate_signalflowgraph(csound); *\/ */
/*   csoundModuleInit_signalflowgraph(csound); */
/*   csoundModuleInit_ampmidid(csound); */
/* } */

// same as csoundCreate but also loads
// opcodes which need initialization to
// be callable (aka static_modules)
CSOUND *csoundCreateWasi() {
  CSOUND *csound = csoundCreate(NULL);
  /* _wasi_init_csound_modules(csound); */
  return csound;
}

// same as csoundReset but also loads
// opcodes which need re-initialization to
// be callable (aka static_modules)
void csoundResetWasi(CSOUND *csound) {
  csoundReset(csound);
  /* _wasi_init_csound_modules(csound); */
}


#if defined(CSOUND_EXE_WASM)
// csound.exe main entry
int main (int argc, const char **argv ) {
  CSOUND *csound = csoundCreateWasi(NULL);
  csoundCompileArgs(csound, argc, argv);
}
#else
// DUMMY MAIN (never called, but is needed)
int main (int argc, char *argv[] ) {}
#endif
