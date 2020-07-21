with (import <nixpkgs> {});
with builtins;
pkgs.mkYarnPackage rec {
  name = "csound-wasm";
  # shellHook = pkgs.yarn2nix-moretea.linkNodeModulesHook;
  src = ../..;
  packageJSON = "${src}/package.json";
  yarnLock = "${src}/yarn.lock";
  yarnNix = "${src}/yarn.nix";
  buildPhase = "npx rollup -c";
  installPhase = ''
    mkdir -p $out
    cp deps/csound-wasm/dist/libcsound.mjs $out
    cp deps/csound-wasm/dist/libcsound.mjs.map $out
  '';
  distPhase = "true";
}
