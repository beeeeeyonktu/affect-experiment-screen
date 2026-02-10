import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import { envOr } from "./env.js";

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});

const PARTICIPANTS_TABLE = envOr("PARTICIPANTS_TABLE", "affect-exp-participants");
const PARTICIPANT_LOCKS_TABLE = envOr("PARTICIPANT_LOCKS_TABLE", "affect-exp-participant-locks");
const SESSIONS_TABLE = envOr("SESSIONS_TABLE", "affect-exp-sessions");
const STIMULUS_TABLE = envOr("STIMULUS_TABLE", "affect-exp-stimulus");
const SESSION_STIMULI_TABLE = envOr("SESSION_STIMULI_TABLE", "affect-exp-session-stimuli");
const ASSIGNMENT_COUNTERS_TABLE = envOr("ASSIGNMENT_COUNTERS_TABLE", "affect-exp-assignment-counters");
const EVENTS_TABLE = envOr("EVENTS_TABLE", "affect-exp-events");
const STIMULI_PER_SESSION = Number(envOr("STIMULI_PER_SESSION", "3"));

export interface SessionRecord {
  session_id: string;
  participant_id: string;
  status: "active" | "complete";
  calibration_group?: "slow" | "medium" | "fast";
  ms_per_word?: number;
  current_index: number;
  lease_token: string;
  lease_expires_at_utc: string;
  created_at_utc: string;
  updated_at_utc: string;
}

interface StimulusRecord {
  stimulus_id: string;
  text: string;
  category?: string;
  s3_key?: string;
  version?: string;
  active?: boolean;
}

interface SessionStimulusRecord {
  session_id: string;
  stimulus_order: number;
  stimulus_id: string;
  status: "assigned" | "in_progress" | "done" | "interrupted";
  seen_events?: boolean;
  latest_run_id?: string;
  assigned_at_utc: string;
  completed_at_utc?: string;
}

export async function getSession(session_id: string): Promise<SessionRecord | null> {
  const out = await ddb.send(new GetCommand({ TableName: SESSIONS_TABLE, Key: { session_id } }));
  return (out.Item as SessionRecord | undefined) ?? null;
}

export async function createParticipantSessionAndLock(input: {
  participant_id: string;
  prolific_pid: string;
  prolific_session_id: string;
  session: SessionRecord;
}) {
  const lock_id = `PID#${input.prolific_pid}`;

  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: PARTICIPANT_LOCKS_TABLE,
            Item: {
              lock_id,
              participant_id: input.participant_id,
              session_id: input.session.session_id,
              lease_token: input.session.lease_token,
              lease_expires_at_utc: input.session.lease_expires_at_utc,
              status: "active",
              updated_at_utc: input.session.updated_at_utc
            },
            ConditionExpression: "attribute_not_exists(lock_id)"
          }
        },
        {
          Put: {
            TableName: PARTICIPANTS_TABLE,
            Item: {
              participant_id: input.participant_id,
              prolific_pid: input.prolific_pid,
              prolific_session_id: input.prolific_session_id,
              status: "active",
              created_at_utc: input.session.created_at_utc
            },
            ConditionExpression: "attribute_not_exists(participant_id)"
          }
        },
        {
          Put: {
            TableName: SESSIONS_TABLE,
            Item: input.session,
            ConditionExpression: "attribute_not_exists(session_id)"
          }
        }
      ]
    })
  );
}

export async function refreshLease(session_id: string, expectedLeaseToken: string, nextLeaseIso: string, updatedIso: string) {
  await ddb.send(
    new UpdateCommand({
      TableName: SESSIONS_TABLE,
      Key: { session_id },
      UpdateExpression: "SET lease_expires_at_utc = :next, updated_at_utc = :updated",
      ConditionExpression: "lease_token = :lease",
      ExpressionAttributeValues: {
        ":next": nextLeaseIso,
        ":updated": updatedIso,
        ":lease": expectedLeaseToken
      }
    })
  );
}

export async function putEvent(event: Record<string, unknown>) {
  await ddb.send(
    new PutCommand({
      TableName: EVENTS_TABLE,
      Item: event,
      ConditionExpression: "attribute_not_exists(session_id) AND attribute_not_exists(event_key)"
    })
  );
}

export async function isStimulusAssignedToSession(session_id: string, stimulus_id: string): Promise<boolean> {
  const out = await ddb.send(
    new QueryCommand({
      TableName: SESSION_STIMULI_TABLE,
      KeyConditionExpression: "session_id = :sid",
      ExpressionAttributeValues: { ":sid": session_id }
    })
  );
  const items = (out.Items as SessionStimulusRecord[] | undefined) ?? [];
  return items.some((x) => x.stimulus_id === stimulus_id);
}

export async function markStimulusRunProgress(session_id: string, stimulus_id: string, run_id: string, done: boolean, nowIso: string) {
  const out = await ddb.send(
    new QueryCommand({
      TableName: SESSION_STIMULI_TABLE,
      KeyConditionExpression: "session_id = :sid",
      ExpressionAttributeValues: { ":sid": session_id }
    })
  );
  const items = (out.Items as SessionStimulusRecord[] | undefined) ?? [];
  const match = items.find((x) => x.stimulus_id === stimulus_id);
  if (!match) return;

  await ddb.send(
    new UpdateCommand({
      TableName: SESSION_STIMULI_TABLE,
      Key: { session_id, stimulus_order: match.stimulus_order },
      UpdateExpression: done
        ? "SET #status = :done, latest_run_id = :run, completed_at_utc = :ts, seen_events = :seen"
        : "SET #status = :inprog, latest_run_id = :run, seen_events = :seen",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: done
        ? { ":done": "done", ":run": run_id, ":ts": nowIso, ":seen": true }
        : { ":inprog": "in_progress", ":run": run_id, ":seen": true }
    })
  );
}

async function listSessionStimuli(session_id: string): Promise<SessionStimulusRecord[]> {
  const out = await ddb.send(
    new QueryCommand({
      TableName: SESSION_STIMULI_TABLE,
      KeyConditionExpression: "session_id = :sid",
      ExpressionAttributeValues: { ":sid": session_id }
    })
  );
  const rows = ((out.Items as SessionStimulusRecord[] | undefined) ?? []).filter((x) =>
    Number.isFinite(x.stimulus_order)
  );
  return rows.sort((a, b) => a.stimulus_order - b.stimulus_order);
}

async function markInterruptedIfNeeded(session_id: string, nowIso: string): Promise<void> {
  const assigned = await listSessionStimuli(session_id);
  const candidate = assigned
    .filter((x) => (x.status === "in_progress" || x.status === "assigned") && x.seen_events === true)
    .sort((a, b) => b.stimulus_order - a.stimulus_order)[0];
  if (!candidate) return;

  await ddb.send(
    new UpdateCommand({
      TableName: SESSION_STIMULI_TABLE,
      Key: { session_id, stimulus_order: candidate.stimulus_order },
      UpdateExpression: "SET #status = :interrupted, completed_at_utc = :ts",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":interrupted": "interrupted",
        ":ts": nowIso
      }
    })
  );
}

async function listActiveStimuli(category?: string): Promise<StimulusRecord[]> {
  const out = await ddb.send(
    new ScanCommand({
      TableName: STIMULUS_TABLE
    })
  );
  const all = (out.Items as StimulusRecord[] | undefined) ?? [];
  return all.filter((s) => {
    if (s.active === false) return false;
    if (category && s.category !== category) return false;
    return typeof s.text === "string" && s.text.length > 0;
  });
}

async function getStimulusById(stimulus_id: string): Promise<StimulusRecord | null> {
  const out = await ddb.send(new GetCommand({ TableName: STIMULUS_TABLE, Key: { stimulus_id } }));
  return (out.Item as StimulusRecord | undefined) ?? null;
}

async function getAssignedCount(stimulus_id: string): Promise<number> {
  const out = await ddb.send(new GetCommand({ TableName: ASSIGNMENT_COUNTERS_TABLE, Key: { stimulus_id } }));
  const row = out.Item as { assigned_count?: number } | undefined;
  return Number(row?.assigned_count ?? 0);
}

async function tryIncrementCounter(stimulus_id: string, expected: number): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: ASSIGNMENT_COUNTERS_TABLE,
        Key: { stimulus_id },
        UpdateExpression: "SET assigned_count = if_not_exists(assigned_count, :zero) + :one",
        ConditionExpression: "attribute_not_exists(assigned_count) OR assigned_count = :expected",
        ExpressionAttributeValues: {
          ":zero": 0,
          ":one": 1,
          ":expected": expected
        }
      })
    );
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("ConditionalCheckFailed")) return false;
    throw error;
  }
}

export async function getOrAssignNextStimulus(session_id: string, category: string | undefined, nowIso: string) {
  const session = await getSession(session_id);
  if (!session) throw new Error("session not found");

  await markInterruptedIfNeeded(session_id, nowIso);
  const assigned = await listSessionStimuli(session_id);
  const pendingUnseen = assigned.find((x) => x.status === "assigned" && (x.seen_events ?? false) === false);
  if (pendingUnseen) {
    const st = await getStimulusById(pendingUnseen.stimulus_id);
    if (!st) throw new Error("assigned stimulus not found");
    return {
      done: false,
      stimulus_order: pendingUnseen.stimulus_order,
      stimulus_id: st.stimulus_id,
      text: st.text,
      source_key: st.s3_key ?? st.stimulus_id
    };
  }

  const completedCount = assigned.filter((x) => x.status === "done").length;
  if (completedCount >= STIMULI_PER_SESSION) {
    return { done: true };
  }

  const assignedSet = new Set(assigned.map((x) => x.stimulus_id));
  const candidates = (await listActiveStimuli(category)).filter((x) => !assignedSet.has(x.stimulus_id));
  if (!candidates.length) return { done: true };
  const maxOrder = assigned.reduce((m, x) => Math.max(m, Number(x.stimulus_order)), 0);
  const nextOrder = Number.isFinite(maxOrder) ? maxOrder + 1 : 1;

  let chosen: StimulusRecord | undefined;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const counts: Array<{ s: StimulusRecord; count: number }> = [];
    for (const s of candidates) {
      counts.push({ s, count: await getAssignedCount(s.stimulus_id) });
    }
    counts.sort((a, b) => a.count - b.count);
    const min = counts[0].count;
    const bucket = counts.filter((x) => x.count === min);
    const pick = bucket[Math.floor(Math.random() * bucket.length)];
    const incremented = await tryIncrementCounter(pick.s.stimulus_id, pick.count);
    if (!incremented) continue;

    await ddb.send(
      new PutCommand({
        TableName: SESSION_STIMULI_TABLE,
        Item: {
          session_id,
          stimulus_order: nextOrder,
          stimulus_id: pick.s.stimulus_id,
          status: "assigned",
          seen_events: false,
          assigned_at_utc: nowIso
        },
        ConditionExpression: "attribute_not_exists(session_id) AND attribute_not_exists(stimulus_order)"
      })
    );
    chosen = pick.s;
    break;
  }
  if (!chosen) throw new Error("assignment counter contention; retry");

  await ddb.send(
    new UpdateCommand({
      TableName: SESSIONS_TABLE,
      Key: { session_id },
      UpdateExpression: "SET current_index = :idx, updated_at_utc = :ts",
      ExpressionAttributeValues: { ":idx": nextOrder, ":ts": nowIso }
    })
  );

  return {
    done: false,
    stimulus_order: nextOrder,
    stimulus_id: chosen.stimulus_id,
    text: chosen.text,
    source_key: chosen.s3_key ?? chosen.stimulus_id
  };
}
