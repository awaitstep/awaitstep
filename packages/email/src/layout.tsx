import {
  Html,
  Head,
  Body,
  Preview,
  Container,
  Section,
  Text,
  Link,
  Img,
  Tailwind,
  pixelBasedPreset,
} from '@react-email/components'

interface LayoutProps {
  preview?: string
  appUrl?: string
  children: React.ReactNode
}

export default function Layout({ children, preview, appUrl }: LayoutProps) {
  const logoUrl = appUrl ? `${appUrl}/logo.png` : 'https://awaitstep.dev/logo.png'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      {preview && <Preview>{preview}</Preview>}
      <Tailwind
        config={{
          presets: [pixelBasedPreset],
          theme: {
            extend: {
              colors: {
                brand: '#34d399',
              },
            },
          },
        }}
      >
        <Body className="min-w-[300px] bg-gray-50 text-gray-600 py-10 font-sans">
          <Container
            className="max-w-[480px] mx-auto bg-white rounded-lg"
            style={{ border: '1px solid #e5e7eb' }}
          >
            <Section className="h-1" style={{ backgroundColor: '#34d399' }} />
            <Section className="px-10 pt-8 pb-10">
              <Img src={logoUrl} width="60" height="28" alt="AwaitStep" className="mb-6" />
              {children}
            </Section>
          </Container>
          <Text className="text-center text-xs text-gray-400 mt-6">
            &copy; {new Date().getFullYear()}{' '}
            <Link className="text-gray-400 no-underline" href="https://awaitstep.dev">
              AwaitStep
            </Link>
          </Text>
        </Body>
      </Tailwind>
    </Html>
  )
}
