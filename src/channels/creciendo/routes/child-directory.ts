import type { RuntimeConfig } from "../../../../agent/lib/config/env";
import { createRequestSupabaseClient } from "../../../../agent/lib/supabase/request-client";
import type { AuthenticatedChannelRequest } from "../auth-middleware";
import {
  CHILD_DIRECTORY_RESPONSE_SCHEMA,
  DIRECTORY_VERSION,
  type ChildDirectoryResponse,
} from "../directory-contract";

type ChildDirectoryItem = Readonly<{
  careSpaceId: string;
  careSpaceName: string;
  countryOfCare: "CO" | "US";
  timeZone: string;
  childId: string;
  displayName: string;
  birthDate: string;
}>;

export interface ChildDirectoryResolver {
  resolve(auth: AuthenticatedChannelRequest, signal: AbortSignal): Promise<readonly ChildDirectoryItem[] | null>;
}

function safeName(preferred: unknown, given: unknown): string | null {
  for (const candidate of [preferred, given]) {
    if (typeof candidate !== "string") continue;
    const value = candidate.trim().normalize("NFKC");
    if (value.length > 0 && value.length <= 160 && !/[\u0000-\u001f\u007f\p{Cf}\p{Cs}]/u.test(value)) return value;
  }
  return null;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value);
}

function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value.length <= 64;
  } catch {
    return false;
  }
}

function responseError(status: 400 | 503): Response {
  return Response.json({
    version: "creciendo.error.v1",
    code: status === 400 ? "REQUEST_INVALID" : "PERSISTENCE_UNAVAILABLE",
    retryable: status === 503,
    retryAfterSeconds: null,
    effectState: "none",
    resumable: false,
  }, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

export async function handleChildDirectory(
  request: Request,
  auth: AuthenticatedChannelRequest,
  dependencies: Readonly<{ resolver: ChildDirectoryResolver }>,
): Promise<Response> {
  if (request.signal.aborted) return responseError(503);
  try {
    const items = await dependencies.resolver.resolve(auth, request.signal);
    if (!items) return responseError(503);
    const careSpaces = new Map<string, {
      careSpaceId: string;
      name: string;
      countryOfCare: "CO" | "US";
      timeZone: string;
      children: Array<{
        childId: string;
        displayName: string;
        birthDate: string;
        countryOfCare: "CO" | "US";
        timeZone: string;
      }>;
    }>();
    for (const item of items) {
      if (!item || !item.careSpaceId || !item.childId || !item.careSpaceName || !validDate(item.birthDate) || !validTimeZone(item.timeZone)) {
        return responseError(503);
      }
      const space = careSpaces.get(item.careSpaceId) ?? {
        careSpaceId: item.careSpaceId,
        name: item.careSpaceName,
        countryOfCare: item.countryOfCare,
        timeZone: item.timeZone,
        children: [],
      };
      space.children.push({
        childId: item.childId,
        displayName: item.displayName,
        birthDate: item.birthDate,
        countryOfCare: item.countryOfCare,
        timeZone: item.timeZone,
      });
      careSpaces.set(item.careSpaceId, space);
    }
    const payload: ChildDirectoryResponse = CHILD_DIRECTORY_RESPONSE_SCHEMA.parse({
      version: DIRECTORY_VERSION,
      requestId: auth.requestId,
      careSpaces: [...careSpaces.values()]
        .sort((a, b) => a.careSpaceId.localeCompare(b.careSpaceId))
        .map((space) => ({ ...space, children: space.children.sort((a, b) => a.childId.localeCompare(b.childId)) })),
    });
    return Response.json(payload, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch {
    return responseError(503);
  }
}

function createProductionResolver(config: Pick<RuntimeConfig, "supabaseUrl" | "supabasePublishableKey">): ChildDirectoryResolver {
  return {
    async resolve(auth, signal) {
      const client = createRequestSupabaseClient({ config, accessToken: auth.guardian.bearerToken });
      const access = await client.from("child_access")
        .select("care_space_id, child_id")
        .eq("user_id", auth.guardian.userId)
        .eq("status", "active");
      if (access.error || !Array.isArray(access.data) || signal.aborted) return null;
      const accessRows = access.data as unknown as Array<{ care_space_id: string; child_id: string }>;
      const childIds = [...new Set(accessRows.map((row) => row.child_id).filter(Boolean))];
      const spaceIds = [...new Set(accessRows.map((row) => row.care_space_id).filter(Boolean))];
      if (childIds.length === 0 || spaceIds.length === 0) return [];
      const [children, spaces] = await Promise.all([
        client.from("children")
          .select("id, care_space_id, preferred_name, given_names, date_of_birth, country_of_care, time_zone, status")
          .in("id", childIds).eq("status", "active"),
        client.from("care_spaces")
          .select("id, name, default_country_code, time_zone, status")
          .in("id", spaceIds).eq("status", "active"),
      ]);
      if (children.error || spaces.error || !Array.isArray(children.data) || !Array.isArray(spaces.data) || signal.aborted) return null;
      const spaceById = new Map((spaces.data as unknown as Array<Record<string, unknown>>).map((row) => [row.id, row]));
      const allowed = new Set(accessRows.map((row) => `${row.care_space_id}:${row.child_id}`));
      const result: ChildDirectoryItem[] = [];
      for (const row of children.data as unknown as Array<Record<string, unknown>>) {
        const key = `${String(row.care_space_id)}:${String(row.id)}`;
        const space = spaceById.get(row.care_space_id);
        const displayName = safeName(row.preferred_name, row.given_names);
        if (!allowed.has(key) || !space || displayName === null || !validDate(row.date_of_birth) || !validTimeZone(row.time_zone)) continue;
        const country = row.country_of_care === "US" ? "US" : row.country_of_care === "CO" ? "CO" : null;
        const spaceCountry = space.default_country_code === "US" ? "US" : space.default_country_code === "CO" ? "CO" : null;
        if (!country || !spaceCountry || typeof space.id !== "string" || typeof space.name !== "string" || typeof space.time_zone !== "string") continue;
        result.push({
          careSpaceId: String(row.care_space_id),
          careSpaceName: space.name,
          countryOfCare: country,
          timeZone: row.time_zone,
          childId: String(row.id),
          displayName,
          birthDate: row.date_of_birth,
        });
      }
      return result;
    },
  };
}

export function createChildDirectoryRouteDependencies(config: RuntimeConfig): Readonly<{ resolver: ChildDirectoryResolver }> {
  return Object.freeze({ resolver: createProductionResolver(config) });
}
