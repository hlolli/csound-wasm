{ pkgsOrig ? import <nixpkgs> {} }:
with import <nixpkgs> {
  config = { allowUnsupportedSystem = true; };
  crossSystem = {
    config = "wasm32-unknown-wasi";
    libc = "wasilibc";
    cc = pkgsOrig.llvmPackages_10.lldClang;
    useLLVM = true;
  };
};

pkgs.clangStdenvNoLibs.mkDerivation {
  name = "linux-headers-musl-0.0.0";
  ARCH = "generic";
  src = pkgsOrig.fetchFromGitHub {
    owner = "sabotage-linux";
    repo = "kernel-headers";
    rev = "fefadd9e4e093f776cd14ee3685a80eb4ca000f4";
    sha256 = "0rxjnsfi6q0k6abzzh6qk4mk62ysycxm0a6zdwrkms7a22h0m5il";
  };
  prePatch = ''
    substituteInPlace Makefile \
      --replace 'prefix = /usr/local' \
                'prefix = ${placeholder "out"}'
  '';
}
