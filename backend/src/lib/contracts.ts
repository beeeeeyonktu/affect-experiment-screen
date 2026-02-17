export type InputModality = "hold" | "click_mark" | "toggle_state" | "popup_state";
export type PopupStateLabel = "mistake" | "uncertain" | "clear";

export interface SessionStartRequest {
  secured_url_jwt: string;
}

export interface SessionHeartbeatRequest {
  session_id: string;
  lease_token: string;
}

export interface SessionCompleteRequest {
  session_id: string;
  lease_token: string;
}

export interface CalibrationSaveRequest {
  session_id: string;
  lease_token: string;
  calibration_group: "slow" | "medium" | "fast";
  input_modality?: InputModality;
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
  | "UNCERTAINTY_START"
  | "UNCERTAINTY_END"
  | "UNCERTAINTY_MARK"
  | "STATE_SET"
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
  word_index?: number;
  input_modality?: InputModality;
  state_label?: PopupStateLabel;
}

export interface KeyDownEvent extends BaseEvent {
  type: "KEYDOWN";
  hold_id: string;
  start_word_index: number;
}

export interface KeyUpEvent extends BaseEvent {
  type: "KEYUP";
  hold_id: string;
  start_word_index?: number;
  start_t_rel_ms?: number;
  end_word_index: number;
  auto_closed?: boolean;
}

export interface UncertaintyEndEvent extends BaseEvent {
  type: "UNCERTAINTY_END";
  hold_id: string;
  start_word_index?: number;
  start_t_rel_ms?: number;
  end_word_index: number;
}

export interface UncertaintyMarkEvent extends BaseEvent {
  type: "UNCERTAINTY_MARK";
  hold_id?: string;
  word_index: number;
}

export interface StateSetEvent extends BaseEvent {
  type: "STATE_SET";
  hold_id?: string;
  word_index: number;
  state_label: PopupStateLabel;
}

export type ExperimentEvent =
  | BaseEvent
  | KeyDownEvent
  | KeyUpEvent
  | UncertaintyEndEvent
  | UncertaintyMarkEvent
  | StateSetEvent;

export interface EventBatchRequest {
  session_id: string;
  run_id: string;
  events: ExperimentEvent[];
}

export type SegmentShiftDecision = "yes" | "no" | "not_sure";
export type SegmentDirection = "more_positive" | "more_negative" | "mixed" | "unsure";

export interface RatingSaveRequest {
  session_id: string;
  lease_token: string;
  hold_id: string;
  stimulus_id: string;
  run_id: string;
  shift_decision: SegmentShiftDecision;
  direction: SegmentDirection;
  feeling_before?: string;
  feeling_after?: string;
  confidence: number;
}

export interface AdminSummaryRequest {
  limit?: number;
}

export interface AdminSessionDetailRequest {
  session_id: string;
  event_limit?: number;
}

export function assertString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

export function assertOptionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}
