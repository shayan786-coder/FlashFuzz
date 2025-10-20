import clsx from "clsx"
import {
  Check,
  Info,
  RefreshCcw,
  Save,
  Star,
  ToggleLeft,
  ToggleRight
} from "lucide-react"
import React, { useEffect, useState } from "react"

import { Storage } from "@plasmohq/storage"

import Logo from "~logo"
import urlsToCheck from "~wordlist"

import "./style.css"

const EXT_KEY = "flashfuzz_enabled"
const WORDLISTS_KEY = "flashfuzz_wordlists"
const EXCLUDED_SITES_KEY = "flashfuzz_excluded_sites"
const BATCH_SIZE_KEY = "flashfuzz_batch_size"
const INTERVAL_MS_KEY = "flashfuzz_interval_ms"
const REPEATED_SIZES_KEY = "flashfuzz_repeated_sizes_threshold"

const storage = new Storage()
const wordlistsDefault = urlsToCheck.join("\n")
const excludedSitesDefault = ["google.com", "github.com", "youtube.com"].join(
  "\n"
)
const batchSizeDefault = 10
const intervalMsDefault = 500
const repeatedSizesThresholdDefault = 5

const Popup = () => {
  const [enabled, setEnabled] = useState(false)
  const [wordlists, setWordlists] = useState("")
  const [excludedSites, setExcludedSites] = useState("")
  const [batchSize, setBatchSize] = useState(batchSizeDefault)
  const [intervalMs, setIntervalMs] = useState(intervalMsDefault)
  const [repeatedSizesThreshold, setRepeatedSizesThreshold] = useState(
    repeatedSizesThresholdDefault
  )
  const [showSaved, setShowSaved] = useState(false)

  useEffect(() => {
    // Get Enabled/Disabled state from storage
    storage.get(EXT_KEY).then((stored) => {
      if (typeof stored === "boolean") setEnabled(stored)
      else if (typeof stored === "string") setEnabled(stored === "true")
    })

    // Get Wordlists from storage or set default if not present
    storage.get(WORDLISTS_KEY).then((stored) => {
      if (typeof stored === "string") setWordlists(stored)
      else {
        setWordlists(wordlistsDefault)
        storage.set(WORDLISTS_KEY, wordlistsDefault)
      }
    })

    // Get Excluded Sites from storage or set default if not present
    storage.get(EXCLUDED_SITES_KEY).then((stored) => {
      if (typeof stored === "string") setExcludedSites(stored)
      else {
        setExcludedSites(excludedSitesDefault)
        storage.set(EXCLUDED_SITES_KEY, excludedSitesDefault)
      }
    })

    // Get other settings from storage or set defaults if not present
    storage.get(BATCH_SIZE_KEY).then((stored) => {
      const val = parseInt(stored)
      setBatchSize(Number.isNaN(val) ? batchSizeDefault : val)
    })
    storage.get(INTERVAL_MS_KEY).then((stored) => {
      const val = parseInt(stored)
      setIntervalMs(Number.isNaN(val) ? intervalMsDefault : val)
    })
    storage.get(REPEATED_SIZES_KEY).then((stored) => {
      const val = parseInt(stored)
      setRepeatedSizesThreshold(
        Number.isNaN(val) ? repeatedSizesThresholdDefault : val
      )
    })
  }, [])

  // Toggle Enabled/Disabled state
  const handleToggle = async () => {
    await storage.set(EXT_KEY, !enabled)
    setEnabled((prev) => !prev)
  }

  // Handle changes in the wordlists textarea
  const handleWordlistsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setWordlists(e.target.value)
  }

  // Reset settings to default values
  const handleReset = () => {
    setWordlists(wordlistsDefault)
    storage.set(WORDLISTS_KEY, wordlistsDefault)
    setBatchSize(batchSizeDefault)
    storage.set(BATCH_SIZE_KEY, batchSizeDefault)
    setIntervalMs(intervalMsDefault)
    storage.set(INTERVAL_MS_KEY, intervalMsDefault)
    setRepeatedSizesThreshold(repeatedSizesThresholdDefault)
    storage.set(REPEATED_SIZES_KEY, repeatedSizesThresholdDefault)
    setExcludedSites(excludedSitesDefault)
    storage.set(EXCLUDED_SITES_KEY, excludedSitesDefault)
  }

  // Save all settings to storage
  const handleSaveSettings = () => {
    storage.set(WORDLISTS_KEY, wordlists)
    storage.set(EXCLUDED_SITES_KEY, excludedSites)
    storage.set(BATCH_SIZE_KEY, batchSize)
    storage.set(INTERVAL_MS_KEY, intervalMs)
    storage.set(REPEATED_SIZES_KEY, repeatedSizesThreshold)
    setShowSaved(true)
    setTimeout(() => setShowSaved(false), 2000)
  }

  return (
    <div className="min-w-[360px] max-w-sm bg-slate-950 text-slate-100 overflow-hidden text-sm border border-slate-800">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-b from-slate-900 to-slate-950 border-b border-slate-800">
        <div className="flex items-center justify-between">
          {/* Left: Logo + Text */}
          <div className="flex items-center gap-2">
            <Logo className="w-8 h-8 text-slate-950" />
            <div>
              <h1 className="text-sm font-semibold text-white tracking-tight">
                FlashFuzz
              </h1>
              <p className="text-[10px] text-slate-400">Version 1.1</p>
            </div>
          </div>

          {/* Toggle */}
          <button
            onClick={handleToggle}
            role="switch" // <-- 1. Accessibility: It's a switch
            aria-checked={enabled} // <-- 2. Accessibility: Announce its state
            className={clsx(
              "flex items-center gap-3 px-4 py-2 rounded-full font-bold text-sm",
              "transition-colors duration-200",
              "focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:ring-offset-gray-900", // <-- Added offset for dark BGs
              {
                // 3. Visuals: "ON" state is now solid and high-contrast
                "bg-yellow-400 text-yellow-900 hover:bg-yellow-300": enabled,
                // "OFF" state
                "bg-gray-800 text-gray-300 hover:bg-gray-700": !enabled
              }
            )}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="1em"
              height="1em"
              viewBox="0 0 24 24"
              fill="currentColor">
              <path d="M12 12q-.425 0-.712-.288T11 11V3q0-.425.288-.712T12 2t.713.288T13 3v8q0 .425-.288.713T12 12m0 9q-1.875 0-3.512-.712t-2.85-1.925t-1.925-2.85T3 12q0-1.525.5-2.963T4.95 6.4q.275-.35.7-.337t.75.337q.275.275.25.675t-.275.75Q5.7 8.725 5.35 9.8T5 12q0 2.925 2.038 4.963T12 19t4.963-2.037T19 12q0-1.15-.337-2.238T17.6 7.775q-.25-.325-.275-.712t.25-.663q.3-.3.725-.312t.7.312q.975 1.2 1.488 2.625T21 12q0 1.875-.712 3.513t-1.925 2.85t-2.85 1.925T12 21" />
            </svg>
            <span>{enabled ? "ON" : "OFF"}</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-4 space-y-4">
        {/* Settings */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
              Settings
            </label>
          </div>
          <div className="space-y-2 bg-slate-900/50 rounded-md p-3 border border-slate-800">
            {[
              {
                label: "Batch Size",
                val: batchSize,
                set: setBatchSize,
                def: batchSizeDefault,
                tooltip: "Number of requests to send in each batch."
              },
              {
                label: "Interval (ms)",
                val: intervalMs,
                set: setIntervalMs,
                def: intervalMsDefault,
                tooltip: "The time to wait between each request."
              },
              {
                label: "Duplicate Filter",
                val: repeatedSizesThreshold,
                set: setRepeatedSizesThreshold,
                def: repeatedSizesThresholdDefault,
                tooltip:
                  "Filters out duplicate responses when requests return the same data. For every response size that is repeated more than this threshold, only one will be kept."
              }
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1 flex-1 text-[10px] text-slate-300 font-medium">
                  {item.label}
                  <span title={item.tooltip}>
                    <Info className="w-3 h-3 text-slate-500 hover:text-slate-400 cursor-help transition-colors" />
                  </span>
                </div>
                <input
                  type="number"
                  min={1}
                  value={item.val}
                  onChange={(e) =>
                    item.set(Math.max(1, parseInt(e.target.value) || item.def))
                  }
                  className="w-16 px-1.5 py-0.5 text-[10px] bg-slate-800 border border-slate-700 rounded-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500/50 transition"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Wordlists */}
        <div>
          <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            Wordlists
            <span title="List of words used for fuzzing. Each entry should be on a new line.">
              <Info className="w-3 h-3 text-slate-500 hover:text-slate-400 cursor-help transition-colors" />
            </span>
          </label>
          <textarea
            value={wordlists}
            rows={4}
            onChange={handleWordlistsChange}
            placeholder="Enter wordlists (one per line)..."
            className="w-full border border-slate-700 bg-slate-900 text-slate-100 px-2 py-2 text-[10px] rounded-md resize-none focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500/50 transition placeholder-slate-500"
          />
          <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
            <span>
              {wordlists
                ? wordlists.split("\n").filter((l) => l.trim()).length
                : 0}{" "}
              entries
            </span>
          </div>

          {/* Excluded Websites */}
          <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider mb-2 mt-3 flex items-center gap-1.5">
            Excluded Websites
            <span title="List of websites where FlashFuzz should be inactive. Each entry should be on a new line.">
              <Info className="w-3 h-3 text-slate-500 hover:text-slate-400 cursor-help transition-colors" />
            </span>
          </label>
          <textarea
            value={excludedSites}
            rows={3}
            onChange={(e) => setExcludedSites(e.target.value)}
            placeholder="Enter excluded websites (one per line)..."
            className="w-full border border-slate-700 bg-slate-900 text-slate-100 px-2 py-1.5 text-[10px] rounded-md resize-none focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500/50 transition placeholder-slate-500"
          />
          <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
            <span>
              {excludedSites
                ? excludedSites.split("\n").filter((l) => l.trim()).length
                : 0}{" "}
              entries
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-1.5 mt-2">
            <button
              onClick={handleSaveSettings}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-medium text-[10px] rounded-md transition-colors">
              {showSaved ? (
                <>
                  <Check className="w-3 h-3" /> Saved!
                </>
              ) : (
                <>
                  <Save className="w-3 h-3" /> Save Settings
                </>
              )}
            </button>
            <button
              onClick={handleReset}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-[10px] rounded-md border border-slate-700 transition-colors">
              <RefreshCcw className="w-3 h-3" /> Reset
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-slate-800 bg-slate-900/50 text-[10px] text-slate-400 flex justify-center gap-3">
        <a
          href="https://github.com/Ademking/FlashFuzz"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 hover:text-yellow-400 hover:underline transition">
          <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> Star on
          GitHub
        </a>
        <span className="text-slate-600">•</span>
        <a
          href="https://github.com/Ademking"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-yellow-400 hover:underline transition">
          Created by Adem Kouki
        </a>
      </div>
    </div>
  )
}

export default Popup
