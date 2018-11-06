[![CircleCI](https://circleci.com/gh/hlolli/csound-wasm/tree/master.svg?style=svg)](https://circleci.com/gh/hlolli/csound-wasm/tree/master)
[![npm version](https://badge.fury.io/js/csound-wasm.svg)](https://badge.fury.io/js/csound-wasm)

# csound-wasm
Simplified API for Csound's Webassembly.

* Single browser bundle
* Automatic startup and initialization
* Easy integration to node.js

# Dependencies

- nodejs9x
- python2.7 (node-gyp)
- libasound2-dev/alsa-lib-dev (linux only)

_These dependencies are build dependencies and are only required for nodejs._

# Useage

## Node.js
##### Install

```js
npm install csound-wasm --save
```

or if you want to select audio backend (makes only sense on Linux).

```js
npm install csound-wasm --save --mpg123-backend=BACKEND
// or
node-gyp rebuild --mpg123-backend=BACKEND
```

where *BACKEND* can be one of

```
alsa, coreaudio, openal, win32, pulse, jack
```

Csound-wasm is dependent on the module [Speaker](https://github.com/TooTallNate/node-speaker). This module is not compatable with all audio modules, and can be buggy on Windows if installed within a unix-shell. MacOsX and Linux should work fine with CoreAudio and Alsa respectively.
##### Quick start
```js
const csound = require('csound-wasm');

const beeper = `
instr 1
  asig = poscil:a(0.3, 440)
  outc asig, asig
endin`

const makeBeep = `i 1 0 1`

csound.startRealtime()
csound.compileOrc(beeper);
csound.readScore(makeBeep);

setTimeout(() => process.exit(), 5000);
```

## Browser
Download the latest `csound-wasm-browser.js` under [releases](https://github.com/hlolli/csound-wasm/releases) and bundle it next to your html file. 
```html
<script src="csound-wasm-browser.js"></script>
```
Or alternatively (preferably for development) refer directly to the gihub releases within the html, like so.
```html
<script src="https://github.com/hlolli/csound-wasm/releases/download/6.12.0-2/csound-wasm-browser.js"></script>
```
This file is minified via Google Closure Compiler and is intended to be used as is. If you're useing Webpack or Gulp, then add this file as a vendor resource.

Alternatively for browsers, require the file directly into your project
```js
require('csound-wasm/release/browser/csound-wasm-browser.js');
```

##### Quick start
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
  </head>
  <body>
    <h5>Click Start realtime once, gotta love chrome's new autoplay ban policy</h5>
    <button id="start">Start realtime</button>
    <button id="beeper">Make beep!</button>
    <script src="https://s3.amazonaws.com/hlolli/csound-wasm/6.12.0-2/csound-wasm-worklet-processor.js" />
  <script>
    const beeper = `
    instr 1
    asig = poscil:a(0.3, 440)
    outc asig, asig
    endin
    `
    document.getElementById('start').onclick = () => {
        csound.startRealtime();
        csound.compileOrc(beeper);
    };

    document.getElementById('beeper').onclick = () => {
        csound.inputMessage('i 1 0 1');
    }
  </script>
</body>
</html>
```

Bear in mind that you can only start realtime csound in two ways, with `csound.startRealtime()` or `csound.playCSD`, but don't call both of them at the same time, as each subsequent call will restart csound. `csound.playCSD` is good to use when you wan to evaluate some boilerplate before grabbing for other runtime functions like `csound.inputMessage` or `csound.compileOrc`, as well as just playing whole CSD files out your speakers. `csound.startRealtime()` is ideal when you want to start csound as a "blank sheet" and create instruments (`csound.compileOrc`, or `csound.evalCode`) or play notes (`csound.inputMessage` or `csound.readScore`) "on the fly".

## AudioWorklet

Audioworklet is new browser technology enableing higher quality lower latency audio. It is enabled by default if it was detected in your browser. *NOTICE* that AudioWorklet always needs to fetch a processor script, that lives in a secure environment and can only be fetched from servers useing `https`. If the fetch of the AudioWorklet processor script fails, then `csound-wasm` will fallback to the older WebAudio technology. Read the console logs to see if your csound instance is running on AudioWorklet or the old WebAudio (AudioContext).

If you wish to host the needed AudioWorklet processor script yourself, you'll need to set an endpoint variable onto the window object *before* calling csound-wasm.js. Note that the endpoint default to github releases until a longer term solution is found.

```html
<script>window["csound_worklet_processor_url"] = "./csound-wasm-worklet-processor.js"</script>
<script src="./csound-wasm-browser.js"></script>
```

# API
Many these functions are a direct implementation of the [Csound API](http://csound.com/docs/api/index.html). Some are `csound-wasm` specific.


## Voids (without return values)

| Public Function |  Parameters  |Description |
| ----------------|-------------| -----------|
| csound.startRealtime(config*)| config::Object default: { nchnls: 2, zerodbfs: 1, sr: 44100, ksmps: 256, buffer: 2048 }  | starts/initializes realtime as oppsed to rendering to file|
|csound.compileOrc(orc)| orc::String | Compiles any orchestra code at k-rate without return value.|
|csound.renderToFile(csd, file) | csd::String, file::String| Renders CSD string, filepath for the file output, currently only supported on node|
|csound.evalCode(orc)|orc::String| like compileOrc but returns status number on i-rate (0 if successful)|
|csound.inputMessage(sco)|sco::String | sends (score) event(s) without pre-processing, use \n to seperate multiscore statements|
|csound.readScore(sco)| sco::String |like inputMessage but tries to pre-process the before emitting the event|
|csound.setControlChannel
|csound.setStringChannel
|csound.playCSD
|csound.reset
|csound.destroy
|csound.setOption
|csound.compileCSD
|csound.setTable
|csound.enableMidi
|csound.pushMidi
|csound.compileOrc
|csound.evalCode
|csound.inputMessage
|csound.readScore

## Functions that return javascript promises

| Public Function |  Parameters  |Description |
| ----------------|-------------| -----------|
|csound.getControlChannel
|csound.getTable
|csound.getTableLength
|csound.getKsmps
|csound.get0dbfs
|csound.getScoreTime

All data is passed to resolve, ie. you need to chain
`.then((returnValue) => ..callback..)`

## Events

Subscribe to events with

```js
csound.on( EVENT, callback);
```

Where `EVENT` can be of following

| Event Name  |  callback parameter |
| ------------|---------------------|
| "log" | (msg) => |
| "ready" | () => |
| "start" | () => |
| "end" | () => |
| "perform" / "performKsmps" | () => |

Many events can be subscribed of same type.

To unsubscribe an event

```js
csound.removeListener( EVENT )
```

not that this will remove ALL events of type EVENT (and only of type EVENT).
