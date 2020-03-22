{ pkgs }:
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
