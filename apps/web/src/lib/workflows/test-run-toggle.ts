import { Play } from 'lucide-react'
import type { TestSession } from '../api-client'
import type { TopBarToggle } from '../../components/workflows/unified-top-bar'

interface TestRunToggleInput {
  /** The workflow's test session, if it has one. */
  status: TestSession['status'] | null
  /** A start was asked for and has not answered yet. */
  starting: boolean
  /** The test run panel is on screen. */
  open: boolean
  /** Why a test run cannot start here (nothing saved yet, or a view-only role); the button is off and says so. */
  blockedReason?: string | null
  /** Shows the panel and starts a session when none is live. */
  onStart: () => void
  /** Shows or hides the panel of a live session. */
  onToggle: () => void
}

/** A session that is coming up or running: pressing the button must not start another. */
export function testRunIsLive(status: TestSession['status'] | null, starting: boolean): boolean {
  return starting || status === 'starting' || status === 'running'
}

/**
 * The test run button both editing surfaces show in the top bar. With no live
 * session it starts one; with one it shows or hides its panel.
 */
export function testRunToggle(input: TestRunToggleInput): TopBarToggle {
  const live = testRunIsLive(input.status, input.starting)
  if (input.blockedReason) {
    return {
      id: 'test-run',
      label: 'Start test run',
      icon: Play,
      pressed: false,
      disabled: true,
      title: input.blockedReason,
      onClick: input.onStart,
    }
  }
  return {
    id: 'test-run',
    label: live ? 'Test run' : 'Start test run',
    icon: Play,
    // A panel left open on a finished session is not this button's state: pressing starts a run.
    pressed: live && input.open,
    title: live ? `${input.open ? 'Hide' : 'Show'} test run` : 'Start test run',
    onClick: live ? input.onToggle : input.onStart,
  }
}
