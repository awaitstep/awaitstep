import { pgTable, text, integer, index, customType } from 'drizzle-orm/pg-core'
import { isoTimestamp } from './iso-timestamp.js'

/** Raw bytes, read back as a Uint8Array like the sqlite schema's blob. */
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => 'bytea',
})

// Uploaded images: a profile photo or an organization logo. The owner's
// column (`user.image`, `organization.logo`) holds `/api/images/<id>`; this
// row says whose it is and what it is, whichever store keeps the bytes.
// `data` holds them only for the database store. The owner carries no
// foreign key — it is a user or an organization — so the delete flows and
// the reaper remove rows nothing points at.
export const images = pgTable(
  'image',
  {
    id: text('id').primaryKey(),
    ownerKind: text('owner_kind', { enum: ['user', 'org'] }).notNull(),
    ownerId: text('owner_id').notNull(),
    contentType: text('content_type').notNull(),
    bytesLen: integer('bytes_len').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    createdAt: isoTimestamp('created_at').notNull(),
    data: bytea('data'),
    // Set once the row is claimed for deletion: no owner may point at it after.
    discardedAt: isoTimestamp('discarded_at'),
  },
  (table) => [
    index('idx_image_owner').on(table.ownerKind, table.ownerId),
    index('idx_image_created').on(table.createdAt),
  ],
)
