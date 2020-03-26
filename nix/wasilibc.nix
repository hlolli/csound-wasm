{ stdenv, fetchFromGitHub, lib }:

stdenv.mkDerivation {
  name = "wasilibc-20202202";
  src = fetchFromGitHub {
    owner = "WebAssembly";
    repo = "wasi-libc";
    rev = "41af0db30f459241d081f1a8bc232102ed9cfbde";
    sha256 = "1wkwazdqrp39p5m79cnvhsigazsgqa0zdliga2cicbr3w9ssp7di";
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
