{ stdenv, fetchFromGitHub, lib }:

stdenv.mkDerivation {
  name = "wasilibc-20202202";
  src = fetchFromGitHub {
    owner = "WebAssembly";
    repo = "wasi-libc";
    rev = "7b92f334e69c60a1d1c5d3e289790d790b9a185b";
    sha256 = "03qjkxqys82fh27ny503pjgw4yqy85k69l7cfnv5p98fagf7l2pr";
  };
  makeFlags = [
    "WASM_CC=${stdenv.cc.targetPrefix}cc"
    "WASM_NM=${stdenv.cc.targetPrefix}nm"
    "WASM_AR=${stdenv.cc.targetPrefix}ar"
    "INSTALL_DIR=${placeholder "out"}"
  ];
  postInstall = ''
    mv $out/lib/*/* $out/lib
    ln -s $out/share/wasm32-wasi/undefined-symbols.txt $out/lib/wasi.imports
  '';

  meta = {
    description = "WASI libc implementation for WebAssembly";
    homepage = "https://wasi.dev";
    platforms = lib.platforms.wasi;
    maintainers = [ lib.maintainers.matthewbauer ];
  };
}
