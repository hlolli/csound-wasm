#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <limits.h>
#include "csound.h"
#include "csoundCore.h"

#include <sys/stat.h>

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

void csoundPrepareRT(CSOUND *csound) {
  csoundSetHostImplementedAudioIO(csound, 1, 0);
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
    return done;
  } else {
    csound->kperf(csound);
    return 0;
  }
}

// DUMMY MAIN (never called, but is needed)
int main (int argc, char *argv[] ) {}

/* int sizeofCsoundParams () { */
/*   return sizeof(CSOUND_PARAMS); */
/* } */

/* // get the sizeof int */
/* int sizeofInt () { */
/*   return sizeof(int); */
/* } */
