import cssText from "data-text:~style.css"
import type { PlasmoCSConfig } from "plasmo"
import React, { useEffect, useRef, useState } from "react"

import { useStorage } from "@plasmohq/storage/hook"

import { Collapse } from "~collapsed"
import Logo from "~logo"
import { SECRET_PATTERNS } from "~patterns"

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

type MatchResult = {
  type: string
  match: string
  line: number
  context: string
}

const getAllPageJS = async () => {
  try {
    // 1. Collect inline scripts
    const inlineScripts = [
      ...document.querySelectorAll("script:not([src])")
    ].map(
      (s, i) => `/* --- inline script ${i + 1} --- */\n${s.textContent || ""}`
    )

    // 2. Collect external script URLs
    const externalUrls = [...document.querySelectorAll("script[src]")].map(
      (s) => (s as HTMLScriptElement).src
    )

    // 3. Fetch each external script (may fail on CORS)
    const externalTexts = []
    for (const url of externalUrls) {
      try {
        const res = await fetch(url, { credentials: "include" })
        if (!res.ok) {
          externalTexts.push(
            `/* --- ${url} --- FETCH ERROR: ${res.status} ${res.statusText} --- */`
          )
          continue
        }
        const text = await res.text()
        externalTexts.push(`/* --- ${url} --- */\n${text}`)
      } catch (err) {
        externalTexts.push(
          `/* --- ${url} --- FETCH FAILED: ${err.message} --- */`
        )
      }
    }

    // 4. Return all scripts combined
    return [...inlineScripts, ...externalTexts].join("\n\n")
  } catch (err) {
    console.error("❌ Error collecting JS:", err)
    return ""
  }
}

function findSecretsWithContext(jsText: string): MatchResult[] {
  const results: MatchResult[] = []
  const lines = jsText.split(/\r?\n/)

  for (const [name, regex] of Object.entries(SECRET_PATTERNS)) {
    // clone regex so lastIndex doesn't interfere
    const r = new RegExp(
      regex.source,
      regex.flags.includes("g")
        ? regex.flags
        : (regex.flags + "g").replace(/([g])/, "$1")
    )
    let m: RegExpExecArray | null
    while ((m = r.exec(jsText)) !== null) {
      const match = m[0]
      // find line number by counting newlines up to match.index
      const upto = jsText.slice(0, m.index)
      const line = upto.split(/\r?\n/).length
      const startLine = Math.max(0, line - 2)
      const endLine = Math.min(lines.length - 1, line + 1)
      const context = lines.slice(startLine, endLine + 1).join("\n")
      results.push({ type: name, match, line, context })
      // safeguard for zero-length matches
      if (m.index === r.lastIndex) r.lastIndex++
    }
  }

  // dedupe very similar matches
  const unique = new Map<string, MatchResult>()
  for (const r of results) {
    const key = `${r.type}::${r.match}`
    if (!unique.has(key)) unique.set(key, r)
  }

  return Array.from(unique.values()).sort((a, b) => a.line - b.line)
}

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
          if (response.status === 200 || response.status === 401) {
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
  const [minimized, setMinimized] = useState(false)
  const [copied, setCopied] = useState(false)

  // Draggable state
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const dragRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const offset = useRef({ x: 0, y: 0 })
  const [paused, setPaused] = useState(false)
  const [foundSecrets, setFoundSecrets] = useState<MatchResult[]>([])
  const [secretSearch, setSecretSearch] = useState("")
  const [secretTypeFilter, setSecretTypeFilter] = useState("All")

  // Derive unique types for the filter dropdown
  const secretTypes = Array.from(
    new Set(foundSecrets.map((s) => s.type))
  ).sort()

  // Apply filters
  const filteredSecrets = foundSecrets.filter((s) => {
    const matchesSearch =
      secretSearch === "" ||
      s.match.toLowerCase().includes(secretSearch.toLowerCase())
    const matchesType =
      secretTypeFilter === "All" || s.type === secretTypeFilter
    return matchesSearch && matchesType
  })

  // Read batchSize, intervalMs, repeatedSizesThreshold from storage
  const [batchSize] = useStorage<number>(BATCH_SIZE_KEY, 10)
  const [intervalMs] = useStorage<number>(INTERVAL_MS_KEY, 500)
  const [repeatedSizesThreshold] = useStorage<number>(REPEATED_SIZES_KEY, 5)

  // Function to save results to a text file
  const handleSaveResults = () => {
    if (foundUrls.length === 0 && foundSecrets.length === 0) return

    const now = new Date()
    const header = `FlashFuzz Scan Results
Page scanned: ${window.location.href}
Date scanned: ${now.toLocaleString()}

URLs:
URL\tSize (bytes)
--------------------------------`

    const urlsBody = foundUrls
      .map(
        ({ url, size }) =>
          `${window.location.origin}/${url}\t${size ?? "unknown"}`
      )
      .join("\n")

    const secretsHeader = `
Secrets:
Type\tMatch
--------------------------------`

    const secretsBody = foundSecrets
      .map(({ type, match }) => `${type}\t${match}`)
      .join("\n")

    const textContent = `${header}\n${urlsBody}\n${secretsHeader}\n${secretsBody}`

    const blob = new Blob([textContent], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "flashfuzz_results.txt"
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCopyToClipboard = () => {
    if (foundUrls.length === 0 && foundSecrets.length === 0) return

    const header = `FlashFuzz Scan Results
Page scanned: ${window.location.href}
Date scanned: ${new Date().toLocaleString()}
URLs:
URL\tSize (bytes)
--------------------------------`
    const urlsBody = foundUrls
      .map(
        ({ url, size }) =>
          `${window.location.origin}/${url}\t${size ?? "unknown"}`
      )
      .join("\n")
    const secretsHeader = `\nSecrets:\nType\tMatch\n--------------------------------`
    const secretsBody = foundSecrets
      .map(({ type, match }) => `${type}\t${match}`)
      .join("\n")
    const textContent = `${header}\n${urlsBody}\n${secretsHeader}\n${secretsBody}`

    navigator.clipboard
      .writeText(textContent)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000) // show check for 2 seconds
      })
      .catch((err) =>
        console.error("Failed to copy results to clipboard:", err)
      )
  }

  const handleAboutClick = () => {
    // Open a new tab with about info
    window.open("https://github.com/Ademking/FlashFuzz", "_blank")
  }

  // Main effect to run the scans
  useEffect(() => {
    const controller = { paused: false, stopped: false }
    const urls = wordlists.split("\n").filter(Boolean)

    setFoundUrls([])
    setFoundSecrets([]) // reset secrets on each run
    setLoading(true)
    setReqCount(0)

    // URL scanning (existing)
    const runUrlScan = async () => {
      await checkUrlsIncremental(
        wordlists,
        controller,
        batchSize,
        intervalMs,
        repeatedSizesThreshold,
        (urls) => setFoundUrls(urls),
        () => {}, // keep previous behavior
        (done) => setReqCount(done)
      )
    }

    // Secret scanning (new): fetch all page JS and run patterns
    const runSecretScan = async () => {
      try {
        const inlineScripts = [
          ...document.querySelectorAll("script:not([src])")
        ]
        const externalUrls = [...document.querySelectorAll("script[src]")].map(
          (s) => (s as HTMLScriptElement).src
        )

        const scripts = inlineScripts.map((s, i) => ({
          name: `inline-${i + 1}`,
          content: s.textContent || ""
        }))

        for (const url of externalUrls) {
          try {
            const res = await fetch(url, { credentials: "include" })
            const text = res.ok ? await res.text() : `/* ERROR ${res.status} */`
            scripts.push({ name: url, content: text })
          } catch (err) {
            scripts.push({ name: url, content: `/* FETCH ERROR */` })
          }
        }

        let allSecrets: MatchResult[] = []

        for (const script of scripts) {
          if (!script.content) continue
          const secrets = findSecretsWithContext(script.content)
          allSecrets = allSecrets.concat(secrets)
          // Optional: update state incrementally to avoid memory spike
          setFoundSecrets([...allSecrets])
          await new Promise((r) => setTimeout(r, 10)) // yield to browser
        }
      } catch (err) {
        console.error(err)
      }
    }

    // Start both scans (secret scan runs in parallel with URL scan)
    runUrlScan()
    runSecretScan()

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

  // Draggable handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      setPos({
        x: e.clientX - offset.current.x,
        y: e.clientY - offset.current.y
      })
    }
    const handleMouseUp = () => {
      dragging.current = false
    }
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [])

  return (
    <div
      ref={dragRef}
      dir="ltr"
      style={{
        zIndex: 99999999999,
        position: "fixed",
        left: pos.x || undefined,
        top: pos.y || undefined,
        width: minimized ? 160 : 480,
        // fallback to top-right if untouched
        ...(pos.x === 0 && pos.y === 0 ? { top: 12, right: 12 } : {})
      }}
      className={`z-50 text-gray-200 border border-gray-800 rounded-xl shadow-xl bg-gray-900 bg-opacity-95 ${minimized ? "!w-[200px]" : "!w-[480px]"} `}
      role="region"
      aria-label="FlashFuzz overlay">
      {/* Header */}
      <div
        className={`flex items-center gap-2 relative cursor-move select-none ${
          minimized ? "px-4 pt-1 pb-1" : "px-4 pt-3 pb-2"
        }`}
        style={{ userSelect: "none" }}
        onMouseDown={(e) => {
          dragging.current = true
          const rect = dragRef.current?.getBoundingClientRect()
          offset.current = {
            x: e.clientX - (rect?.left ?? 0),
            y: e.clientY - (rect?.top ?? 0)
          }
        }}>
        <span
          className={`flex items-center justify-center rounded ${minimized ? "w-4 h-4" : "w-7 h-7"}`}>
          <Logo />
        </span>
        <span className={`font-semibold ${minimized ? "text-sm" : "text-lg"}`}>
          FlashFuzz
        </span>

        {/* Header buttons container */}
        <div className="absolute top-0 right-0 mt-1 mr-1 flex gap-1">
          {/* Pause / Resume Button */}
          {loading && (
            <button
              aria-label={paused ? "Play" : "Pause"}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-700 focus:outline-none"
              onClick={() => {
                const ctrl = window.flashfuzzController
                if (ctrl) ctrl.paused = !ctrl.paused
                setPaused((p) => !p)
              }}>
              {paused ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 20 20"
                  fill="none"
                  className="text-gray-400">
                  <path d="M6 4L14 10L6 16V4Z" fill="currentColor" />
                </svg>
              ) : (
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
          )}

          {/* Stop Button */}
          {loading && (
            <button
              aria-label="Stop"
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-700 focus:outline-none"
              onClick={() => {
                const ctrl = window.flashfuzzController
                if (ctrl) ctrl.stopped = true
                setLoading(false)
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
          )}

          {/* Minimize / Maximize Button */}
          <button
            aria-label={minimized ? "Maximize" : "Minimize"}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-700 focus:outline-none"
            onClick={() => setMinimized((prev) => !prev)}>
            {minimized ? (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-gray-400">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              </svg>
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-gray-400">
                <line x1="3" y1="12" x2="21" y2="12" />
              </svg>
            )}
          </button>

          {/* Close Button */}
          <button
            aria-label="Close overlay"
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-700 focus:outline-none"
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
      </div>

      {!minimized && (
        <>
          {/* Body */}
          <div className="px-4">
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
                        {size ? `${size} bytes` : "N/A"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Found Secrets Section */}
            {foundSecrets.length > 0 && (
              <>
                <div className="text-xs font-semibold text-gray-400 my-2 text-red-400 flex justify-between items-center">
                  <span>
                    Potential Secrets ({filteredSecrets.length}/
                    {foundSecrets.length})
                  </span>
                  <div className="flex gap-1">
                    {/* Search */}
                    <input
                      type="text"
                      placeholder="Search..."
                      value={secretSearch}
                      onChange={(e) => setSecretSearch(e.target.value)}
                      className="text-[10px] px-1 py-0.5 rounded bg-gray-700 text-gray-200 border border-gray-600 focus:outline-none"
                    />
                    {/* Type Filter */}
                    <select
                      value={secretTypeFilter}
                      onChange={(e) => setSecretTypeFilter(e.target.value)}
                      className="text-[10px] px-1 py-0.5 rounded bg-gray-700 text-gray-200 border border-gray-600 focus:outline-none">
                      <option value="All">All Types</option>
                      {secretTypes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="max-h-[300px] overflow-y-auto rounded bg-gray-800 border border-red-600/50 p-1 mt-2">
                  <ul className="space-y-1">
                    {filteredSecrets.map((s, i) => (
                      <li
                        key={i}
                        className="px-1 py-0.5 rounded hover:bg-red-700/10">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-red-300 font-mono break-all">
                            {s.match}
                          </span>
                          <span className="text-[9px] font-semibold text-red-500 ml-2 font-mono">
                            [{s.type}]
                          </span>
                        </div>
                      </li>
                    ))}
                    {filteredSecrets.length === 0 && (
                      <li className="text-[10px] text-gray-400 italic px-1 py-0.5">
                        No secrets match the filter/search.
                      </li>
                    )}
                  </ul>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 pb-2 pt-2 flex justify-end">
            <span
              className="text-[10px] text-gray-400 font-semibold bg-gray-800 px-2 py-0.5 rounded cursor-pointer hover:bg-gray-700 pr-2 mr-2"
              onClick={handleAboutClick}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                className="inline-block mr-1"
                viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M11 17h2v-6h-2zm1-8q.425 0 .713-.288T13 8t-.288-.712T12 7t-.712.288T11 8t.288.713T12 9m0 13q-2.075 0-3.9-.788t-3.175-2.137T2.788 15.9T2 12t.788-3.9t2.137-3.175T8.1 2.788T12 2t3.9.788t3.175 2.137T21.213 8.1T22 12t-.788 3.9t-2.137 3.175t-3.175 2.138T12 22"
                />
              </svg>
              About FlashFuzz
            </span>
            <span
              className="text-[10px] text-gray-400 font-semibold bg-gray-800 px-2 py-0.5 rounded cursor-pointer hover:bg-gray-700 pr-2 mr-2"
              onClick={handleSaveResults}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="inline-block mr-1"
                width="16"
                height="16"
                viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="m12 16l-5-5l1.4-1.45l2.6 2.6V4h2v8.15l2.6-2.6L17 11zm-6 4q-.825 0-1.412-.587T4 18v-3h2v3h12v-3h2v3q0 .825-.587 1.413T18 20z"
                />
              </svg>
              Save Results
            </span>
            <span
              className="text-[10px] text-gray-400 font-semibold bg-gray-800 px-2 py-0.5 rounded cursor-pointer hover:bg-gray-700"
              onClick={handleCopyToClipboard}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                className="inline-block mr-1"
                viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M20 3h-3.2c-.4-1.2-1.5-2-2.8-2s-2.4.8-2.8 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m-6 0c.6 0 1 .5 1 1s-.5 1-1 1s-1-.5-1-1s.4-1 1-1m2 11H9v-2h7m3-2H9V8h10M4 21h14v2H4c-1.1 0-2-.9-2-2V7h2"
                />
              </svg>
              {copied ? "Copied!" : "Copy Results"}
              {copied ? <span className="text-green-400 ml-1">✅</span> : null}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

const Content = () => {
  const [enabled] = useStorage<boolean>("flashfuzz_enabled", false)
  const [wordlists] = useStorage<string>("flashfuzz_wordlists", "")
  return <>{enabled ? <Main wordlists={wordlists} /> : null}</>
}

export default Content
