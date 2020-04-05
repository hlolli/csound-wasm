{ stdenv, fetchFromGitHub, lib, cmake, git, perl, ninja, python }:

stdenv.mkDerivation {
  name = "wasi-sdk-0.0.0";
  src = fetchFromGitHub {
    owner = "WebAssembly";
    repo = "wasi-sdk";
    rev = "f754491ed2aebeeedfc017f1efeedc86a47fae83";
    sha256 = "09070wkwgnwasymccp04cyix4szfs8rd26y7kgfxgzgwrv3y1ich";
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
