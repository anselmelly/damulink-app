/** Every API error has this body: { error: { code, message, fields? } } */
export type ApiErrorBody = { error: { code: string; message: string; fields?: Record<string, string> } }
