import { z } from 'zod';

/** Shape of a household export (format version 1). Used to validate round-trips in tests. */
const Timestamp = z.union([z.string(), z.date()]).transform((v) => new Date(v).toISOString());

export const HouseholdExportSchema = z.object({
  formatVersion: z.literal(1),
  exportedAt: z.string(),
  scope: z.literal('visible_to_member'),
  household: z.object({
    id: z.uuid(),
    name: z.string(),
    timezone: z.string(),
    createdAt: Timestamp,
  }),
  members: z.array(
    z.object({
      id: z.uuid(),
      displayName: z.string(),
      role: z.enum(['owner', 'adult', 'caregiver', 'child']),
      status: z.enum(['active', 'removed']),
      createdAt: Timestamp,
      removedAt: Timestamp.nullable(),
    }),
  ),
  invites: z.array(
    z.object({
      id: z.uuid(),
      email: z.string(),
      role: z.enum(['adult', 'caregiver']),
      expiresAt: Timestamp,
      acceptedAt: Timestamp.nullable(),
      revokedAt: Timestamp.nullable(),
      createdAt: Timestamp,
    }),
  ),
  sources: z.array(
    z.object({
      id: z.uuid(),
      kind: z.string(),
      storageRef: z.string().nullable(),
      createdAt: Timestamp,
    }),
  ),
  workItems: z.array(
    z.object({
      id: z.uuid(),
      type: z.string(),
      title: z.string(),
      description: z.string().nullable(),
      status: z.string(),
      ownerMemberId: z.uuid().nullable(),
      parentId: z.uuid().nullable(),
      dueOn: z.string().nullable(),
      dueAt: Timestamp.nullable(),
      priority: z.number().nullable(),
      visibility: z.enum(['household', 'private']),
      createdByMemberId: z.uuid(),
      version: z.number(),
      createdAt: Timestamp,
      updatedAt: Timestamp,
    }),
  ),
  comments: z.array(
    z.object({
      id: z.uuid(),
      workItemId: z.uuid(),
      authorMemberId: z.uuid(),
      body: z.string(),
      createdAt: Timestamp,
    }),
  ),
  auditEvents: z.array(
    z.object({
      id: z.string(),
      actorMemberId: z.uuid().nullable(),
      entityType: z.string(),
      entityId: z.uuid(),
      action: z.string(),
      payload: z.record(z.string(), z.unknown()),
      createdAt: Timestamp,
    }),
  ),
  /** Uploaded files arrive in M5; the manifest lists them by storage key. */
  files: z.array(z.object({ sourceId: z.uuid(), storageRef: z.string() })),
});

export type HouseholdExport = z.infer<typeof HouseholdExportSchema>;
