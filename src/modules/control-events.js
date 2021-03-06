/*
   csound control-events module from <csound.h>
   https://csound.com/docs/api/modules.html
*/

import { freeStringPtr, string2ptr } from '@root/utils';

/**
 * Inputs an immediate score event
 * without any pre-process parsing
 * @callback csoundInputMessage
 * @param {Csound} csound
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundInputMessage}
 */
export const csoundInputMessage = wasm => (csound, scoEvent) => {
  const stringPtr = string2ptr(wasm, scoEvent);
  const result = wasm.exports.csoundInputMessage(csound, stringPtr);
  freeStringPtr(wasm, stringPtr);
  return result;
};

csoundInputMessage.toString = () => 'csoundInputMessage = async (csound, scoreEvent) => Number;';

/**
 * Inputs an immediate score event
 * without any pre-process parsing
 * @callback csoundInputMessageAsync
 * @param {Csound} csound
 * @return {number}
 */
/**
 * @param {Object} wasm
 * @return {csoundInputMessageAsync}
 */
export const csoundInputMessageAsync = wasm => (csound, scoEvent) => {
  const stringPtr = string2ptr(wasm, scoEvent);
  const result = wasm.exports.csoundInputMessageAsync(csound, stringPtr);
  freeStringPtr(wasm, stringPtr);
  return result;
};

csoundInputMessageAsync.toString = () =>
  'csoundInputMessageAsync = async (csound, scoreEvent) => Number;';

// csoundGetChannelPtr (CSOUND *, MYFLT **p, const char *name, int type)
// csoundListChannels (CSOUND *, controlChannelInfo_t **lst)
// csoundDeleteChannelList (CSOUND *, controlChannelInfo_t *lst)
// csoundSetControlChannelHints (CSOUND *, const char *name, controlChannelHints_t hints)
// csoundGetControlChannelHints (CSOUND *, const char *name, controlChannelHints_t *hints)
// csoundGetChannelLock (CSOUND *, const char *name)
// csoundGetControlChannel (CSOUND *csound, const char *name, int *err)
// csoundSetControlChannel (CSOUND *csound, const char *name, MYFLT val)
// csoundGetAudioChannel (CSOUND *csound, const char *name, MYFLT *samples)
// csoundSetAudioChannel (CSOUND *csound, const char *name, MYFLT *samples)
// csoundGetStringChannel (CSOUND *csound, const char *name, char *string)
// csoundSetStringChannel (CSOUND *csound, const char *name, char *string)
// csoundGetChannelDatasize (CSOUND *csound, const char *name)
// csoundSetInputChannelCallback (CSOUND *csound, channelCallback_t inputChannelCalback)
// csoundSetOutputChannelCallback (CSOUND *csound, channelCallback_t outputChannelCalback)
// csoundSetPvsChannel (CSOUND *, const PVSDATEXT *fin, const char *name)
// csoundGetPvsChannel (CSOUND *csound, PVSDATEXT *fout, const char *name)
// csoundScoreEvent (CSOUND *, char type, const MYFLT *pFields, long numFields)
// csoundScoreEventAsync (CSOUND *, char type, const MYFLT *pFields, long numFields)
// csoundScoreEventAbsolute (CSOUND *, char type, const MYFLT *pfields, long numFields, double time_ofs)
// csoundScoreEventAbsoluteAsync (CSOUND *, char type, const MYFLT *pfields, long numFields, double time_ofs)
// csoundKillInstance (CSOUND *csound, MYFLT instr, char *instrName, int mode, int allow_release)
// csoundRegisterSenseEventCallback (CSOUND *, void(*func)(CSOUND *, void *), void *userData)
// csoundKeyPress (CSOUND *, char c)
// csoundRegisterKeyboardCallback (CSOUND *, int(*func)(void *userData, void *p, unsigned int type), void *userData, unsigned int type)
// csoundRemoveKeyboardCallback (CSOUND *csound, int(*func)(void *, void *, unsigned int))
