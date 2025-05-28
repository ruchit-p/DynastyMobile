'use client'

import { useEffect, useState } from 'react'

interface BrowserInfo {
  isSafari: boolean
  isIOS: boolean
  isWebKit: boolean
  supportsCSS: boolean
  userAgent: string
  cssVariableSupport: boolean
  version?: string
  safariClassApplied: boolean
  tailwindLoaded: boolean
  dynastyColorsLoaded: boolean
}

interface CSSTestResults {
  flexSupport: boolean
  cssVariablesSupport: boolean
  dynastyGreenColor: string
  computedBackgroundColor: string
  computedTextColor: string
}

export function SafariDebug() {
  const [browserInfo, setBrowserInfo] = useState<BrowserInfo | null>(null)
  const [cssTests, setCSSTests] = useState<CSSTestResults | null>(null)
  const [consoleOutput, setConsoleOutput] = useState<string[]>([])

  useEffect(() => {
    // Capture console.log outputs
    const originalLog = console.log
    const logs: string[] = []
    
    console.log = (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ')
      logs.push(message)
      setConsoleOutput([...logs])
      originalLog(...args)
    }

    // Browser detection
    const userAgent = navigator.userAgent
    const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent)
    const isIOS = /iPad|iPhone|iPod/.test(userAgent)
    const isWebKit = /WebKit/.test(userAgent)
    const supportsCSS = !!(window.CSS && CSS.supports)
    const cssVariableSupport = supportsCSS ? CSS.supports('color', 'var(--fake-var)') : false
    
    // Get Safari version
    let version: string | undefined
    if (isSafari) {
      const match = userAgent.match(/Version\/(\d+\.\d+)/)
      version = match ? match[1] : 'Unknown'
    }

    // Check if Safari class was applied
    const safariClassApplied = document.documentElement.classList.contains('is-safari')

    setBrowserInfo({
      isSafari,
      isIOS,
      isWebKit,
      supportsCSS,
      userAgent,
      cssVariableSupport,
      version,
      safariClassApplied,
      tailwindLoaded: false,
      dynastyColorsLoaded: false
    })

    // Detailed CSS testing
    const runCSSTests = () => {
      // Test Flexbox
      const flexTestElement = document.createElement('div')
      flexTestElement.className = 'flex'
      flexTestElement.style.visibility = 'hidden'
      flexTestElement.style.position = 'absolute'
      document.body.appendChild(flexTestElement)
      
      const flexComputed = window.getComputedStyle(flexTestElement)
      const flexSupport = flexComputed.display === 'flex'
      
      document.body.removeChild(flexTestElement)

      // Test Dynasty colors
      const colorTestElement = document.createElement('div')
      colorTestElement.className = 'text-dynasty-green'
      colorTestElement.style.visibility = 'hidden'
      colorTestElement.style.position = 'absolute'
      document.body.appendChild(colorTestElement)
      
      const colorComputed = window.getComputedStyle(colorTestElement)
      const dynastyGreenColor = colorComputed.color
      
      document.body.removeChild(colorTestElement)

      // Test background/text colors
      const bodyComputed = window.getComputedStyle(document.body)
      const computedBackgroundColor = bodyComputed.backgroundColor
      const computedTextColor = bodyComputed.color

      setCSSTests({
        flexSupport,
        cssVariablesSupport: cssVariableSupport,
        dynastyGreenColor,
        computedBackgroundColor,
        computedTextColor
      })

      // Update browser info with CSS loading status
      setBrowserInfo(prev => prev ? {
        ...prev,
        tailwindLoaded: flexSupport,
        dynastyColorsLoaded: dynastyGreenColor.includes('20, 86, 45') || dynastyGreenColor === 'rgb(20, 86, 45)' || dynastyGreenColor === '#14562d'
      } : null)
    }

    // Run tests after a delay
    setTimeout(runCSSTests, 200)
    
    // Run tests again after a longer delay to catch late-loading CSS
    setTimeout(runCSSTests, 1000)

    // Cleanup
    return () => {
      console.log = originalLog
    }
  }, [])

  const forceRefresh = () => {
    window.location.reload()
  }

  const clearCache = () => {
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => {
          caches.delete(name)
        })
      })
    }
    localStorage.clear()
    sessionStorage.clear()
    window.location.reload()
  }

  if (!browserInfo) {
    return <div className="p-4 bg-gray-100 text-sm">Loading browser info...</div>
  }

  return (
    <div className="fixed bottom-4 right-4 max-w-md p-4 bg-white border-2 border-red-500 rounded-lg shadow-xl text-xs z-50 max-h-96 overflow-y-auto">
      <h3 className="font-bold mb-2 text-red-600">🚨 Safari Debug Dashboard</h3>
      
      <div className="space-y-2">
        {/* Browser Info */}
        <div className="bg-blue-50 p-2 rounded">
          <h4 className="font-semibold">Browser Detection</h4>
          <div><strong>Safari:</strong> {browserInfo.isSafari ? `✅ Yes (${browserInfo.version})` : '❌ No'}</div>
          <div><strong>iOS:</strong> {browserInfo.isIOS ? '✅ Yes' : '❌ No'}</div>
          <div><strong>WebKit:</strong> {browserInfo.isWebKit ? '✅ Yes' : '❌ No'}</div>
          <div><strong>Safari Class:</strong> {browserInfo.safariClassApplied ? '✅ Applied' : '❌ Missing'}</div>
        </div>

        {/* CSS Support */}
        <div className="bg-green-50 p-2 rounded">
          <h4 className="font-semibold">CSS Support</h4>
          <div><strong>CSS.supports API:</strong> {browserInfo.supportsCSS ? '✅ Yes' : '❌ No'}</div>
          <div><strong>CSS Variables:</strong> {browserInfo.cssVariableSupport ? '✅ Supported' : '❌ Not Supported'}</div>
          <div><strong>Tailwind Loaded:</strong> {browserInfo.tailwindLoaded ? '✅ Yes' : '❌ No'}</div>
          <div><strong>Dynasty Colors:</strong> {browserInfo.dynastyColorsLoaded ? '✅ Loaded' : '❌ Not Loaded'}</div>
        </div>

        {/* CSS Test Results */}
        {cssTests && (
          <div className="bg-yellow-50 p-2 rounded">
            <h4 className="font-semibold">CSS Test Results</h4>
            <div><strong>Flex Support:</strong> {cssTests.flexSupport ? '✅ Working' : '❌ Failed'}</div>
            <div><strong>Dynasty Green:</strong> <span style={{ color: cssTests.dynastyGreenColor }}>{cssTests.dynastyGreenColor}</span></div>
            <div><strong>Background:</strong> <span style={{ backgroundColor: cssTests.computedBackgroundColor, padding: '2px' }}>{cssTests.computedBackgroundColor}</span></div>
            <div><strong>Text Color:</strong> <span style={{ color: cssTests.computedTextColor }}>{cssTests.computedTextColor}</span></div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="bg-gray-50 p-2 rounded space-y-1">
          <button 
            onClick={forceRefresh}
            className="w-full bg-blue-500 text-white p-1 rounded text-xs hover:bg-blue-600"
          >
            🔄 Force Refresh
          </button>
          <button 
            onClick={clearCache}
            className="w-full bg-red-500 text-white p-1 rounded text-xs hover:bg-red-600"
          >
            🗑️ Clear Cache & Refresh
          </button>
        </div>

        {/* Console Output */}
        <details className="bg-gray-50 p-2 rounded">
          <summary className="cursor-pointer font-semibold">Console Output ({consoleOutput.length})</summary>
          <div className="mt-2 max-h-32 overflow-y-auto">
            {consoleOutput.slice(-10).map((log, index) => (
              <div key={index} className="text-xs font-mono bg-gray-100 p-1 mb-1 rounded">
                {log}
              </div>
            ))}
          </div>
        </details>

        {/* User Agent */}
        <details className="bg-gray-50 p-2 rounded">
          <summary className="cursor-pointer font-semibold">User Agent</summary>
          <div className="mt-1 text-xs break-all bg-white p-1 rounded border">
            {browserInfo.userAgent}
          </div>
        </details>
      </div>
    </div>
  )
} 