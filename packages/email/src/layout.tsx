import {
  Html,
  Head,
  Body,
  Preview,
  Container,
  Section,
  Text,
  Link,
  Tailwind,
  pixelBasedPreset,
} from '@react-email/components'

interface LayoutProps {
  preview?: string
  children: React.ReactNode
}

export default function Layout({ children, preview }: LayoutProps) {
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
                brand: '#111',
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
            <Section className="h-1" style={{ backgroundColor: '#111' }} />
            <Section className="px-10 pt-8 pb-10">{children}</Section>
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
