import cssText from "data-text:~style.css"
import type { PlasmoCSConfig } from "plasmo"
import React, { useEffect, useRef, useState } from "react"

import { useStorage } from "@plasmohq/storage/hook"

import Logo from "~logo"

const BATCH_SIZE_KEY = "flashfuzz_batch_size"
const INTERVAL_MS_KEY = "flashfuzz_interval_ms"
const REPEATED_SIZES_KEY = "flashfuzz_repeated_sizes_threshold"

declare global {
  interface Window {
    flashfuzzPaused?: boolean
    flashfuzzController?: { paused: boolean; stopped: boolean }
  }
}

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: false,
  run_at: "document_idle"
}

type FoundUrl = { url: string; size: number }

const checkUrlsIncremental = async (
  wordlists: string,
  controller: { paused: boolean; stopped: boolean },
  batchSize: number,
  intervalMs: number,
  repeatedSizesThreshold: number,
  onResult: (urls: FoundUrl[]) => void,
  onDone: () => void,
  onProgress: (done: number, total: number) => void
) => {
  let foundUrls: FoundUrl[] = []
  const urls = wordlists.split("\n").filter(Boolean)
  let requestsDone = 0
  const total = urls.length

  for (let i = 0; i < total; i += batchSize) {
    // Handle stop
    if (controller.stopped) break

    // Handle pause
    while (controller.paused && !controller.stopped) {
      await new Promise((resolve) => setTimeout(resolve, 300))
    }

    const batch = urls.slice(i, i + batchSize)
    await Promise.all(
      batch.map(async (url) => {
        if (controller.stopped) return
        try {
          const response = await fetch(window.location.origin + "/" + url)
          if (response.status === 200) {
            let size = parseInt(response.headers.get("content-length") || "")
            if (!size || isNaN(size)) {
              const blob = await response.clone().blob()
              size = blob.size
            }
            foundUrls.push({ url, size })
          }
        } catch {
        } finally {
          requestsDone++
          onProgress(requestsDone, total)
        }
      })
    )

    const sizeCount: Record<number, number> = {}
    foundUrls.forEach(({ size }) => {
      if (size) sizeCount[size] = (sizeCount[size] || 0) + 1
    })
    const repeatedSizes = Object.entries(sizeCount)
      .filter(([_, count]) => count > repeatedSizesThreshold)
      .map(([size]) => Number(size))
    const filtered = foundUrls.filter(
      ({ size }) => !repeatedSizes.includes(size)
    )
    onResult(filtered)

    if (i + batchSize < total && !controller.stopped) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }

  onDone()
}

export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText.replaceAll(":root", ":host(plasmo-csui)")
  return style
}

const Main = ({ wordlists }) => {
  const [foundUrls, setFoundUrls] = useState<FoundUrl[]>([])
  const [loading, setLoading] = useState(true)
  const shouldRunRef = useRef(true)
  const [reqCount, setReqCount] = useState(0)
  const totalRequests = wordlists.split("\n").length
  const [visible, setVisible] = useState(true)
  const [paused, setPaused] = useState(false)

  // Read batchSize, intervalMs, repeatedSizesThreshold from storage
  const [batchSize] = useStorage<number>(BATCH_SIZE_KEY, 10)
  const [intervalMs] = useStorage<number>(INTERVAL_MS_KEY, 500)
  const [repeatedSizesThreshold] = useStorage<number>(REPEATED_SIZES_KEY, 5)

  // Function to save results to a text file
  const handleSaveResults = () => {
    if (foundUrls.length === 0) return

    const now = new Date()
    const header = `FlashFuzz Scan Results
Page scanned: ${window.location.href}
Date scanned: ${now.toLocaleString()}

URL\tSize (bytes)
--------------------------------`

    // Prepare the body with found URLs
    const body = foundUrls
      .map(
        ({ url, size }) =>
          `${window.location.origin}/${url}\t${size ?? "unknown"}`
      )
      .join("\n")

    const textContent = `${header}\n${body}`

    // Create a blob and URL
    const blob = new Blob([textContent], { type: "text/plain" })
    const url = URL.createObjectURL(blob)

    // Trigger download
    const a = document.createElement("a")
    a.href = url
    a.download = "flashfuzz_results.txt"
    a.click()

    // Cleanup
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    const controller = { paused: false, stopped: false }
    const urls = wordlists.split("\n").filter(Boolean)

    setFoundUrls([])
    setLoading(true)
    setReqCount(0)

    const runScan = async () => {
      await checkUrlsIncremental(
        wordlists,
        controller,
        batchSize,
        intervalMs,
        repeatedSizesThreshold,
        (urls) => setFoundUrls(urls),
        () => {}, // Remove setLoading(false) from here
        (done) => setReqCount(done)
      )
    }

    runScan()

    // Store controller so buttons can access it
    window.flashfuzzController = controller

    return () => {
      controller.stopped = true
    }
  }, [wordlists, batchSize, intervalMs, repeatedSizesThreshold])

  // Only set loading to false when scan is truly finished
  useEffect(() => {
    const ctrl = window.flashfuzzController
    if (reqCount >= totalRequests || (ctrl && ctrl.stopped)) {
      setLoading(false)
    }
  }, [reqCount, totalRequests])

  // Overlay is always shown, even if there are no results
  if (!visible) return null

  return (
    <div
      className="fixed top-3 right-3 z-50 w-[280px] max-w-sm text-gray-200 border border-gray-800 rounded-xl shadow-xl bg-gray-900 bg-opacity-95"
      role="region"
      aria-label="FlashFuzz overlay">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-1 relative">
        <span className="flex items-center justify-center w-7 h-7 rounded bg-gray-800">
          <Logo />
        </span>
        <span className="text-base font-bold tracking-wide text-gray-400">
          FlashFuzz
        </span>
        {/* Control Buttons — only visible while scanning */}
        {loading && (
          <>
            {/* Pause / Resume Button */}
            <button
              aria-label={paused ? "Play" : "Pause"}
              className="absolute top-0 right-12 mt-1 w-6 h-6 flex items-center justify-center rounded hover:bg-gray-700 focus:outline-none"
              onClick={() => {
                const ctrl = window.flashfuzzController
                if (ctrl) ctrl.paused = !ctrl.paused
                setPaused((p) => !p)
              }}>
              {paused ? (
                // ▶ Play icon
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 20 20"
                  fill="none"
                  className="text-gray-400">
                  <path d="M6 4L14 10L6 16V4Z" fill="currentColor" />
                </svg>
              ) : (
                // ⏸ Pause icon
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 20 20"
                  fill="none"
                  className="text-gray-400">
                  <rect x="5" y="4" width="3" height="12" fill="currentColor" />
                  <rect
                    x="12"
                    y="4"
                    width="3"
                    height="12"
                    fill="currentColor"
                  />
                </svg>
              )}
            </button>

            {/* Stop Button */}
            <button
              aria-label="Stop"
              className="absolute top-0 right-6 mt-1 w-6 h-6 flex items-center justify-center rounded hover:bg-red-700 focus:outline-none"
              onClick={() => {
                const ctrl = window.flashfuzzController
                if (ctrl) ctrl.stopped = true
                setLoading(false)
                // Do NOT hide overlay here; only hide on Close button
              }}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="none"
                className="text-red-400">
                <rect x="5" y="5" width="10" height="10" fill="currentColor" />
              </svg>
            </button>
          </>
        )}

        {/* Close Button */}
        <button
          aria-label="Close overlay"
          className="absolute top-0 right-0 mt-1 mr-1 w-6 h-6 flex items-center justify-center rounded hover:bg-gray-700 focus:outline-none"
          onClick={() => setVisible(false)}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-gray-400">
            <path
              d="M6 6L14 14M6 14L14 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="px-4 pb-2">
        {loading ? (
          <div className="flex flex-col items-center py-2">
            <span className="text-xs font-medium text-gray-400 mb-1">
              {paused ? "Paused" : "Scanning..."}
            </span>
            <span className="text-[10px] text-yellow-200">
              {reqCount}/{totalRequests} requests
            </span>
            <div
              className={`w-full h-1 mt-2 rounded-full bg-gradient-to-r from-gray-400/25 via-yellow-500 to-gray-400/25 ${paused ? "" : "animate-pulse"}`}
            />
          </div>
        ) : (
          <>
            <div className="text-xs font-semibold text-gray-400 mb-1">
              {foundUrls.length === 0 ? (
                <span>No URLs found</span>
              ) : (
                <span>Found URLs</span>
              )}{" "}
              <span className="text-gray-200">
                ({foundUrls.length}/{totalRequests})
              </span>
              :
            </div>
          </>
        )}

        {foundUrls.length > 0 && (
          <div className="max-h-[120px] overflow-y-auto rounded bg-gray-800 border border-gray-400/20 p-1 mt-1">
            <ul className="space-y-1">
              {foundUrls.map(({ url, size }) => (
                <li
                  key={url}
                  className="flex items-center justify-between px-1 py-0.5 rounded hover:bg-gray-400/10 transition-colors">
                  <a
                    href={window.location.origin + "/" + url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 underline font-mono text-[11px] hover:text-yellow-200 transition-colors">
                    {url}
                  </a>
                  <span className="text-yellow-200 ml-2 text-[10px] font-mono">
                    {size ? `${size} bytes` : "size unknown"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 pb-2 pt-1 flex justify-end">
        <span
          className="text-[10px] text-gray-400 font-semibold bg-gray-800 px-2 py-0.5 rounded cursor-pointer hover:bg-gray-700"
          onClick={handleSaveResults}>
          Save Results
        </span>
      </div>
    </div>
  )
}

const Content = () => {
  const [enabled] = useStorage<boolean>("flashfuzz_enabled", false)
  const [wordlists] = useStorage<string>("flashfuzz_wordlists", "")
  return <>{enabled ? <Main wordlists={wordlists} /> : null}</>
}

export default Content
