export function withSessionId(
  schema: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const base = schema && typeof schema === "object" ? schema : { type: "object" };
  const properties = ((base.properties as Record<string, unknown>) ?? {}) as Record<
    string,
    unknown
  >;
  const required = Array.isArray(base.required)
    ? [...(base.required as string[])]
    : [];

  if (!required.includes("sessionId")) required.unshift("sessionId");

  return {
    ...base,
    type: "object",
    properties: {
      sessionId: {
        type: "string",
        description: "Target session identifier",
      },
      ...properties,
    },
    required,
  };
}
