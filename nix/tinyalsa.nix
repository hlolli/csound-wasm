{ stdenv, fetchFromGitHub, lib }:

stdenv.mkDerivation {
  name = "tinyalsa-0.0.0";
  src = fetchFromGitHub {
    owner = "tinyalsa";
    repo = "tinyalsa";
    rev = "5eff8665c28406df8ec0067ec3f4b402d53169ec";
    sha256 = "0152yak97n9q32wwcgrd9kq352sscv3m62y7wj10shwdvlggzgxg";
  };

  installPhase = ''
    ls
    exit 1
  '';
}
