/** Hands the viewer a file made in the browser, e.g. a CSV of the runs on screen. */
export function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadJsonFile(filename: string, content: string) {
  downloadTextFile(filename, content, 'application/json')
}
