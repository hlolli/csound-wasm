[![CircleCI](https://circleci.com/gh/hlolli/csound-wasm/tree/master.svg?style=svg)](https://circleci.com/gh/hlolli/csound-wasm/tree/master)
[![npm version](https://badge.fury.io/js/csound-wasm.svg)](https://badge.fury.io/js/csound-wasm)

# csound-wasm

# sensible defaults

By default this csound-wasm library...
- chooses multi-threading and audioAPI best suited to current environment (ex. fallbacks to older audioAPI on older browsers)
- chooses realtime performance over offline-render unless output options say otherwise (without -odac csound will write to test.wav, this behaviour has been removed).
