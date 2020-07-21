with import <nixpkgs> {
  config = { allowUnsupportedSystem = true; };
  crossSystem = {
    config = "wasm32-unknown-wasi";
    libc = "wasilibc";
    cc = (import <nixpkgs> {}).llvmPackages_10.lldClang;
    useLLVM = true;
  };
};
# { pkgs }:
(pkgs.libsndfile.override { flac = null; }).overrideAttrs
  (old: {
    buildInputs = [];
    configureFlags = old.configureFlags ++ [
      "--disable-external-libs"
      "--enable-static"
      "--disable-shared"
      "--build=i686"
    ];
    installPhase = ''
      make install
    '';
  }
  )

# pkgs.stdenv.mkDerivation {
#   name = "libsndfile-wasi";
#   version = "1.0";
#   buildInputs = [ libsndfileP ];
#   installPahse = ''
#     mkdir $out/lib
#     cp ${libsndfileP}/lib/* $out/lib
#   '';
# }
