#include <stdio.h>
#include <stdlib.h>
/* #include <signal.h> */
#include <string.h>
#include <unistd.h>
/* #include <limits.h> */
#include "csound.h"
#include "csoundCore.h"

#ifdef INIT_STATIC_MODULES
extern int init_static_modules(CSOUND *csound);
extern int scansyn_init_(CSOUND *csound);
extern int scansynx_init_(CSOUND *csound);
extern int emugens_init_(CSOUND *csound);
#endif

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
    return -1;
  } else {
    csound->kperf(csound);
    return 0;
  }
}

// c

// same as csoundCreate but also loads
// opcodes which need initialization to
// be callable (aka static_modules)
CSOUND *csoundCreateWasi() {
  CSOUND *csound = csoundCreate(NULL);
  init_static_modules(csound);
  scansyn_init_(csound);
  scansynx_init_(csound);
  emugens_init_(csound);
  return csound;
}

// same as csoundReset but also loads
// opcodes which need re-initialization to
// be callable (aka static_modules)
void csoundResetWasi(CSOUND *csound) {
  csoundReset(csound);
  init_static_modules(csound);
  scansyn_init_(csound);
  scansynx_init_(csound);
  emugens_init_(csound);
}


/* #if defined(CSOUND_EXE_WASM) */
/* #else */
// DUMMY MAIN (never called, but is needed)
int main (int argc, char *argv[] ) {}
/* #endif */

// HACK FIX
int __multi3(int a, int b) {
  return 0;
}

int __lttf2(long double a, long double b) {
  return 0;
}
