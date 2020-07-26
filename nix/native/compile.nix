{ pkgs ? import <nixpkgs> {}, dev ? false }:
let
  L = pkgs.callPackage ./libcsound_objects.nix {};

in pkgs.runCommand "csound-native-wasm" {} ''
  mkdir $out
  cp ${L.csoundP}/lib/libcsound.wasm $out
  # cp ${L.csoundP}/lib/csound_exe.wasm $out
  # make a compressed version for the browser bundle
  ${pkgs.zopfli}/bin/zopfli --zlib -c \
    ${L.csoundP}/lib/libcsound.wasm > $out/libcsound.wasm.zlib
''
