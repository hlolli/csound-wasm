#!/usr/bin/env bash


nix build '(with import <nixpkgs> {}; import ./nix/native/compile.nix)' -o result_compile &&
    if [ -d "./lib" ]; then
        printf '%s\n' "Cleaning directory lib"
        rm -rf "./lib"
    fi &&
    mkdir lib &&
    cp ./result_compile/* lib &&
    chmod 0600 lib/*

printf '%s\n' "wasm binary ready in ./lib"
