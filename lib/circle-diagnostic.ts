// Never serialize provider errors: they may include credentials and request bodies.
export function circleDiagnostic(error: unknown) {
  type ProviderResponse = { status?: unknown; data?: { code?: unknown; errors?: unknown } };
  const e = error as { status?: unknown; code?: unknown; response?: ProviderResponse; error?: { response?: ProviderResponse } } | null;
  // Circle SDK wraps the Axios response in its `error` getter.
  const response = e?.response ?? e?.error?.response;
  const status = response?.status ?? e?.status;
  const code = response?.data?.code ?? e?.code;
  const fields = ["idempotencyKey", "contractAddress", "entitySecretCiphertext", "abiFunctionSignature", "abiParameters", "callData", "amount", "feeLevel", "gasLimit", "gasPrice", "maxFee", "priorityFee", "refId", "walletId", "blockchain", "walletAddress"];
  const reasons = ["required", "invalid", "max", "min", "oneof", "uuid", "uuid4", "hexadecimal", "base64", "length", "format", "type", "excluded_with", "required_without", "required_with"];
  const raw = response?.data?.errors;
  const fieldErrors = (Array.isArray(raw) ? raw.slice(0, 16) : []).map((item: unknown) => {
    const detail = item as { location?: unknown; error?: unknown } | null;
    const location = typeof detail?.location === "string" ? detail.location : "";
    const tokens = location.split(/[.\[\]\/]/);
    const field = fields.find(candidate => tokens.includes(candidate)) ?? "unknown_field";
    const reason = typeof detail?.error === "string" && reasons.includes(detail.error) ? detail.error : "validation_failed";
    // No message, invalidValue, constraints, URL, headers or request body.
    return { field, reason };
  });
  return {
    httpStatus: typeof status === "number" && Number.isInteger(status) ? status : null,
    providerCode: typeof code === "number" && Number.isInteger(code) ? code : null,
    fieldErrors,
  };
}
