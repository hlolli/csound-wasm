{ stdenv, fetchFromGitHub, fetchgit, lib, cmake, git, perl, ninja, python }:

let wasilibc = fetchFromGitHub {
  owner = "WebAssembly";
  repo = "wasi-libc";
  rev = "00cc5944dfc8c85ab5c5bee4cdef221afa2121f7";
  sha256 = "1i41lmgpdp00pn5r5ddd2hzmk0dv0l2pzbc4b84nrsiwp605m10r";
};

llvm-project = fetchFromGitHub {
  owner = "llvm";
  repo = "llvm-project";
  rev = "d32170dbd5b0d54436537b6b75beaf44324e0c28";
  sha256 = "1mhr0yhbz5w5mv4gk3jpcz12d3k2mvm6qi276fx4bw21q3vs2z4q";
};

config = fetchgit {
  url = "https://git.savannah.gnu.org/git/config.git";
  rev = "2593751ef276497e312d7c4ce7fd049614c7bf80";
  sha256 = "1sh410ncfs9fwxw03m1r4lcm10iv305g0jb2bb2yvgzlpb28lsz9";
};

in stdenv.mkDerivation {
  name = "wasi-sdk-0.0.0";
  src = fetchFromGitHub {
    owner = "WebAssembly";
    repo = "wasi-sdk";
    rev = "ceabbfe181599bca83d81e087a229797e472c09c";
    sha256 = "17c2wzxhb5gvvm1cr11wfjvhl9ryclix3cn43ab2yx1p9x03p370";
    fetchSubmodules = false;
  };

  dontUseCmakeConfigure = true;
  dontUseNinjaBuild = true;
  dontUseNinjaInstall = true;
  PREFIX = "${placeholder "out"}";
  postPatch = ''
    rm -rf src/*
    cp -rf ${wasilibc} src/wasi-libc
    cp -rf ${llvm-project} src/llvm-project
    cp -rf ${config} src/config
    chmod -R +rw src/
  '';
  buildInputs = [ cmake git perl ninja python ];
  installPhase = "true";
}
