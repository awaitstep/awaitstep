/** What fills an org's tile: its uploaded logo, or its initial. Decorative. */
export function OrgMark({ initial, logo }: { initial: string; logo?: string | null }) {
  if (logo) return <img src={logo} alt="" className="size-full rounded-[inherit] object-cover" />
  return <>{initial}</>
}
