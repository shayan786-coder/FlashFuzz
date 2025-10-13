import React, { useEffect, useState } from "react"

import { Storage } from "@plasmohq/storage"

import Logo from "~logo"
import urlsToCheck from "~wordlist"

import "./style.css"

const EXT_KEY = "flashfuzz_enabled"
const WORDLISTS_KEY = "flashfuzz_wordlists"
const BATCH_SIZE_KEY = "flashfuzz_batch_size"
const INTERVAL_MS_KEY = "flashfuzz_interval_ms"
const REPEATED_SIZES_KEY = "flashfuzz_repeated_sizes_threshold"
const storage = new Storage()
const wordlistsDefault = urlsToCheck.join("\n")
const batchSizeDefault = 10
const intervalMsDefault = 500
const repeatedSizesThresholdDefault = 5

const Popup = () => {
  const [enabled, setEnabled] = useState(false)
  const [wordlists, setWordlists] = useState("")
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
  }

  // Save all settings to storage
  const handleSaveSettings = () => {
    storage.set(WORDLISTS_KEY, wordlists)
    storage.set(BATCH_SIZE_KEY, batchSize)
    storage.set(INTERVAL_MS_KEY, intervalMs)
    storage.set(REPEATED_SIZES_KEY, repeatedSizesThreshold)
    setShowSaved(true)
    setTimeout(() => setShowSaved(false), 2000)
  }

  return (
    <div className="min-w-[400px] max-w-sm bg-gray-950 text-gray-100 overflow-hidden border border-gray-800 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 bg-gradient-to-b from-gray-900 to-gray-950 shadow-inner">
        {/* Left: Logo + Text */}
        <div className="flex items-center">
          {/* Logo */}
          <div className="w-10 h-10 flex items-center justify-center">
            <Logo />
          </div>

          {/* Text next to logo */}
          <div className="ml-3 flex flex-col justify-center">
            <h1 className="text-lg font-bold text-white tracking-wide">
              FlashFuzz
            </h1>
            <p className="text-xs text-gray-400">
              Quickly fuzz URLs in your tabs
            </p>
          </div>
        </div>

        {/* Right: Toggle */}
        <div className="flex items-center">
          <span
            className={`text-sm font-medium ${
              enabled ? "text-white" : "text-gray-500"
            }`}>
            {enabled ? "ON" : "OFF"}
          </span>

          <button
            onClick={handleToggle}
            className={`relative w-11 h-6 ml-2 rounded-full transition-all duration-300 border ${
              enabled
                ? "bg-yellow-500 border-white shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                : "bg-gray-700 border-gray-600"
            }`}>
            <span
              className={`absolute top-[2px] left-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-md transform transition-transform duration-300 ${
                enabled ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 pb-4 flex flex-col gap-2">
        {/* Settings */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Settings
          </label>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span
                className="text-xs text-gray-300"
                title="Number of requests to send in each batch.">
                Batch Size{" "}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="inline-block w-3 h-3 ml-1 text-gray-500 hover:text-gray-300 cursor-pointer"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </span>
              <input
                type="number"
                min={1}
                value={batchSize}
                onChange={(e) => {
                  const val = Math.max(
                    1,
                    parseInt(e.target.value) || batchSizeDefault
                  )
                  setBatchSize(val)
                  storage.set(BATCH_SIZE_KEY, val)
                }}
                className="w-16 px-2 py-1 text-xs bg-gray-900 border border-gray-700 rounded focus:outline-none focus:border-white"
              />
            </div>
            <div className="flex items-center justify-between">
              <span
                className="text-xs text-gray-300"
                title="The time to wait between each request.">
                Interval (ms)
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="inline-block w-3 h-3 ml-1 text-gray-500 hover:text-gray-300 cursor-pointer"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </span>
              <input
                type="number"
                min={1}
                value={intervalMs}
                onChange={(e) => {
                  const val = Math.max(
                    1,
                    parseInt(e.target.value) || intervalMsDefault
                  )
                  setIntervalMs(val)
                }}
                className="w-16 px-2 py-1 text-xs bg-gray-900 border border-gray-700 rounded focus:outline-none focus:border-white"
              />
            </div>
            <div className="flex items-center justify-between">
              <span
                className="text-xs text-gray-300"
                title="Filters out duplicate responses when requests return the same data. For every response size that is repeated more than this threshold, only one will be kept.">
                Duplicate Response Filter
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="inline-block w-3 h-3 ml-1 text-gray-500 hover:text-gray-300 cursor-pointer"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </span>
              <input
                type="number"
                min={1}
                value={repeatedSizesThreshold}
                onChange={(e) => {
                  const val = Math.max(
                    1,
                    parseInt(e.target.value) || repeatedSizesThresholdDefault
                  )
                  setRepeatedSizesThreshold(val)
                }}
                className="w-16 px-2 py-1 text-xs bg-gray-900 border border-gray-700 rounded focus:outline-none focus:border-white"
              />
            </div>
          </div>
        </div>

        {/* Wordlists */}
        <div className="flex flex-col gap-2">
          <label
            htmlFor="wordlists"
            className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Wordlists
          </label>

          <textarea
            id="wordlists"
            value={wordlists}
            rows={5}
            onChange={handleWordlistsChange}
            className="w-full border border-gray-700 bg-gray-900 text-gray-100 px-3 py-2 text-xs resize-none focus:outline-none focus:border-white focus:ring-1 focus:ring-white/50"
            placeholder="Enter wordlists here..."
          />

          <div className="text-[11px] text-gray-500">
            {wordlists ? wordlists.split("\n").length : 0} entries
          </div>

          <div className="flex gap-2 mt-1">
            {/* Save */}
            <button
              onClick={handleSaveSettings}
              className="flex items-center justify-center gap-1 px-2 py-1.5 bg-yellow-500/10 text-xs text-yellow-300 rounded-md hover:bg-yellow-500/20 transition">
              <svg
                className="w-4 h-4"
                fill="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                data-name="Layer 1">
                <path d="M20.71,9.29l-6-6a1,1,0,0,0-.32-.21A1.09,1.09,0,0,0,14,3H6A3,3,0,0,0,3,6V18a3,3,0,0,0,3,3H18a3,3,0,0,0,3-3V10A1,1,0,0,0,20.71,9.29ZM9,5h4V7H9Zm6,14H9V16a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1Zm4-1a1,1,0,0,1-1,1H17V16a3,3,0,0,0-3-3H10a3,3,0,0,0-3,3v3H6a1,1,0,0,1-1-1V6A1,1,0,0,1,6,5H7V8A1,1,0,0,0,8,9h6a1,1,0,0,0,1-1V6.41l4,4Z" />
              </svg>
              Save Settings
            </button>

            {/* Reset */}
            <button
              onClick={handleReset}
              className="flex items-center justify-center gap-1 px-2 py-1.5 bg-red-500/10 text-xs text-red-300 rounded-md hover:bg-red-500/20 transition">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 .49-5h-2" />
              </svg>
              Reset
            </button>
            {showSaved && (
              <p className="text-green-500 text-xs mt-2">
                Settings saved successfully!
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-gray-800 bg-gray-900/70 flex justify-end">
        <span className="text-[10px] font-semibold text-gray-500">
          By Adem KOUKI
        </span>
      </div>
    </div>
  )
}

export default Popup
