import { createContext, useContext, type AnchorHTMLAttributes, type ReactNode } from 'react'

export interface ShellLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string
}

export type ShellLinkComponent = (props: ShellLinkProps) => ReactNode

function AnchorLink(props: ShellLinkProps) {
  return <a {...props} />
}

const ShellLinkContext = createContext<ShellLinkComponent>(AnchorLink)

interface ShellLinkProviderProps {
  link: ShellLinkComponent
  children: ReactNode
}

/**
 * Sets the component every in-app shell link renders through. Shell
 * components stay router-free; the route tree provides a router-aware link
 * here. Without a provider, links are plain anchors.
 */
export function ShellLinkProvider({ link, children }: ShellLinkProviderProps) {
  return <ShellLinkContext.Provider value={link}>{children}</ShellLinkContext.Provider>
}

/** An in-app link rendered through the component set by `ShellLinkProvider`. */
export function ShellLink(props: ShellLinkProps) {
  const Link = useContext(ShellLinkContext)
  return <Link {...props} />
}
