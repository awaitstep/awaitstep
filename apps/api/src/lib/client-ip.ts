export function getClientIp(req: {
  header: (name: string) => string | undefined
}): string | undefined {
  return (
    req.header('cf-connecting-ip') ??
    req.header('x-real-ip') ??
    req.header('x-forwarded-for')?.split(',')[0]?.trim()
  )
}
