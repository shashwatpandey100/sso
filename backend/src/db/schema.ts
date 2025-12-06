import { pgTable, text, timestamp, boolean, uuid, index, json } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// USERS TABLE
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  username: text('username').unique(),
  password: text('password').notNull(), // hashed with bcrypt
  name: text('name'),
  emailVerified: boolean('email_verified').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  emailIdx: index('email_idx').on(table.email),
  usernameIdx: index('username_idx').on(table.username),
}));

export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
  authCodes: many(authCodes),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// REFRESH TOKENS TABLE
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(), // store hashed version
  expiresAt: timestamp('expires_at').notNull(), // 30 days
  isRevoked: boolean('is_revoked').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at'),
}, (table) => ({
  userIdIdx: index('refresh_tokens_user_id_idx').on(table.userId),
  tokenHashIdx: index('refresh_tokens_token_hash_idx').on(table.tokenHash),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;

// AUTH CODES TABLE (OAuth Flow)
export const authCodes = pgTable('auth_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(), // short random string
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull().references(() => clientApps.clientId),
  redirectUri: text('redirect_uri').notNull(), // must match on exchange
  expiresAt: timestamp('expires_at').notNull(), // 10 minutes
  isUsed: boolean('is_used').default(false).notNull(), // one-time use
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  codeIdx: index('auth_codes_code_idx').on(table.code),
  userIdIdx: index('auth_codes_user_id_idx').on(table.userId),
}));

export const authCodesRelations = relations(authCodes, ({ one }) => ({
  user: one(users, {
    fields: [authCodes.userId],
    references: [users.id],
  }),
  client: one(clientApps, {
    fields: [authCodes.clientId],
    references: [clientApps.clientId],
  }),
}));

export type AuthCode = typeof authCodes.$inferSelect;
export type NewAuthCode = typeof authCodes.$inferInsert;

// CLIENT APPS TABLE (Registered Apps)
export const clientApps = pgTable('client_apps', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: text('client_id').notNull().unique(), // e.g., "shelfscan", "shelfmuse"
  clientSecret: text('client_secret').notNull(), // hashed with bcrypt
  name: text('name').notNull(), // e.g., "ShelfScan"
  allowedRedirectUris: json('allowed_redirect_uris').$type<string[]>().notNull(), // ["https://shelfscan.com/callback"]
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  clientIdIdx: index('client_apps_client_id_idx').on(table.clientId),
}));

export type ClientApp = typeof clientApps.$inferSelect;
export type NewClientApp = typeof clientApps.$inferInsert;
