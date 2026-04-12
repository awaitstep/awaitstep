export default async function (ctx) {
  const accessKeyId = ctx.env.ALICLOUD_ACCESS_KEY_ID
  const accessKeySecret = ctx.env.ALICLOUD_ACCESS_KEY_SECRET

  function percentEncode(str: string): string {
    return encodeURIComponent(str)
      .replace(/!/g, '%21')
      .replace(/'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/\*/g, '%2A')
  }

  async function hmacSha1(key: string, data: string): Promise<string> {
    const encoder = new TextEncoder()
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(key),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign'],
    )
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data))
    return btoa(String.fromCharCode(...new Uint8Array(signature)))
  }

  const reqParams: Record<string, string> = {
    Action: 'SingleSendMail',
    Format: 'JSON',
    Version: '2015-11-23',
    AccessKeyId: accessKeyId,
    SignatureMethod: 'HMAC-SHA1',
    SignatureVersion: '1.0',
    SignatureNonce: crypto.randomUUID(),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    AccountName: ctx.config.accountName,
    AddressType: ctx.config.addressType,
    ReplyToAddress: ctx.config.replyToAddress !== 'false' ? 'true' : 'false',
    ToAddress: ctx.config.toAddress,
    Subject: ctx.config.subject,
    RegionId: ctx.config.regionId,
  }

  if (ctx.config.htmlBody) reqParams.HtmlBody = ctx.config.htmlBody
  if (ctx.config.textBody) reqParams.TextBody = ctx.config.textBody

  const sortedKeys = Object.keys(reqParams).sort()
  const canonicalQuery = sortedKeys
    .map((k) => `${percentEncode(k)}=${percentEncode(reqParams[k])}`)
    .join('&')

  const stringToSign = `POST&${percentEncode('/')}&${percentEncode(canonicalQuery)}`
  const signature = await hmacSha1(accessKeySecret + '&', stringToSign)
  reqParams.Signature = signature

  const body = Object.entries(reqParams)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

  const endpoint =
    ctx.config.regionId === 'cn-hangzhou'
      ? 'dm.aliyuncs.com'
      : `dm.${ctx.config.regionId}.aliyuncs.com`

  const response = await fetch(`https://${endpoint}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const data = (await response.json()) as Record<string, unknown>

  if (!response.ok) {
    const code = data.Code ?? 'Unknown'
    const message = data.Message ?? response.statusText
    throw new Error(`DirectMail API error (${code}): ${message}`)
  }

  return {
    requestId: data.RequestId ?? null,
    envId: data.EnvId ?? null,
    data,
  }
}
