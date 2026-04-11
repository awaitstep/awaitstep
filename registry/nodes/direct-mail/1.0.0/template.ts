import Dm, * as $Dm from '@alicloud/dm20151123'
import * as $OpenApi from '@alicloud/openapi-client'

export default async function (ctx) {
  const config = new $OpenApi.Config({
    accessKeyId: ctx.env.ALICLOUD_ACCESS_KEY_ID,
    accessKeySecret: ctx.env.ALICLOUD_ACCESS_KEY_SECRET,
    regionId: ctx.config.regionId,
    endpoint: 'dm.aliyuncs.com',
  })
  const client = new Dm(config)

  const request = new $Dm.SingleSendMailRequest({
    accountName: ctx.config.accountName,
    addressType: Number(ctx.config.addressType),
    replyToAddress: ctx.config.replyToAddress !== 'false',
    toAddress: ctx.config.toAddress,
    subject: ctx.config.subject,
    ...(ctx.config.htmlBody ? { htmlBody: ctx.config.htmlBody } : {}),
    ...(ctx.config.textBody ? { textBody: ctx.config.textBody } : {}),
  })

  const response = await client.singleSendMail(request)
  return {
    requestId: response.body?.requestId ?? null,
    envId: response.body?.envId ?? null,
    data: response.body,
  }
}
