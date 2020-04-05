{ pkgs ? import <nixpkgs> {} }:

# with import <nixpkgs> {
#   config = { allowUnsupportedSystem = true; };
#   crossSystem = {
#     config = "wasm32-unknown-wasi";
#     libc = "wasilibc";
#     cc = (import <nixpkgs> {}).llvmPackages_10.lldClang;
#     useLLVM = true;
#   };
# };

rec {
  # wasilibc = pkgs.callPackage ./wasilibc.nix {
  #   stdenv = pkgs.stdenv;
  #   fetchFromGitHub = pkgs.fetchFromGitHub;
  #   lib = pkgs.lib;
  # };
  llvmPrefix = pkgs.llvmPackages_10;
  llvm = llvmPrefix.llvm;
  llvm_ = llvmPrefix.llvm.overrideAttrs
    (oldAttrs: {
      doCheck = false;
      checkTarget = "true";
      cmakeFlags = oldAttrs.cmakeFlags ++ [
        "-DLIBCXX_INCLUDE_TESTS:BOOL=OFF"
        "-DLLVM_INCLUDE_TESTS:BOOL=OFF"
        "-DCOMPILER_RT_INCLUDE_TESTS=OFF"
        "-DCMAKE_CROSSCOMPILING:BOOL=ON"
        "-DLLVM_TARGETS_TO_BUILD=WebAssembly"
        "-DLLVM_DEFAULT_TARGET_TRIPLE=wasm32-wasi"
        # "-DDEFAULT_SYSROOT={wasilibc}"
        "-DLLVM_TABLEGEN=${llvmPrefix.llvm}/bin/llvm-tblgen"
      ];
      patches = oldAttrs.patches ++ [
        (pkgs.fetchpatch {
          url = "https://raw.githubusercontent.com/NixOS/nixpkgs/c08d6d55dc9a899f11bff2c5d545b56577b9c949/pkgs/development/compilers/llvm/TLI-musl.patch";
          sha256 = "172s9ilkkss9fva7a0qqvsnairjc8wpq1x3dnykv8hdxzd67ps62";
        }
        )
      ];
      preConfigure = ''
        substituteInPlace unittests/Support/CMakeLists.txt \
          --replace "add_subdirectory(DynamicLibrary)" ""
        rm unittests/Support/DynamicLibrary/DynamicLibraryTest.cpp
        rm test/CodeGen/AArch64/wineh4.mir
      '';

    }
    );
  compiler-rt = llvmPrefix.libunwind.overrideAttrs
    (oldAttrs: {
      cmakeFlags = [
        # "-DCMAKE_SYSROOT={wasilibc}"
        "-DCOMPILER_RT_BAREMETAL_BUILD=On"
        "-DCOMPILER_RT_BUILD_XRAY=OFF"
        "-DCOMPILER_RT_INCLUDE_TESTS=OFF"
        "-DCOMPILER_RT_HAS_FPIC_FLAG=OFF"
        "-DCOMPILER_RT_ENABLE_IOS=OFF"
        "-DCOMPILER_RT_DEFAULT_TARGET_ONLY=On"
        "-DCOMPILER_RT_OS_DIR=wasi"
      ];

    }
    );
  # libunwind = llvmPrefix.libunwind.overrideAttrs
  #   (oldAttrs: {
  #     cmakeFlags = [
  #       "-DLIBUNWIND_SYSROOT={wasilibc}"
  #     ];
  #   }
  #   );
  libcxxabi = (llvmPrefix.libcxxabi.override {
    # inherit stdenv;
    # inherit libunwind;
    inherit llvm;
    enableShared = false;
  }
  ).overrideAttrs
    (oldAttrs: {
      # buildInputs = [ libunwind ];
      postPatch = '' '';
      cmakeFlags = [
        # "-DLIBCXX_SYSROOT={wasilibc}"
        # "-DLIBCXXABI_SYSROOT={wasilibc}"
        # "-DLIBCXXABI_TARGET_TRIPLE:BOOL=ON"
        "-DLIBCXXABI_USE_LLVM_UNWINDER=ON"
        "-DLIBCXXABI_ENABLE_PIC:BOOL=OFF"
        # "-DCMAKE_EXE_LINKER_FLAGS=-nostdlib++"
        "-DCMAKE_CROSSCOMPILING=True"
        "-DLIBCXX_HAS_MUSL_LIBC=1"
        "-DLIBCXX_HAS_MUSL_LIBC=ON"
        "-DCMAKE_VERBOSE_MAKEFILE:BOOL=ON"
        "-DCMAKE_CXX_COMPILER_WORKS=ON"
        "-DCMAKE_C_COMPILER_WORKS=ON"
        "-DLIBCXXABI_ENABLE_EXCEPTIONS:BOOL=OFF"
        "-DLIBCXXABI_ENABLE_SHARED:BOOL=OFF"
        "-DLIBCXXABI_SILENT_TERMINATE:BOOL=ON"
        "-DLIBCXXABI_ENABLE_THREADS:BOOL=OFF"
        "-DLIBCXXABI_HAS_PTHREAD_API:BOOL=OFF"
        "-DLIBCXXABI_HAS_EXTERNAL_THREAD_API:BOOL=OFF"
        "-DLIBCXXABI_BUILD_EXTERNAL_THREAD_LIBRARY:BOOL=OFF"
        "-DLIBCXXABI_HAS_WIN32_THREAD_API:BOOL=OFF"
        "-DLIBCXX_INCLUDE_TESTS:BOOL=OFF"
        "-DLLVM_INCLUDE_TESTS:BOOL=OFF"
        "-DCXX_SUPPORTS_CXX11=ON"
        "-DLLVM_COMPILER_CHECKED=ON"
        "-DUNIX:BOOL=ON"
      ];
    }
    );
  libcxx = llvmPrefix.libcxx.overrideAttrs
    (oldAttrs: rec {
      preConfigure = oldAttrs.preConfigure + ''
        substituteInPlace include/__mutex_base \
          --replace '#include <__threading_support>' ""
      '';
      postUnpack = ''
        unpackFile ${libcxxabi.src}
        export LIBCXXABI_INCLUDE_DIR="$PWD/$(ls -d libcxxabi-${llvm.version}*)/include"
      '';
      patches = [
        (pkgs.fetchpatch {
          url = "https://raw.githubusercontent.com/NixOS/nixpkgs/c08d6d55dc9a899f11bff2c5d545b56577b9c949/pkgs/development/compilers/llvm/libcxx-0001-musl-hacks.patch";
          sha256 = "19nm1gwhvlfk726ckg89km5jdcr0a2cdkm78rcnrh1wyg6j4mxma";
        }
        )
      ];
      buildInputs = [ libcxxabi ];
      nativeBuildInputs = [ pkgs.python3 pkgs.cmake ];
      cmakeFlags = [
        # "-DCMAKE_SYSROOT={wasilibc}"
        # "-DLIBCXX_SYSROOT={wasilibc}"
        # "-DLIBCXXABI_SYSROOT={wasilibc}"
        "-DLIBCXX_LIBCXXABI_LIB_PATH=${libcxxabi}/lib"
        "-DLIBCXX_LIBCPPABI_VERSION=2"
        "-DLIBCXX_CXX_ABI=libcxxabi"
        "-DLIBCXX_HAS_MUSL_LIBC=1"
        "-DLIBCXX_HAS_MUSL_LIBC=ON"
        "-DCMAKE_CXX_FLAGS='-D_LIBCPP_HAS_NO_THREADS=1'"
        "-DLIBCXX_ENABLE_THREADS=0"
        "-DLIBCXX_ENABLE_THREADS:BOOL=OFF"
        "-DLIBCXX_HAS_PTHREAD_API=0"
        "-DLIBCXX_HAS_EXTERNAL_THREAD_API=0"
        "-DLIBCXX_BUILD_EXTERNAL_THREAD_LIBRARY=0"
        "-DLIBCXX_HAS_WIN32_THREAD_API=0"
        "-DLIBCXX_ENABLE_SHARED=0"
        "-DLIBCXX_ENABLE_EXPERIMENTAL_LIBRARY=0"
        "-DLIBCXX_ENABLE_EXCEPTIONS=0"
        "-DLIBCXX_ENABLE_FILESYSTEM=0"
        "-DLIBCXX_HAS_MUSL_LIBC=1"
      ];
    }
    );
  mkExtraBuildCommands = cc: ''
    rsrc="$out/resource-root"
    mkdir "$rsrc"
    ln -s "${cc}/lib/clang/10.0.0/include" "$rsrc"
    ln -s "${compiler-rt.out}/lib" "$rsrc/lib"
    echo "-resource-dir=$rsrc" >> $out/nix-support/cc-cflags
  '';
  libcxxClang = pkgs.wrapCCWith
    rec {
      cc = llvmPrefix.tools.clang-unwrapped;
      inherit libcxx;
      extraPackages = [
        libcxx
        libcxxabi
        compiler-rt
      ];
      extraBuildCommands = ''
        echo "-fno-exceptions" >> $out/nix-support/cc-cflags
      '' + mkExtraBuildCommands cc;
    };
}
