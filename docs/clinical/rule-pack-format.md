# Clinical rule-pack artifact format v1

The persisted artifact is strict JSON data with this envelope:

```ts
type RulePackArtifactV1<T> = {
  schemaVersion: "1";
  header: {
    schemaVersion: "1";
    domain: ClinicalDomain;
    countryCode: "CO" | "US" | "GLOBAL";
    locale: string;
    version: string;
    effectiveFrom: string;
    effectiveUntil: string | null;
    algorithm: AlgorithmReference;
    sourceReferences: SourceDigestReference[];
    payloadSchema: string;
  };
  payload: T;
  fixtures: Record<string, unknown>[];
};
```

Artifacts are data only. They cannot contain functions, executable expressions, dynamic imports, remote `$ref` values, authority-bearing access claims, secrets, or unknown fields. JSON is parsed with duplicate-key rejection, bounded to 32 levels and 20,000 nodes, and canonicalized with RFC 8785 using UTF-8 bytes. Canonical bytes are limited to 5 MiB.

Source references are sorted by digest and purpose before canonicalization. Transport metadata is not part of the persisted envelope. Hashing and approval consume the returned canonical bytes; database metadata and object paths never override those bytes.
