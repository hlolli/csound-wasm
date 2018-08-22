(ns csound-wasm.worklet-processor
  (:require [goog.object :as gobj]
            [clojure.walk :refer [stringify-keys]]
            [csound-wasm.public :as public]
            [csound-wasm.browser-shared :as shared]
            ["libcsound_browser" :as Libcsound]))

(declare AudioWorkletProcessor)

(def performance-running? (atom false))

(def worklet-audio-fn (atom (fn [& r] true)))

(defn start-audio-fn []
  (if @public/csound-running?
    (.err js/console "Csound already running, can't start audio again.")
    (let [libcsound       @public/libcsound
          csound-instance @public/csound-instance
          ksmps           ((libcsound.cwrap
                            "CsoundObj_getKsmps"
                            #js ["number"] #js ["number"])
                           csound-instance)
          input-count     ((libcsound.cwrap
                            "CsoundObj_getInputChannelCount"
                            #js ["number"] #js ["number"])
                           csound-instance)
          output-count    ((libcsound.cwrap
                            "CsoundObj_getOutputChannelCount"
                            #js ["number"] #js ["number"])
                           csound-instance)
          output-pointer  ((libcsound.cwrap
                            "CsoundObj_getOutputBuffer"
                            #js ["number"] #js ["number"])
                           csound-instance)
          frame-len       (* ksmps output-count)
          output-buffer   (new js/Float64Array
                               (.-buffer (.-HEAP8 libcsound))
                               ^js output-pointer frame-len)
          ;; TODO add microphone input buffer
          zerodbfs        ((libcsound.cwrap
                            "CsoundObj_getZerodBFS"
                            #js ["number"] #js ["number"])
                           csound-instance)
          ;; range-output-cnt (range output-count)
          perform-ksmps-fn
          (fn []
            (let [res ((.cwrap @public/libcsound
                               "CsoundObj_performKsmps"
                               #js ["number"] #js ["number"])
                       csound-instance)]
              (when-not @public/csound-running?
                (public/dispatch-event "csoundStarted")
                (reset! public/csound-running? true))
              (when (zero? res)
                (public/perform-ksmps-event))
              res))]
      (reset! worklet-audio-fn
              (fn [inputs outputs parameters]
                (let [output (aget outputs 0)
                      len    (.-length (aget output 0))]
                  (loop [res (perform-ksmps-fn)
                         i   0
                         cnt 0]
                    (if (not= 0 res)
                      (do (reset! public/csound-running? false)
                          (reset! worklet-audio-fn (fn [& r] true)))
                      (when (< i len)
                        (if (< cnt frame-len)
                          (do
                            (dotimes [chn (.-length output)]
                              (aset (aget output chn)
                                    i
                                    (/ (aget output-buffer (+ chn (* cnt (.-length output)))) zerodbfs)))
                            (recur res (inc i) (inc cnt)))
                          (let [res (perform-ksmps-fn)]
                            (recur res
                                   i
                                   0))))))
                  true))))))

(vreset! public/start-audio-fn
         (fn [& r]
           (when-not @public/audio-started?
             (reset! public/audio-started? true))
           (start-audio-fn)))

(defn apply-process [inputs outputs parameters]
  (@worklet-audio-fn inputs outputs parameters))

(def public-functions
  (-> (stringify-keys (js->clj shared/main))
      (assoc "csoundNew" public/csound-new-object
             "instanciateLibcsound"
             (fn []
               (reset! public/libcsound
                       (public/instanciate-libcsound Libcsound))))))

(def public-functions-keys
  (into #{} (keys public-functions)))

(defn handle-promise [data]
  (let [promise-id (second data)
        params     (.slice data 3)
        return-val (apply (get public-functions (aget data 2)) params)]
    ((:post @public/audio-worklet-processor)
     #js ["promise" promise-id return-val])))

(defn processor-event-handler [event]
  (let [data (.-data event)
        key  (aget data 0)]
    (case key
      "promise"
      (handle-promise data)
      "setStartupFn"
      (vreset! public/startup-fn
               (case (aget data 1)
                 "startRealtime" #(public/start-realtime (aget data 2))))
      (apply (get public-functions key) (rest data))
      ;;(.error js/console "Error unhandled key in processor: " key)
      )))

(defn AudioWorkletProcessor []
  (cljs.core/this-as this
    (letfn [(process [inputs outputs parameters]
              (@worklet-audio-fn inputs outputs parameters))]
      (let [instance (js/Reflect.construct
                      js/AudioWorkletProcessor #js []
                      AudioWorkletProcessor)]
        (set! (.. instance -port -onmessage) processor-event-handler)
        (reset! public/audio-worklet-processor
                {:object instance
                 :post   (fn [msg & r] (.postMessage ^js (.. instance -port) msg))})
        (.postMessage (.. instance -port) #js ["workletProcessorReady"])
        instance))))

(set! (.. AudioWorkletProcessor -prototype)
      (.. js/AudioWorkletProcessor -prototype))


(letfn [(process [& params]
          (apply @worklet-audio-fn params))]
  (set! (.. AudioWorkletProcessor -prototype -process) process))

(js/registerProcessor "csound-processor" AudioWorkletProcessor)
