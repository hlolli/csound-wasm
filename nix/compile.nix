with import <nixpkgs> {
  # overlays = [ overlay ];
  config = { allowUnsupportedSystem = true; };
  # clang = (import <nixpkgs> {}).llvmPackages_10.clang;
  crossSystem = {
    config = "wasm32-unknown-wasi";
    libc = "wasilibc";
    cc = (import <nixpkgs> {}).llvmPackages_10.lldClang;
    useLLVM = true;
  };
};
pkgs.callPackage
  (
    { mkShell }:
    let
      exports = with builtins; (fromJSON (readFile ./exports.json));
      pkgsOrig = import <nixpkgs> {};
      patchClock = pkgsOrig.writeTextFile {
        name = "patchClock";
        executable = true;
        destination = "/bin/patchClock";
        text = ''
          #!${pkgsOrig.nodejs}/bin/node
          const myArgs = process.argv.slice(2);
          const myFile = myArgs[0];
          const fs = require('fs')
          fs.readFile(myFile, 'utf8', function (err,data) {
            if (err) { return console.log(err); }
            const regex = "\\/\\* find out CPU frequency based on.*" +
                          "initialise a timer structure \\*\\/";
            const replace = `static int getTimeResolution(void) { return 0; }
            int gettimeofday (struct timeval *__restrict, void *__restrict);
            static inline int_least64_t get_real_time(void) {
              struct timeval tv;
              gettimeofday(&tv, NULL);
              return ((int_least64_t) tv.tv_usec
                + (int_least64_t) ((uint32_t) tv.tv_sec * (uint64_t) 1000000));}
            clock_t clock (void);
            static inline int_least64_t get_CPU_time(void) {
              return ((int_least64_t) ((uint32_t) clock()));
            }`;
            const result = data.replace(new RegExp(regex, 'is'), replace);
            fs.writeFile(myFile, result, 'utf8', function (err) {
              if (err) return console.log(err);
            });
          });
        '';
      };

      patchGetCWD = pkgsOrig.writeTextFile {
        name = "patchGetCWD";
        executable = true;
        destination = "/bin/patchGetCWD";
        text = ''
          #!${pkgsOrig.nodejs}/bin/node

          const myArgs = process.argv.slice(2);
          const myFile = myArgs[0];
          const fs = require('fs')
          fs.readFile(myFile, 'utf8', function (err,data) {
            if (err) { return console.log(err); }
            const regex = "static int32_t getcurdir.*" +
                          "#ifndef MAXLINE";
            const result = data.replace(new RegExp(regex, 'is'),
             `
             static int32_t getcurdir(CSOUND *csound, GETCWD *p) {
               p->Scd->size = 2;
               p->Scd->data = "/";
               return OK;
             }
             #ifndef MAXLINE`);
            fs.writeFile(myFile, result, 'utf8', function (err) {
              if (err) return console.log(err);
            });
            });
        '';
      };

      libsndfileP = import ./sndfileWasi.nix {
        inherit pkgs;
      };
      wasilibc = pkgs.callPackage ./wasilibc.nix {
        stdenv = pkgs.stdenv;
        fetchFromGitHub = pkgs.fetchFromGitHub;
        lib = pkgs.lib;
      };
      llvmPrefix = pkgsOrig.llvmPackages_10;
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
            "-DDEFAULT_SYSROOT=${wasilibc}"
            "-DLLVM_TABLEGEN=${llvmPrefix.llvm}/bin/llvm-tblgen"
          ];
          patches = oldAttrs.patches ++ [
            (pkgsOrig.fetchpatch {
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
            "-DCMAKE_SYSROOT=${wasilibc}"
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
      libunwind = llvmPrefix.libunwind.overrideAttrs
        (oldAttrs: {
          cmakeFlags = [
            "-DLIBUNWIND_SYSROOT=${wasilibc}"
          ];

        }
        );
      libcxxabi = (llvmPrefix.libcxxabi.override {
        inherit stdenv;
        inherit libunwind;
        inherit llvm;
        enableShared = false;
      }
      ).overrideAttrs
        (oldAttrs: {
          buildInputs = [ libunwind ];
          postPatch = '' '';
          cmakeFlags = [
            "-DLIBCXX_SYSROOT=${wasilibc}"
            "-DLIBCXXABI_SYSROOT=${wasilibc}"
            "-DLIBCXXABI_TARGET_TRIPLE:BOOL=ON"
            "-DLIBCXXABI_USE_LLVM_UNWINDER=ON"
            "-DLIBCXXABI_ENABLE_PIC:BOOL=OFF"
            "-DCMAKE_EXE_LINKER_FLAGS=-nostdlib++"
            "-DCMAKE_CROSSCOMPILING=True"
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
      libcxx = pkgs.llvmPackages_10.libcxx.overrideAttrs
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
            (pkgsOrig.fetchpatch {
              url = "https://raw.githubusercontent.com/NixOS/nixpkgs/c08d6d55dc9a899f11bff2c5d545b56577b9c949/pkgs/development/compilers/llvm/libcxx-0001-musl-hacks.patch";
              sha256 = "19nm1gwhvlfk726ckg89km5jdcr0a2cdkm78rcnrh1wyg6j4mxma";
            }
            )
          ];
          buildInputs = [ libcxxabi ];
          nativeBuildInputs = [ pkgsOrig.python3 pkgsOrig.cmake ];
          cmakeFlags = [
            "-DCMAKE_SYSROOT=${wasilibc}"
            "-DLIBCXX_SYSROOT=${wasilibc}"
            "-DLIBCXXABI_SYSROOT=${wasilibc}"
            "-DLIBCXX_LIBCXXABI_LIB_PATH=${libcxxabi}/lib"
            "-DLIBCXX_LIBCPPABI_VERSION=2"
            "-DLIBCXX_CXX_ABI=libcxxabi"
            "-DLIBCXX_HAS_MUSL_LIBC=1"
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
      libcxxClang = pkgsOrig.wrapCCWith
        rec {
          cc = llvmPrefix.tools.clang-unwrapped;
          inherit libcxx;
          extraPackages = [
            libcxx
            libcxxabi
            compiler-rt
          ];
        };
      csoundModLoadPatch = pkgsOrig.writeTextFile
        {
          name = "csoundModLoadPatch";
          text = ''
            #ifndef __MODLOAD__H
            #define __MODLOAD__H
            #include <plugin.h>
            namespace csnd {
              void on_load(Csound *);
            }
            #endif
          '';
        };
      csoundRev = "93cb3ebc344043a7ee828a85191293da36200d82";
      preprocFlags = ''
        -DGIT_HASH_VALUE=${csoundRev} \
        -DUSE_DOUBLE=1 \
        -DLINUX=0 \
        -DO_NDELAY=O_NONBLOCK \
        -DHAVE_STRLCAT=1 \
        -Wno-unknown-attributes \
        -Wno-shift-op-parentheses \
        -Wno-bitwise-op-parentheses \
        -Wno-many-braces-around-scalar-init \
        -Wno-macro-redefined \
      '';
      csoundP = pkgs.stdenv.mkDerivation
        {
          name = "csound-wasi";
          src = fetchFromGitHub {
            owner = "csound";
            repo = "csound";
            rev = csoundRev;
            sha256 = "1zslpgs5m9q9gn7xqpmzxpbkvsirijwb8gg2dbdffpkhf4xdpqdz";
          };

          buildInputs = [ libsndfileP pkgsOrig.flex pkgsOrig.bison ];
          patches = [ ./argdecode.patch ];
          postPatch = ''

          # Experimental setjmp patching
          find ./ -type f -exec sed -i -e 's/#include <setjmp.h>//g' {} \;
          find ./ -type f -exec sed -i -e 's/csound->LongJmp(.*)//g' {} \;
          find ./ -type f -exec sed -i -e 's/longjmp(.*)//g' {} \;
          find ./ -type f -exec sed -i -e 's/jmp_buf/int/g' {} \;
          find ./ -type f -exec sed -i -e 's/setjmp(csound->exitjmp)/0/g' {} \;

          find ./ -type f -exec sed -i -e 's/HAVE_PTHREAD/FFS_NO_PTHREADS/g' {} \;
          find ./ -type f -exec sed -i -e 's/#ifdef LINUX/#ifdef _NOT_LINUX_/g' {} \;
          find ./ -type f -exec sed -i -e 's/if(LINUX)/if(_NOT_LINUX_)/g' {} \;
          find ./ -type f -exec sed -i -e 's/if (LINUX)/if(_NOT_LINUX_)/g' {} \;
          find ./ -type f -exec sed -i -e 's/defined(LINUX)/defined(_NOT_LINUX_)/g' {} \;

          # don't export dynamic modules
          find ./ -type f -exec sed -i -e 's/PUBLIC.*int.*csoundModuleCreate /static int csoundModuleCreate/g' {} \;
          find ./ -type f -exec sed -i -e 's/PUBLIC.*int32_t.*csoundModuleCreate /static int32_t csoundModuleCreate/g' {} \;
          find ./ -type f -exec sed -i -e 's/PUBLIC.*int.*csound_opcode_init/static int csound_opcode_init/g' {} \;
          find ./ -type f -exec sed -i -e 's/PUBLIC.*int32_t.*csound_opcode_init/static int32_t csound_opcode_init/g' {} \;
          find ./ -type f -exec sed -i -e 's/PUBLIC.*int.*csoundModuleInfo/static int csoundModuleInfo/g' {} \;
          find ./ -type f -exec sed -i -e 's/PUBLIC.*int32_t.*csoundModuleInfo/static int32_t csoundModuleInfo/g' {} \;
          find ./ -type f -exec sed -i -e 's/PUBLIC.*NGFENS.*\*csound_fgen_init/static NGFENS *csound_fgen_init/g' {} \;
          cat ${csoundModLoadPatch} > include/modload.h


          # Don't initialize static_modules which are not compiled in wasm env
          substituteInPlace Top/csmodule.c \
            --replace '#ifndef NACL' '#ifndef __wasi__'

          # Patch 64bit integer clock
          ${patchClock}/bin/patchClock Top/csound.c

          # Patch getCWD
          ${patchGetCWD}/bin/patchGetCWD Opcodes/date.c

          touch include/float-version.h
          substituteInPlace Top/csmodule.c \
            --replace '#include <dlfcn.h>' ""
          substituteInPlace Engine/csound_orc.y \
            --replace 'csound_orcnerrs' "0"
          substituteInPlace include/sysdep.h \
            --replace '#if defined(HAVE_GCC3) && !defined(SWIG)' \
          '#if defined(HAVE_GCC3) && !defined(__wasi__)'

          # don't open .csound6rc
          substituteInPlace Top/main.c \
            --replace 'checkOptions(csound);' ""

          # follow same preproc defs as emscripten
          # when it come to filesystem calls
          substituteInPlace OOps/diskin2.c \
            --replace '__EMSCRIPTEN__' '__wasi__'

          substituteInPlace Top/one_file.c \
            --replace '#include "corfile.h"' \
                  '#include "corfile.h"
                   #include <sys/types.h>
                   #include <sys/stat.h>
                   #include <string.h>
                   #include <stdlib.h>
                   #include <unistd.h>
                   #include <fcntl.h>
                   #include <errno.h>' \
                   --replace 'umask(0077);' "" \
                   --replace 'mkstemp(lbuf)' \
                   'open(lbuf, 02)' \
                   --replace 'system(sys)' '-1'

          substituteInPlace Engine/linevent.c \
            --replace '#include <ctype.h>' \
               '#include <ctype.h>
                #include <string.h>
                #include <stdlib.h>
                #include <unistd.h>
                #include <fcntl.h>
                #include <errno.h>'

          substituteInPlace Opcodes/urandom.c \
            --replace '__HAIKU__' \
              '__wasi__
               #include <unistd.h>'

          substituteInPlace InOut/libmpadec/mp3dec.c \
            --replace '#include "csoundCore.h"' \
                      '#include "csoundCore.h"
                       #include <stdlib.h>
                       #include <stdio.h>
                       #include <sys/types.h>
                       #include <unistd.h>
                       '

          substituteInPlace Opcodes/mp3in.c \
            --replace '#include "mp3dec.h"' \
              '#include "mp3dec.h"
               #include <unistd.h>
               #include <fcntl.h>'

          substituteInPlace Top/csound.c \
            --replace 'signal(sigs[i], signal_handler);' "" \
            --replace 'HAVE_RDTSC' '__NOT_HERE___' \
            --replace 'static double timeResolutionSeconds = -1.0;' \
                      'static double timeResolutionSeconds = 0.000001;' \
            --replace 'strcpy(s, "alsa");' 'strcpy(s, "dummy");'

          substituteInPlace Engine/envvar.c \
            --replace 'return name;' \
                      'char* fsPrefix = csound->Malloc(
                         csound, (size_t) strlen(name) + 9);
                       strcpy(fsPrefix, (name[0] == DIRSEP) ? "/csound" : "/csound/");
                       strcat(fsPrefix, name);
                       return fsPrefix;' \
            --replace 'fd = open(name, RD_OPTS);' \
                      'fd = open(name, O_RDONLY);' \
            --replace '#define RD_OPTS  O_RDONLY | O_BINARY, 0' \
                      '#define RD_OPTS  O_RDONLY' \
            --replace 'UNLIKELY(getcwd(cwd, len)==NULL)' '0' \
            --replace '#include <math.h>' \
                      '#include <math.h>
                       #include <string.h>
                       #include <stdlib.h>
                       #include <unistd.h>
                       #include <fcntl.h>
                       #include <errno.h>
                     '

          substituteInPlace Top/main.c \
            --replace 'csoundUDPServerStart(csound,csound->oparms->daemon);' ""
                       substituteInPlace Engine/musmon.c \
            --replace 'csoundUDPServerClose(csound);' ""

          substituteInPlace Engine/new_orc_parser.c \
            --replace 'csound_orcdebug = O->odebug;' ""

          # expose scansyn_init_ via extern
          # also hardcode away graph console logs
          # as they seem to freeze the browser environment
          substituteInPlace Opcodes/scansyn.c \
            --replace 'static int32_t scansyn_init_' \
                      'int32_t scansyn_init_' \
            --replace '*p->i_disp' '0'
          substituteInPlace Opcodes/scansyn.h \
            --replace 'extern int32_t' \
                      'extern int32_t scansyn_init_(CSOUND *);
                       extern int32_t'

          # link emugens statically
          substituteInPlace Opcodes/emugens/emugens.c \
            --replace 'LINKAGE' \
             'int32_t emugens_init_(CSOUND *csound) {
                 return csound->AppendOpcodes(csound,
                   &(localops[0]), (int32_t) (sizeof(localops) / sizeof(OENTRY))); }'
          echo 'extern int32_t emugens_init_(CSOUND *);' >> \
            Opcodes/emugens/emugens_common.h

          rm CMakeLists.txt
        '';
          configurePhase = "
          ${pkgsOrig.flex}/bin/flex -B ./Engine/csound_orc.lex > ./Engine/csound_orc.c
          ${pkgsOrig.flex}/bin/flex -B ./Engine/csound_pre.lex > ./Engine/csound_pre.c
          ${pkgsOrig.flex}/bin/flex -B ./Engine/csound_prs.lex > ./Engine/csound_prs.c
          ${pkgsOrig.flex}/bin/flex -B ./Engine/csound_sco.lex > ./Engine/csound_sco.c
          ${pkgsOrig.bison}/bin/bison -pcsound_orc -d --report=itemset ./Engine/csound_orc.y -o ./Engine/csound_orcparse.c
        ";

          buildPhase = ''
            cp ${./csound_wasm.c} ./csound_wasm.c

            echo "Compile c++ modules"
            ${libcxxClang}/bin/clang++ \
              --sysroot=${wasilibc} \
              -Wall \
              --std=c++11 -Os -flto \
              -fvisibility=default \
              -fno-exceptions \
              -emit-llvm --target=wasm32-unknown-wasi \
               -c -S \
              -I./H -I./Engine -I./include -I./ \
              -I${libcxx}/include/c++/v1 \
              -I${libsndfileP.dev}/include \
              -I${wasilibc}/include \
              -D_LIBCPP_HAS_NO_THREADS \
              -D_LIBCPP_NO_EXCEPTIONS \
              -D__BUILDING_LIBCSOUND \
              -DINIT_STATIC_MODULES=1 \
              -DWASM_BUILD \
              -DPUBLIC='extern "C++"' \
              -D__wasi__=1 ${preprocFlags} \
              Opcodes/ampmidid.cpp \
              Opcodes/doppler.cpp \
              Opcodes/tl/fractalnoise.cpp \
              Opcodes/ftsamplebank.cpp \
              Opcodes/mixer.cpp \
              Opcodes/signalflowgraph.cpp

            echo "Compile core csound"
            ${libcxxClang}/bin/clang -Os -flto \
              --sysroot=${wasilibc} \
              -emit-llvm --target=wasm32-unknown-wasi \
               -c -S \
              -I./H -I./Engine -I./include -I./ \
              -I./InOut/libmpadec \
              -I${libsndfileP.dev}/include \
              -I${wasilibc}/include \
              -D_WASI_EMULATED_MMAN \
              -D__BUILDING_LIBCSOUND \
              -DINIT_STATIC_MODULES=1 \
              -D__wasi__=1 ${preprocFlags} \
              ${wasilibc}/share/wasm32-wasi/include-all.c \
              csound_wasm.c \
              Engine/auxfd.c \
              Engine/cfgvar.c \
              Engine/corfiles.c \
              Engine/cs_new_dispatch.c \
              Engine/cs_par_base.c \
              Engine/cs_par_orc_semantic_analysis.c \
              Engine/csound_data_structures.c \
              Engine/csound_orc.c \
              Engine/csound_orc_compile.c \
              Engine/csound_orc_expressions.c \
              Engine/csound_orc_optimize.c \
              Engine/csound_orc_semantics.c \
              Engine/csound_orcparse.c \
              Engine/csound_pre.c \
              Engine/csound_prs.c \
              Engine/csound_standard_types.c \
              Engine/csound_type_system.c \
              Engine/entry1.c \
              Engine/envvar.c \
              Engine/extract.c \
              Engine/fgens.c \
              Engine/insert.c \
              Engine/linevent.c \
              Engine/memalloc.c \
              Engine/memfiles.c \
              Engine/musmon.c \
              Engine/namedins.c \
              Engine/new_orc_parser.c \
              Engine/new_orc_parser.c \
              Engine/pools.c \
              Engine/rdscor.c \
              Engine/scope.c \
              Engine/scsort.c \
              Engine/scxtract.c \
              Engine/sort.c \
              Engine/sread.c \
              Engine/swritestr.c \
              Engine/symbtab.c \
              Engine/symbtab.c \
              Engine/twarp.c \
              InOut/circularbuffer.c \
              InOut/libmpadec/layer1.c \
              InOut/libmpadec/layer2.c \
              InOut/libmpadec/layer3.c \
              InOut/libmpadec/mp3dec.c \
              InOut/libmpadec/mpadec.c \
              InOut/libmpadec/synth.c \
              InOut/libmpadec/tables.c \
              InOut/libsnd.c \
              InOut/libsnd_u.c \
              InOut/midifile.c \
              InOut/midirecv.c \
              InOut/midisend.c \
              InOut/winEPS.c \
              InOut/winascii.c \
              InOut/windin.c \
              InOut/window.c \
              OOps/aops.c \
              OOps/bus.c \
              OOps/cmath.c \
              OOps/compile_ops.c \
              OOps/diskin2.c \
              OOps/disprep.c \
              OOps/dumpf.c \
              OOps/fftlib.c \
              OOps/goto_ops.c \
              OOps/midiinterop.c \
              OOps/midiops.c \
              OOps/midiout.c \
              OOps/mxfft.c \
              OOps/oscils.c \
              OOps/pffft.c \
              OOps/pstream.c \
              OOps/pvfileio.c \
              OOps/pvsanal.c \
              OOps/random.c \
              OOps/remote.c \
              OOps/schedule.c \
              OOps/sndinfUG.c \
              OOps/str_ops.c \
              OOps/ugens1.c \
              OOps/ugens2.c \
              OOps/ugens3.c \
              OOps/ugens4.c \
              OOps/ugens5.c \
              OOps/ugens6.c \
              OOps/ugrw1.c \
              OOps/ugtabs.c \
              OOps/vdelay.c \
              Opcodes/Vosim.c \
              Opcodes/afilters.c \
              Opcodes/ambicode.c \
              Opcodes/ambicode1.c \
              Opcodes/arrays.c \
              Opcodes/babo.c \
              Opcodes/bbcut.c \
              Opcodes/bilbar.c \
              Opcodes/biquad.c \
              Opcodes/bowedbar.c \
              Opcodes/buchla.c \
              Opcodes/butter.c \
              Opcodes/cellular.c \
              Opcodes/clfilt.c \
              Opcodes/compress.c \
              Opcodes/cpumeter.c \
              Opcodes/cross2.c \
              Opcodes/crossfm.c \
              Opcodes/dam.c \
              Opcodes/date.c \
              Opcodes/dcblockr.c \
              Opcodes/dsputil.c \
              Opcodes/emugens/beosc.c \
              Opcodes/emugens/emugens.c \
              Opcodes/emugens/scugens.c \
              Opcodes/eqfil.c \
              Opcodes/exciter.c \
              Opcodes/fareygen.c \
              Opcodes/fareyseq.c \
              Opcodes/filter.c \
              Opcodes/flanger.c \
              Opcodes/fm4op.c \
              Opcodes/follow.c \
              Opcodes/fout.c \
              Opcodes/framebuffer/Framebuffer.c \
              Opcodes/framebuffer/OLABuffer.c \
              Opcodes/framebuffer/OpcodeEntries.c \
              Opcodes/freeverb.c \
              Opcodes/ftconv.c \
              Opcodes/ftest.c \
              Opcodes/ftgen.c \
              Opcodes/gab/gab.c \
              Opcodes/gab/hvs.c \
              Opcodes/gab/newgabopc.c \
              Opcodes/gab/sliderTable.c \
              Opcodes/gab/tabmorph.c \
              Opcodes/gab/vectorial.c \
              Opcodes/gammatone.c \
              Opcodes/gendy.c \
              Opcodes/getftargs.c \
              Opcodes/grain.c \
              Opcodes/grain4.c \
              Opcodes/harmon.c \
              Opcodes/hrtfearly.c \
              Opcodes/hrtferX.c \
              Opcodes/hrtfopcodes.c \
              Opcodes/hrtfreverb.c \
              Opcodes/ifd.c \
              Opcodes/liveconv.c \
              Opcodes/locsig.c \
              Opcodes/loscilx.c \
              Opcodes/lowpassr.c \
              Opcodes/mandolin.c \
              Opcodes/metro.c \
              Opcodes/midiops2.c \
              Opcodes/midiops3.c \
              Opcodes/minmax.c \
              Opcodes/modal4.c \
              Opcodes/modmatrix.c \
              Opcodes/moog1.c \
              Opcodes/mp3in.c \
              Opcodes/newfils.c \
              Opcodes/nlfilt.c \
              Opcodes/oscbnk.c \
              Opcodes/pan2.c \
              Opcodes/partials.c \
              Opcodes/partikkel.c \
              Opcodes/paulstretch.c \
              Opcodes/phisem.c \
              Opcodes/physmod.c \
              Opcodes/physutil.c \
              Opcodes/pinker.c \
              Opcodes/pitch.c \
              Opcodes/pitch0.c \
              Opcodes/pitchtrack.c \
              Opcodes/platerev.c \
              Opcodes/pluck.c \
              Opcodes/psynth.c \
              Opcodes/pvadd.c \
              Opcodes/pvinterp.c \
              Opcodes/pvlock.c \
              Opcodes/pvoc.c \
              Opcodes/pvocext.c \
              Opcodes/pvread.c \
              Opcodes/pvs_ops.c \
              Opcodes/pvsband.c \
              Opcodes/pvsbasic.c \
              Opcodes/pvsbuffer.c \
              Opcodes/pvscent.c \
              Opcodes/pvsdemix.c \
              Opcodes/pvsgendy.c \
              Opcodes/quadbezier.c \
              Opcodes/repluck.c \
              Opcodes/reverbsc.c \
              Opcodes/scansyn.c \
              Opcodes/scansynx.c \
              Opcodes/scoreline.c \
              Opcodes/select.c \
              Opcodes/seqtime.c \
              Opcodes/sfont.c \
              Opcodes/shaker.c \
              Opcodes/shape.c \
              Opcodes/singwave.c \
              Opcodes/sndloop.c \
              Opcodes/sndwarp.c \
              Opcodes/space.c \
              Opcodes/spat3d.c \
              Opcodes/spectra.c \
              Opcodes/squinewave.c \
              Opcodes/stackops.c \
              Opcodes/stdopcod.c \
              Opcodes/syncgrain.c \
              Opcodes/tabaudio.c \
              Opcodes/tabsum.c \
              Opcodes/tl/sc_noise.c \
              Opcodes/ugakbari.c \
              Opcodes/ugens7.c \
              Opcodes/ugens8.c \
              Opcodes/ugens9.c \
              Opcodes/ugensa.c \
              Opcodes/uggab.c \
              Opcodes/ugmoss.c \
              Opcodes/ugnorman.c \
              Opcodes/ugsc.c \
              Opcodes/urandom.c \
              Opcodes/vaops.c \
              Opcodes/vbap.c \
              Opcodes/vbap1.c \
              Opcodes/vbap_n.c \
              Opcodes/vbap_zak.c \
              Opcodes/vpvoc.c \
              Opcodes/wave-terrain.c \
              Opcodes/wpfilters.c \
              Opcodes/zak.c \
              Top/argdecode.c \
              Top/cscore_internal.c \
              Top/cscorfns.c \
              Top/csdebug.c \
              Top/csmodule.c \
              Top/getstring.c \
              Top/init_static_modules.c \
              Top/main.c \
              Top/new_opts.c \
              Top/one_file.c \
              Top/opcode.c \
              Top/threads.c \
              Top/threadsafe.c \
              Top/utility.c \
              Top/csound.c

              echo "Compile to wasm objects"
              for f in *.s
                do
                ${llvm}/bin/llc -march=wasm32 -filetype=obj $f
              done

              echo "Link togeather libcsound"
              ${pkgsOrig.lld_9}/bin/wasm-ld \
                --lto-O3 \
                --demangle \
                -entry=_start \
                -error-limit=0 \
                --allow-undefined \
                --stack-first \
                -z stack-size=5242880 \
                --initial-memory=536870912 \
                -L${wasilibc}/lib \
                -L${libcxx}/lib \
                -L${libcxxabi}/lib \
                -L${libsndfileP.out}/lib \
                -lc -lm -ldl -lsndfile -lc++ -lc++abi \
                -lwasi-emulated-mman \
                --export-all \
                ${wasilibc}/lib/crt1.o *.o \
                -o libcsound.wasm
          '';

          installPhase = ''
            mkdir -p $out/lib
            cp -rf ./* $out
          '';
        };
    in
      mkShell
        {
          nativeBuildInputs = [];
          buildInputs = [ csoundP ];
          shellHook = ''
            rm -f .lib/libcsound.wasm
            rm -rf lib/*
            mkdir -p lib
            cp ${csoundP}/libcsound.wasm lib
            # make a compressed version for the browser bundle
            ${pkgsOrig.zopfli}/bin/zopfli --zlib -c \
              ${csoundP}/libcsound.wasm > lib/libcsound.wasm.zlib
            chmod 0600 lib/libcsound.wasm
            exit 0
          '';
        }
  ) {}
