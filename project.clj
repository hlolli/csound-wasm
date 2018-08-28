(defproject csound-wasm "6.11.0-1"
  :description "Csound wasm with cljs api"
  :url "https://github.com/hlolli/csound-wasm"
  :license {:name "GNU GPL v3+"
            :url  "http://www.gnu.org/licenses/gpl-3.0.en.html"}
  :source-paths ["src"]
  :resource-paths ["libcsound"]

  :scm {:name "git"
        :url  "https://github.com/hlolli/csound-wasm"}

  :dependencies [[org.clojure/clojure "1.9.0"]
                 [org.clojure/clojurescript "1.10.339"]]
  
  :plugins [[lein-doo "0.1.10"]
            [lein-cljsbuild "1.1.7"]]
  
  ;; :cljsbuild
  ;; {:builds
  ;;  {:test {:source-paths ["src"]
  ;;          :compiler     {:output-to     "out/test-node.js"
  ;;                         :target        :nodejs
  ;;                         :source-map    true
  ;;                         :language-in   :es6
  ;;                         :language-out  :no-transpile
  ;;                         :main          csound-wasm.node-test
  ;;                         :foreign-libs  [{:file        "libcsound/libcsound.js"
  ;;                                          :provides    ["libcsound"]
  ;;                                          :module-type :commonjs}]
  ;;                         ;; :npm-deps      false
  ;;                         ;; :install-deps  true
  ;;                         :optimizations :none}}}}
  )
