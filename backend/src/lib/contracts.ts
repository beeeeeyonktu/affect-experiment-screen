export interface SessionStartRequest {
  secured_url_jwt: string;
}

export interface SessionHeartbeatRequest {
  session_id: string;
  lease_token: string;
}

export interface StimulusNextRequest {
  session_id: string;
  category?: string;
}

export interface StimulusNextResponse {
  done: boolean;
  stimulus_order?: number;
  stimulus_id?: string;
  text?: string;
  source_key?: string;
}

export type EventType =
  | "RUN_START"
  | "REVEAL_START"
  | "REVEAL_END"
  | "KEYDOWN"
  | "KEYUP"
  | "AUTO_CLOSE"
  | "VISIBILITY_HIDDEN"
  | "BLUR";

export interface BaseEvent {
  session_id: string;
  run_id: string;
  stimulus_id: string;
  client_event_seq: number;
  type: EventType;
  t_rel_ms: number;
  t_epoch_client_ms: number;
  t_server_received_utc_ms?: number;
}

export interface KeyDownEvent extends BaseEvent {
  type: "KEYDOWN";
  hold_id: string;
  start_word_index: number;
}

export interface KeyUpEvent extends BaseEvent {
  type: "KEYUP";
  hold_id: string;
  end_word_index: number;
  auto_closed?: boolean;
}

export type ExperimentEvent = BaseEvent | KeyDownEvent | KeyUpEvent;

export interface EventBatchRequest {
  session_id: string;
  run_id: string;
  events: ExperimentEvent[];
}

export function assertString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}
