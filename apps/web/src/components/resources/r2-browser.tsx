import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Folder, File, ChevronRight } from 'lucide-react'

interface R2BrowserProps {
  connectionId: string
}

export function R2Browser({ connectionId }: R2BrowserProps) {
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null)
  const [prefix, setPrefix] = useState('')

  function handleBucketSelect(bucketName: string) {
    setSelectedBucket(bucketName)
    setPrefix('')
  }

  const { data: buckets, isLoading: bucketsLoading } = useQuery({
    queryKey: ['r2-buckets', connectionId],
    queryFn: () =>
      fetch(`/api/resources/r2/buckets?connectionId=${connectionId}`, { credentials: 'include' })
        .then((r) => r.json()),
    enabled: !!connectionId,
  })

  const { data: objectsResult, isLoading: objectsLoading } = useQuery({
    queryKey: ['r2-objects', connectionId, selectedBucket, prefix],
    queryFn: () => {
      const params = new URLSearchParams({ connectionId })
      if (prefix) params.set('prefix', prefix)
      return fetch(`/api/resources/r2/buckets/${selectedBucket}/objects?${params}`, { credentials: 'include' })
        .then((r) => r.json())
    },
    enabled: !!selectedBucket,
  })

  const navigateToFolder = (folderPrefix: string) => {
    setPrefix(folderPrefix)
  }

  // Group objects into folders and files
  const folders = new Set<string>()
  const files: Array<{ key: string; size: number; uploaded: string }> = []

  if (objectsResult?.objects) {
    for (const obj of objectsResult.objects) {
      const relativePath = prefix ? obj.key.slice(prefix.length) : obj.key
      const slashIndex = relativePath.indexOf('/')
      if (slashIndex >= 0) {
        folders.add(prefix + relativePath.slice(0, slashIndex + 1))
      } else {
        files.push(obj)
      }
    }
  }

  return (
    <div className="flex h-full gap-4">
      {/* Bucket list */}
      <div className="w-56 shrink-0 space-y-1">
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">Buckets</h3>
        {bucketsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {buckets?.map((bucket: { name: string; creation_date: string }) => (
          <button
            key={bucket.name}
            onClick={() => handleBucketSelect(bucket.name)}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              selectedBucket === bucket.name ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
            }`}
          >
            {bucket.name}
          </button>
        ))}
      </div>

      {/* Object browser */}
      <div className="flex-1 space-y-3">
        {selectedBucket && (
          <>
            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-sm">
              <button
                onClick={() => setPrefix('')}
                className="text-primary hover:underline"
              >
                {selectedBucket}
              </button>
              {prefix && prefix.split('/').filter(Boolean).map((part, i, arr) => (
                <span key={i} className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <button
                    onClick={() => navigateToFolder(arr.slice(0, i + 1).join('/') + '/')}
                    className="text-primary hover:underline"
                  >
                    {part}
                  </button>
                </span>
              ))}
            </div>

            {objectsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

            <div className="space-y-0.5">
              {Array.from(folders).map((folder) => (
                <button
                  key={folder}
                  onClick={() => navigateToFolder(folder)}
                  className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                >
                  <Folder className="h-4 w-4 text-amber-400" />
                  <span>{prefix ? folder.slice(prefix.length) : folder}</span>
                </button>
              ))}

              {files.map((file) => (
                <div
                  key={file.key}
                  className="flex items-center justify-between rounded px-3 py-1.5 text-sm hover:bg-muted"
                >
                  <div className="flex items-center gap-2">
                    <File className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono text-xs">{prefix ? file.key.slice(prefix.length) : file.key}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatSize(file.size)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}
