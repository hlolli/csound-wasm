(defproject csound-wasm "6.10.0-3"
  :description "Csound wasm with cljs api"
  :url "https://github.com/hlolli/csound-wasm"
  :license {:name "GNU GPL v3+"
            :url "http://www.gnu.org/licenses/gpl-3.0.en.html"}
  :source-paths ["src"]
  :resource-paths ["libcsound.js" "libcsound.wasm" "package.json"]
  :scm {:name "git"
        :url "https://github.com/hlolli/csound-wasm"})
