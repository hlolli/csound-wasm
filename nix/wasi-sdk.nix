{ stdenv, fetchFromGitHub, lib, cmake, git, perl, ninja, python }:

stdenv.mkDerivation {
  name = "wasi-sdk-0.0.0";
  src = fetchFromGitHub {
    owner = "WebAssembly";
    repo = "wasi-sdk";
    rev = "ceabbfe181599bca83d81e087a229797e472c09c";
    sha256 = "17c2wzxhb5gvvm1cr11wfjvhl9ryclix3cn43ab2yx1p9x03p370";
    fetchSubmodules = true;
  };

  dontUseCmakeConfigure = true;
  dontUseNinjaBuild = true;
  dontUseNinjaInstall = true;
  PREFIX = "${placeholder "out"}";
  postPatch = ''
    echo 'echo "0.0.0"' > version.sh
  '';
  buildInputs = [ cmake git perl ninja python ];
  installPhase = "true";
}
