import { sqliteTable, text, integer, blob, index } from 'drizzle-orm/sqlite-core'

// Uploaded images: a profile photo or an organization logo. The owner's
// column (`user.image`, `organization.logo`) holds `/api/images/<id>`; this
// row says whose it is and what it is, whichever store keeps the bytes.
// `data` holds them only for the database store. The owner carries no
// foreign key — it is a user or an organization — so the delete flows and
// the reaper remove rows nothing points at.
export const images = sqliteTable(
  'image',
  {
    id: text('id').primaryKey(),
    ownerKind: text('owner_kind', { enum: ['user', 'org'] }).notNull(),
    ownerId: text('owner_id').notNull(),
    contentType: text('content_type').notNull(),
    bytesLen: integer('bytes_len').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    createdAt: text('created_at').notNull(),
    data: blob('data', { mode: 'buffer' }),
    // Set once the row is claimed for deletion: no owner may point at it after.
    discardedAt: text('discarded_at'),
  },
  (table) => [
    index('idx_image_owner').on(table.ownerKind, table.ownerId),
    index('idx_image_created').on(table.createdAt),
  ],
)
