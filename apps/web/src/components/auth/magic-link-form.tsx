import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '../ui/button'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { clock, looksLikeEmail } from './sign-in-problem'

export const EMAIL_INVALID = 'Enter a valid email address, like you@company.com.'

const magicLinkSchema = z.object({
  email: z.string().refine(looksLikeEmail, EMAIL_INVALID),
})

type MagicLinkValues = z.infer<typeof magicLinkSchema>

interface MagicLinkFormProps {
  /** A link is being requested. */
  sending: boolean
  /** Seconds until another link may be asked for; 0 when it may be now. */
  lockedFor: number
  onSend: (email: string) => void
}

/**
 * The work email and its button. The field is left to the browser (not
 * held in React state), so what was typed or autofilled before the page
 * finished loading still counts; the button waits for an address.
 */
export function MagicLinkForm({ sending, lockedFor, onSend }: MagicLinkFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<MagicLinkValues>({ resolver: zodResolver(magicLinkSchema), mode: 'onTouched' })
  const locked = lockedFor > 0

  function send(values: MagicLinkValues) {
    if (!locked) onSend(values.email.trim())
  }

  return (
    <form onSubmit={handleSubmit(send)} noValidate className="flex flex-col gap-3.5">
      <FormField label="Work email" error={errors.email?.message}>
        <Input
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
          {...register('email')}
        />
      </FormField>
      <Button type="submit" disabled={sending || locked || !isValid} className="w-full">
        {locked
          ? `Try again in ${clock(lockedFor)}`
          : sending
            ? 'Sending…'
            : 'Email me a sign-in link'}
      </Button>
      <p className="text-2xs text-center text-muted-foreground">
        New here? Signing in creates your account.
      </p>
    </form>
  )
}
