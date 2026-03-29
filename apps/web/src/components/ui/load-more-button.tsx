import { Loader2 } from 'lucide-react'
import { Button } from './button'

interface LoadMoreButtonProps {
  hasMore: boolean
  loading: boolean
  onClick: () => void
}

export function LoadMoreButton({ hasMore, loading, onClick }: LoadMoreButtonProps) {
  if (!hasMore) return null
  return (
    <div className="mt-4 flex justify-center">
      <Button variant="ghost" size="sm" className="text-xs" disabled={loading} onClick={onClick}>
        {loading && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
        Load more
      </Button>
    </div>
  )
}
