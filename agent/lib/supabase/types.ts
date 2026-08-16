declare const bearerTokenBrand: unique symbol;

export type SupabaseBearerToken = string & {
  readonly [bearerTokenBrand]: true;
};

export type { Database } from "./database.types";
