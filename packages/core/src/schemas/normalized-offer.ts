import { z } from "zod";

export const ContractTypeSchema = z.enum(["apprentissage", "professionnalisation", "stage", "cdi", "cdd", "autre"]);
export type ContractType = z.infer<typeof ContractTypeSchema>;

export const RemotePolicySchema = z.enum(["onsite", "hybrid", "remote", "unknown"]);
export type RemotePolicy = z.infer<typeof RemotePolicySchema>;

export const LifecycleSchema = z.enum(["active", "expired", "dead_link"]);
export type Lifecycle = z.infer<typeof LifecycleSchema>;

export const SourceRefSchema = z.object({
  source: z.string(),
  sourceOfferId: z.string(),
  canonicalUrl: z.string(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const NormalizedOfferSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceOfferId: z.string(),
  originSource: z.string().optional(),
  canonicalUrl: z.string(),
  applyUrl: z.string().optional(),
  title: z.string(),
  company: z.object({
    name: z.string(),
    normalizedName: z.string(),
    siret: z.string().optional(),
    website: z.string().optional(),
  }),
  location: z.object({
    label: z.string(),
    city: z.string(),
    postalCode: z.string().optional(),
    department: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  }),
  contractType: ContractTypeSchema,
  durationMonths: z.number().optional(),
  startDate: z.string().optional(),
  romeCodes: z.array(z.string()),
  descriptionText: z.string(),
  descriptionHtml: z.string().optional(),
  salary: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      period: z.enum(["hourly", "monthly", "yearly"]).optional(),
      currency: z.string().optional(),
    })
    .optional(),
  remotePolicy: RemotePolicySchema.optional(),
  postedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  lifecycle: LifecycleSchema,
  dedupKey: z.string(),
  sourceRefs: z.array(SourceRefSchema),
  rawPayload: z.unknown(),
});
export type NormalizedOffer = z.infer<typeof NormalizedOfferSchema>;
