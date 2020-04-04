{ pkgs ? import <nixpkgs> {}, dev ? false }:
let
  L = pkgs.callPackage ./libcsound_objects.nix {};
  clangCustom = import ./clangCustom.nix { pkgsOrig = pkgs; };
in
pkgs.mkShell
  {
    buildInputs = [ L.csoundP ];
    shellHook = ''
      rm -rf lib
      mkdir -p lib
      cp ${L.csoundP}/lib/libcsound.wasm lib
      cp ${L.csoundP}/lib/csound_exe.wasm lib
      # make a compressed version for the browser bundle
      ${pkgs.zopfli}/bin/zopfli --zlib -c \
        ${L.csoundP}/lib/libcsound.wasm > lib/libcsound.wasm.zlib
      chmod 0600 lib/*.wasm
      ${if dev then "" else "exit 0"}
    '';
  }
