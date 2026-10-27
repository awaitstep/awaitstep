import { PageBody, PageIntro } from '../shell/page-intro'

interface PagePlaceholderProps {
  title: string
  /** The canvas boards this page will draw: "Main, EmptyOrg". */
  boards: string
  /** The W1 step that builds it: "P1". */
  step: string
}

/** Stands in for a page until its P-step builds it. The last P-step deletes this. */
export function PagePlaceholder({ title, boards, step }: PagePlaceholderProps) {
  return (
    <PageBody>
      <PageIntro
        title={title}
        description={`Placeholder for ${boards} on the canvas, built in ${step}.`}
      />
    </PageBody>
  )
}
