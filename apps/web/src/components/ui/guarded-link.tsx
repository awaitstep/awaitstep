import { useNavigate, type NavigateOptions } from '@tanstack/react-router'
import { type ReactNode, type MouseEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { useSheetStore } from '../../stores/sheet-store'

interface GuardedLinkProps {
  requirement: 'org' | 'project'
  nav: NavigateOptions
  children: ReactNode
  className?: string
}

export function GuardedLink({ requirement, nav, children, className, ...rest }: GuardedLinkProps) {
  const navigate = useNavigate()
  const guardAction = useSheetStore((s) => s.guardAction)

  const handleClick = () => guardAction(requirement, () => navigate(nav))

  function onClick(e: MouseEvent) {
    e.preventDefault()
    handleClick()
  }

  return (
    <Link {...nav} onClick={onClick} className={className} {...rest}>
      {children}
    </Link>
  )
}
