(ns csound-wasm.core
  (:require [goog.dom :refer [isElement]]
            [clojure.string :as string]
            ["strip-ansi" :as strip-ansi])
  (:require-macros
   [csound-wasm.macros :refer [wrap-promise wrap-ipc-promise]]))


;; reminder, note difference in return vals between setters and getters

(def libcsound (atom nil))

(def worklet-message-queue (atom []))

(def nodejs?
  (and (exists? js/module)
       (exists? (.-exports js/module))))

(def worker-threads
  (when nodejs?
    (try (js/require "worker_threads")
         (catch js/Error e false))))

(def audio-worklet-node
  (if (or (and (exists? js/AudioWorklet)
               (not (exists? js/AudioWorkletProcessor)))
          (and worker-threads (.-isMainThread worker-threads)))
    (atom {:post (fn [msg] (swap! worklet-message-queue conj msg))})
    (atom nil)))

(def audio-worklet-processor
  (if (or (exists? js/AudioWorkletProcessor)
          (and worker-threads
               (not (.-isMainThread worker-threads))))
    (atom {:post (fn [msg] (println "Missed a message: " msg))})
    (atom nil)))

(def event-queue (atom []))

(def ipc-promise-queue (atom {}))

(def startup-fn (atom nil))

(def start-audio-fn (atom nil))

(def wasm-loaded? (atom false))

(def wasm-initialized? (atom false))

(def csound-instance (atom nil))

(def audio-started? (atom false))

(def csound-running? (atom false))

;; Default config
(def audio-config (atom {:nchnls       2
                         :microphone   false
                         :nchnls_i     0
                         :zerodbfs     1
                         :sr           44100
                         :ksmps        128
                         :buffer       2048
                         :messagelevel 39}))

(def node-event-emitter*
  (when nodejs?
    (js/require "events")))

(def node-event-emitter
  (when nodejs?
    (new node-event-emitter*)))

(defn dispatch-event [e data]
  (if-let [awp @audio-worklet-processor]
    ((:post awp) #js ["dispatchEvent" e data])
    (if nodejs?
      (if data
        (.emit node-event-emitter e data)
        (.emit node-event-emitter e))
      (if data
        (.dispatchEvent js/window (new js/CustomEvent e #js {:detail data}))
        (.dispatchEvent js/window (new js/Event e))))))

(defn prepareRT []
  (if-let [awn @audio-worklet-node]
    ((:post awn) #js ["prepareRT"]))
  (((.-cwrap ^js @libcsound) "CsoundObj_prepareRT"
    nil #js ["number"]) @csound-instance))

(defn set-option [option]
  (if-not @wasm-loaded?
    (swap! event-queue conj #(set-option option))
    (if-let [awn @audio-worklet-node]
      ((:post awn) #js ["setOption" option])
      (((.-cwrap ^js @libcsound) "CsoundObj_setOption" nil #js ["number" "string"])
       @csound-instance option))))

(defn compile-orc [orc]
  (if-not @wasm-loaded?
    (swap! event-queue conj #(compile-orc orc))
    (if-let [awn @audio-worklet-node]
      ((:post awn) #js ["compileOrc" orc])
      (((.-cwrap ^js @libcsound)
        "CsoundObj_compileOrc"
        "number" #js ["number" "string"])
       @csound-instance orc))))

(defn eval-code [orc]
  (if-not @wasm-loaded?
    (swap! event-queue conj #(eval-code orc))
    (if-let [awn @audio-worklet-node]
      ((:post awn) #js ["evalCode" orc])
      (((.-cwrap ^js @libcsound) "CsoundObj_evaluateCode" "number" #js ["number" "string"])
       @csound-instance orc))))

(defn input-message [sco]
  (if-not @wasm-loaded?
    (swap! event-queue conj #(input-message sco))
    (if-let [awn @audio-worklet-node]
      ((:post awn) #js ["inputMessage" sco])
      (((.-cwrap ^js @libcsound)
        "CsoundObj_inputMessage"
        "number" #js ["number" "string"])
       @csound-instance sco))))


#_(defn input-message-async [sco]
    (((.-cwrap @libcsound) "CsoundObj_inputMessageAsync" "number" #js ["number" "string"])
     @csound-instance sco)
    #_(if @wasm-loaded?
        (libcsound/_CsoundObj_inputMessageAsync (libcsound/JSfuncs.stringToC sco))        
        (swap! event-queue conj (fn [] (js/setTimeout #(input-message sco)) 1))))

(defn read-score [sco]
  (if-not @wasm-loaded?
    (swap! event-queue conj #(read-score sco))
    (if-let [awn @audio-worklet-node]
      ((:post awn) #js ["readScore" sco])
      (if @wasm-loaded?
        (((.-cwrap ^js @libcsound)
          "CsoundObj_readScore"
          "number" #js ["number" "string"])
         @csound-instance sco)))))

(defn get-control-channel [ctrl-channel]
  (if @audio-worklet-node
    (wrap-ipc-promise #js ["getControlChannel" ctrl-channel])
    (let [callback (fn []
                     (((.-cwrap ^js @libcsound)
                       "CsoundObj_getControlChannel"
                       #js ["number"] #js ["number" "string"])
                      @csound-instance ctrl-channel))]
      (wrap-promise callback))))

(defn set-control-channel [ctrl-channel val]
  (if-not @wasm-loaded?
    (swap! event-queue conj #(set-control-channel ctrl-channel val))
    (if-let [awn @audio-worklet-node]
      ((:post awn) #js ["setControlChannel" ctrl-channel val])
      (((.-cwrap ^js @libcsound)
        "CsoundObj_setControlChannel"
        nil #js ["number" "string" "number"])
       @csound-instance ctrl-channel val))))

(defn set-string-channel [string-channel string]
  (if-not @wasm-loaded?
    (swap! event-queue conj #(set-control-channel set-string-channel string))
    (if-let [awn @audio-worklet-node]
      ((:post awn) #js ["setStringChannel" string-channel string])
      (((.-cwrap ^js @libcsound)
        "CsoundObj_setStringChannel"
        nil #js ["number" "string" "string"])
       @csound-instance string-channel string))))

(defn get-score-time []
  (if @audio-worklet-node
    (wrap-ipc-promise #js ["getScoreTime"])
    (let [callback
          (fn []
            (((.-cwrap ^js @libcsound)
              "CsoundObj_getScoreTime"
              nil #js ["number"])
             @csound-instance))]
      (wrap-promise callback))))

(defn write-to-fs [file-array & [root-dir]]
  ;; let's be kind and allow an event to be passed
  (let [file-array (if (isElement file-array)
                     (.-files file-array)
                     file-array)]
    (if @audio-worklet-node
      (js/Promise.all
       (amap file-array i ret
             (let [file        (aget file-array i)
                   file-reader (new js/window.FileReader)
                   resolver    (volatile! nil)
                   promise-ret (js/Promise. (fn [resolve reject]
                                              (vreset! resolver resolve)))
                   file-ready-event
                   (fn [evt]
                     (-> (wrap-ipc-promise
                          #js ["writeToFs" (.-result file-reader)
                               (or root-dir "/") (.-name file)])
                         (.then (fn [filename]
                                  (println (str "Adding "
                                                (if (or (= "/" root-dir)
                                                        (empty? root-dir))
                                                  (subs filename 1)
                                                  filename)
                                                " to filesystem."))
                                  (@resolver filename)))))]
               (set! (.-onload file-reader) file-ready-event)
               (.readAsBinaryString file-reader file)
               promise-ret)))
      (let [callback (fn []
                       (when (< 0 (.-length file-array))
                         (let [fs       (.-FS ^js @libcsound)
                               root-dir (if-not (empty? root-dir) root-dir "/")]
                           (when (and (or (empty? root-dir) (not= "/" root-dir))
                                      (not (.includes (.readdir fs "/") root-dir)))
                             (.createFolder fs "/" root-dir true true))
                           (doseq [idx (range (.-length file-array))]
                             (let [file        (aget file-array idx)
                                   file-reader (new js/window.FileReader)
                                   file-ready-event
                                   (fn [evt]
                                     (.createDataFile
                                      fs root-dir (.-name file)
                                      (.-result file-reader)
                                      true true))]
                               (prn "INCLUDES?" (.readdir fs root-dir)
                                    (.includes (.readdir fs root-dir) (.-name file)))
                               (when (.includes (.readdir fs root-dir) (.-name file))
                                 (.unlink fs (str root-dir "/" (.-name file))))
                               (set! (.-onload file-reader) file-ready-event)
                               (.readAsBinaryString file-reader file)
                               (println (str "Adding "
                                             (if (= "/" root-dir)
                                               (.-name file)
                                               (str root-dir "/"
                                                    (.-name file)))
                                             " to filesystem."))))
                           (amap file-array i ret
                                 (let [file     (aget file-array i)
                                       filename (.-name file)]
                                   (if (= "/" root-dir)
                                     filename
                                     (str root-dir "/" filename)))))))]
        (wrap-promise callback)))))

#_(defn get-score-time-sync []
    (when-let [awn @audio-worklet-node]
      ((:post awn) #js ["getScoreTimeSync"]))
    (if @wasm-loaded?
      (((.-cwrap @libcsound) "CsoundObj_getScoreTime" nil #js ["number"])
       @csound-instance)
      0))

#_(defn- resume-performance
    "Private-fn that ensures performKspms is
   running in case a previous score ended."
    []
    (when-let [awn @audio-worklet-node]
      ((:post awn) #js ["resumePerformance"])))

(declare reset-sequence)

(defn reset []
  (if-not @wasm-loaded?
    (swap! event-queue conj #(reset))
    (if-let [awn @audio-worklet-node]
      ((:post awn) #js ["reset"])
      (do
        (reset! csound-running? :reset)
        (((.-cwrap ^js @libcsound) "CsoundObj_reset" nil #js ["number"])
         @csound-instance)))))

(defn destroy []
  (if-not @wasm-loaded?
    (swap! event-queue conj #(destroy))
    (if-let [awn @audio-worklet-node]
      ((:post awn) #js ["destroy"])
      (((.-cwrap ^js @libcsound) "CsoundObj_destroy" nil #js ["number"])
       @csound-instance))))

(defn compile-csd [csd]
  (if-not @wasm-loaded?
    (swap! event-queue conj #(compile-csd csd))
    (if-let [awn @audio-worklet-node]
      ((:post awn) #js ["compileCSD" csd])
      (do (((.-cwrap ^js @libcsound) "CsoundObj_compileCSD" nil #js ["number" "string"])
           @csound-instance csd)
          (dispatch-event "csoundReady" nil)))))

(defn set-table [table-num index val]
  (if-not @wasm-loaded?
    (swap! event-queue conj #(set-table table-num index val))
    (if-let [awn @audio-worklet-node]
      ((:post awn) #js ["setTable" table-num index val])
      (((.-cwrap ^js @libcsound) "CsoundObj_setTable" nil #js ["number" "number" "number" "number"])
       @csound-instance table-num index val))))

(defn get-table-length [table-num]
  (if @audio-worklet-node
    (wrap-ipc-promise #js ["getTableLength" table-num])
    (let [callback (fn []
                     (((.-cwrap ^js @libcsound) "CsoundObj_getTableLength"
                       #js ["number"] #js ["number" "number"])
                      @csound-instance table-num))]
      (wrap-promise callback))))

(defn get-table [table-num]
  (if @audio-worklet-node
    (wrap-ipc-promise #js ["getTable" table-num])
    (wrap-promise
     (fn []
       (let [buf (((.-cwrap ^js @libcsound)
                   "CsoundObj_getTable"
                   #js ["number"] #js ["number" "number"])
                  @csound-instance table-num)
             len (((.-cwrap ^js @libcsound) "CsoundObj_getTableLength"
                   #js ["number"] #js ["number" "number"])
                  @csound-instance table-num)]
         (if (= -1 len)
           (.error js/console (str "Error: table number " table-num
                                   " doesn't exist, or hasn't been compiled yet."))
           (let [src (new js/Float64Array
                          (.-buffer (.-HEAP8 ^js @libcsound)) buf len)
                 ret (new js/Float32Array src)]             
             ret)))))))

(defn get-ksmps []
  (if @audio-worklet-node
    (wrap-ipc-promise #js ["getKsmps"])
    (let [callback (fn []
                     (((.-cwrap ^js @libcsound)
                       "CsoundObj_getKsmps"
                       #js ["number"] #js ["number"])
                      @csound-instance))]
      (wrap-promise callback))))

(defn get-0dbfs []
  (if @audio-worklet-node
    (wrap-ipc-promise #js ["get0dbfs"])
    (let [callback (fn []
                     (((.-cwrap ^js @libcsound)
                       "CsoundObj_getZerodBFS"
                       #js ["number"] #js ["number"])
                      @csound-instance))]
      (wrap-promise callback))))

(defn set-midi-callbacks []
  (if-not @wasm-loaded?
    (swap! event-queue conj #(set-midi-callbacks))
    (if-let [awn @audio-worklet-node]
      ((:post awn) #js ["setMidiCallbacks"])
      (((.-cwrap ^js @libcsound) "CsoundObj_setMidiCallbacks" nil #js ["number"])
       @csound-instance))))

(defn push-midi-message [byte1 byte2 byte3]
  (if-not @wasm-loaded?
    (swap! event-queue conj #(push-midi-message byte1 byte2 byte3))
    (if-let [awn @audio-worklet-node]
      ((:post awn) #js ["pushMidiMessage" byte1 byte2 byte3])
      (((.-cwrap ^js @libcsound) "CsoundObj_pushMidiMessage" nil #js ["number" "number" "number" "number"])
       @csound-instance byte1 byte2 byte3))))

;; Events

(def ^:private csound-event-listeners
  (atom []))

;; (def ^:private logger-callback)

(defn- get-event-name [event]
  (case event
    "log"     "csoundLog"
    "ready"   "csoundReady"
    "start"   "csoundStarted"
    "perform" "performKsmps"
    "end"     "csoundEnd"
    event))

(defn on
  "All callback are outside of processor,
   processor just echoes events back."
  [event callback]
  (let [full-event-name (get-event-name event)
        callback        (case event
                          "log" (fn [e]
                                  (if nodejs?
                                    (callback e)
                                    (callback e.detail)))
                          callback)]
    (swap! csound-event-listeners conj [full-event-name callback])
    (if nodejs?
      (.on node-event-emitter full-event-name callback)
      (.addEventListener js/window full-event-name callback))))

(defn perform-ksmps-event []
  (dispatch-event "performKsmps" nil))

(defn- log-event [log]
  (let [log (-> log
                (string/replace #"\t" " ")                
                strip-ansi)]
    (dispatch-event "csoundLog" log)))

;; Default logger
(when-not @audio-worklet-processor
  (on "log"
      (fn [log]
        (if (exists? js/window)
          ;; (.log js/console "%c%s" "font-size: 13px;" (str log))
          (.log js/console (str log))
          (.log js/console (str log))))))


(defn remove-listener [event]
  (let [full-event-name (get-event-name event)
        pre-len         (count @csound-event-listeners)]
    (reset! csound-event-listeners
            (reduce (fn [i [event cb]]
                      (if (= full-event-name event)
                        (do (if nodejs?
                              (.removeListener node-event-emitter full-event-name cb)
                              (.removeEventListener js/window full-event-name cb))
                            i)
                        (conj i [event cb])))
                    [] @csound-event-listeners))
    (let [events-found (- pre-len (count @csound-event-listeners))]
      (.log js/console
            (if (zero? events-found)
              (str "No events of type \"" event "\" were found.")
              (str 
               " event listeners of type "
               event
               " were removed."))))))

;;;; Initializers

(declare activate-init-callback)

(defn csound-new-object []
  (if-let [awn @audio-worklet-node]
    ((:post awn) #js ["csoundNew"])
    (reset! csound-instance
            (((.-cwrap ^js @libcsound)
              "CsoundObj_new"
              #js ["number"] nil)))))

(defn reset-sequence
  [{:keys [sr buffer nchnls nchnls_i zerodbfs ksmps
           messagelevel]}]
  (set-option (str "-b" (/ buffer 2)))
  (set-option (str "-B" buffer))
  (set-option (str "--nchnls=" nchnls))
  (set-option (str "--nchnls_i=" nchnls_i))
  (set-option (str "--ksmps=" ksmps))
  (set-option (str "--sample-rate=" sr))
  (set-option (str "--0dbfs=" zerodbfs))
  (set-option (str "--messagelevel=" messagelevel))
  (set-option "-M0")
  (set-option "-idac")
  (set-option "-odac")
  (set-option "-+rtmidi=null")
  (set-option "-+rtaudio=null")
  (dispatch-event "csoundReady" nil))

(defn play-csd [csd & [config]]
  (let [config-js  config
        config-clj (merge @audio-config
                          (if (object? config-js)
                            (js->clj
                             (or config-js #js {})
                             :keywordize-keys true)
                            (or config-js {})))
        {:keys [nchnls nchnls_i zerodbfs sr ksmps buffer]}
        config-clj]
    (reset! audio-config config-clj)
    (if-let [awn @audio-worklet-node]
      ((:post awn) #js ["setStartupFn" "playCSD" csd config-js])
      (if @wasm-loaded?
        (if-not @audio-started?
          (do (reset! audio-config config-clj)
              (reset-sequence config-clj)
              (compile-csd csd)
              (@start-audio-fn config-clj))
          (do (reset)
              (prepareRT) ;; this prevents cannot open idac errors
              (reset-sequence config-clj)
              (compile-csd csd)
              (@start-audio-fn config-clj)))
        (do
          (swap! event-queue conj #(play-csd csd config-js)))))))

(defn start-realtime [& [config]]
  (let [config (merge @audio-config
                      (if (map? config)
                        config
                        (js->clj
                         (or config #js {})
                         :keywordize-keys true)))
        {:keys [nchnls zerodbfs sr ksmps buffer]}
        config]
    (if @wasm-initialized?
      (do (when @audio-started?
            (reset)
            (prepareRT))
          (reset-sequence config)
          ;; Dummy event
          (compile-orc "event_i \"f\", 0, 360000000")
          (when (fn? @start-audio-fn)
            (@start-audio-fn config)))
      (let [awn @audio-worklet-node]
        (reset! audio-config config)
        (when awn
          ((:post awn) #js ["setStartupFn" "startRealtime" (clj->js config)]))
        (reset! startup-fn #(apply start-realtime [config]))))))

(defn run-event-queue []
  (when (exists? js/AudioWorkletProcessor)
    ((:post @audio-worklet-processor) #js ["workletProcessorWasmReady"]))
  (reset! wasm-loaded? true)
  (when (fn? @startup-fn)
    (@startup-fn))
  (doseq [event @event-queue]
    (event))
  (reset! event-queue []))

(defn initialize []
  (when-not @wasm-initialized?
    (csound-new-object)
    (prepareRT)
    (dispatch-event "wasmInitialized" nil)
    (reset! wasm-initialized? true)))

(defn instanciate-libcsound [Libcsound]
  (when-not @wasm-initialized?
    (if Libcsound
      (Libcsound #js {:postRun
                      (fn []
                        (when (or Libcsound @audio-worklet-node)
                          (initialize)
                          (run-event-queue)))
                      :noExitRuntime true
                      :print         log-event
                      :printErr      log-event})
      (when-let [awn @audio-worklet-node]
        ;; (run-event-queue)
        ((:post awn) #js ["instanciateLibcsound"])))))

(defn activate-init-callback [Libcsound]
  (instanciate-libcsound Libcsound))
