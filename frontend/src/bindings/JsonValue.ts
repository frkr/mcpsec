// Local stand-in for ts-rs's serde_json::JsonValue binding, which wants to
// live three directories up. `any` is exactly what the remote tool schemas
// are: arbitrary JSON validated by each tool's inputSchema.
export type JsonValue = any;
