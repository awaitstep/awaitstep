import { sql } from 'drizzle-orm'
import { pgTable, text, boolean, index } from 'drizzle-orm/pg-core'
import { isoTimestamp } from './iso-timestamp.js'

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    createdAt: isoTimestamp('created_at')
      .notNull()
      .default(sql`now()`),
    updatedAt: isoTimestamp('updated_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => [index('idx_user_email').on(table.email)],
)

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: isoTimestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: isoTimestamp('created_at').notNull(),
    updatedAt: isoTimestamp('updated_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    activeOrganizationId: text('active_organization_id'),
  },
  (table) => [
    index('idx_session_user_id').on(table.userId),
    index('idx_session_token').on(table.token),
  ],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: isoTimestamp('access_token_expires_at'),
    refreshTokenExpiresAt: isoTimestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: isoTimestamp('created_at').notNull(),
    updatedAt: isoTimestamp('updated_at').notNull(),
  },
  (table) => [index('idx_account_user_id').on(table.userId)],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: isoTimestamp('expires_at').notNull(),
    createdAt: isoTimestamp('created_at').default(sql`now()`),
    updatedAt: isoTimestamp('updated_at').default(sql`now()`),
  },
  (table) => [index('idx_verification_identifier').on(table.identifier)],
)

export const organization = pgTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  metadata: text('metadata'),
  createdAt: isoTimestamp('created_at')
    .notNull()
    .default(sql`now()`),
})

export const member = pgTable(
  'member',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    createdAt: isoTimestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index('idx_member_user_id').on(table.userId),
    index('idx_member_org_id').on(table.organizationId),
  ],
)

export const invitation = pgTable(
  'invitation',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    role: text('role'),
    status: text('status').notNull(),
    expiresAt: isoTimestamp('expires_at').notNull(),
    createdAt: isoTimestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => [index('idx_invitation_org_id').on(table.organizationId)],
)
