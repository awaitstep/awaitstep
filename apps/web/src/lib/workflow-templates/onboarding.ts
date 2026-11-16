import { HeartHandshake, MailPlus, UserPlus } from 'lucide-react'
import type { WorkflowTemplate } from './types'
import {
  branch,
  edge,
  sendEmail,
  sleep,
  slackMessage,
  step,
  waitEdges,
  waitForEvent,
  workflow,
} from './template-nodes'

const newUser: WorkflowTemplate = {
  id: 'new-user-onboarding',
  name: 'New user onboarding',
  description: 'Welcome a new user, then send tips or a nudge depending on whether they’re set up.',
  icon: UserPlus,
  category: 'onboarding',
  ir: workflow(
    'New user onboarding',
    'Runs when someone signs up.',
    [
      sendEmail('send_welcome', [300, 0], {
        to: '{{event.payload.email}}',
        subject: 'Welcome aboard',
        html: '<p>Here’s how to get started.</p>',
      }),
      sleep('wait_one_day', [300, 120], '1 day'),
      step(
        'check_activation',
        [300, 240],
        `  // TODO: look up whether the user has done the key action in your app.
  return { activated: false, userId: event.payload.userId };`,
      ),
      branch(
        'is_activated',
        [300, 360],
        [
          { label: 'activated', condition: '{{check_activation.activated}} === true' },
          { label: 'not_activated', condition: '' },
        ],
      ),
      sendEmail('send_tips', [150, 480], {
        to: '{{event.payload.email}}',
        subject: 'Three tips for your first week',
        html: '<p>You’re set up. Here’s what to try next.</p>',
      }),
      sendEmail('send_nudge', [450, 480], {
        to: '{{event.payload.email}}',
        subject: 'Need a hand getting started?',
        html: '<p>Finish setting up in a couple of minutes.</p>',
      }),
    ],
    [
      edge('send_welcome', 'wait_one_day'),
      edge('wait_one_day', 'check_activation'),
      edge('check_activation', 'is_activated'),
      edge('is_activated', 'send_tips', 'activated'),
      edge('is_activated', 'send_nudge', 'not_activated'),
    ],
  ),
}

const waitForAccept = waitForEvent('wait_for_accept', [300, 0], {
  eventType: 'invite-accepted',
  timeout: '2 days',
  onEvent: 'invite_accepted',
  onTimeout: 'send_reminder',
})

const inviteReminder: WorkflowTemplate = {
  id: 'team-invite-reminder',
  name: 'Team invite reminder',
  description: 'Remind an invited teammate if they haven’t joined after 2 days.',
  icon: MailPlus,
  category: 'onboarding',
  ir: workflow(
    'Team invite reminder',
    'Runs when someone is invited to a team.',
    [
      waitForAccept,
      step(
        'invite_accepted',
        [150, 120],
        '  return { status: "accepted", inviteId: event.payload.inviteId };',
      ),
      sendEmail('send_reminder', [450, 120], {
        to: '{{event.payload.email}}',
        subject: 'Your team is waiting for you',
        html: '<p>Accept your invite to join the team.</p>',
      }),
    ],
    waitEdges(waitForAccept),
  ),
}

const waitForReturn = waitForEvent('wait_for_return', [300, 120], {
  eventType: 'user-active',
  timeout: '7 days',
  onEvent: 'user_returned',
  onTimeout: 'flag_for_cs',
})

const winBack: WorkflowTemplate = {
  id: 'win-back',
  name: 'Win back inactive users',
  description: 'Email an inactive user, then flag them to your team if they don’t come back.',
  icon: HeartHandshake,
  category: 'onboarding',
  ir: workflow(
    'Win back inactive users',
    'Runs when a user goes quiet.',
    [
      sendEmail('send_win_back', [300, 0], {
        to: '{{event.payload.email}}',
        subject: 'We miss you',
        html: '<p>Here’s what’s new since you last visited.</p>',
      }),
      waitForReturn,
      step(
        'user_returned',
        [150, 240],
        '  return { status: "returned", userId: event.payload.userId };',
      ),
      slackMessage(
        'flag_for_cs',
        [450, 240],
        '#customer-success',
        '{{event.payload.email}} hasn’t come back after a win-back email.',
      ),
    ],
    [edge('send_win_back', 'wait_for_return'), ...waitEdges(waitForReturn)],
  ),
}

export const onboardingTemplates: WorkflowTemplate[] = [newUser, inviteReminder, winBack]
