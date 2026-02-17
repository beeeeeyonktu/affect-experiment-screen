import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
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
const HOLDS_TABLE = envOr("HOLDS_TABLE", "affect-exp-holds");
const RATINGS_TABLE = envOr("RATINGS_TABLE", "affect-exp-ratings");
const STIMULI_PER_SESSION = Number(envOr("STIMULI_PER_SESSION", "3"));
function isConditionalFailure(error) {
    if (!error)
        return false;
    const name = typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
    const message = typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : "";
    return (name.includes("ConditionalCheckFailed") ||
        message.includes("ConditionalCheckFailed") ||
        message.toLowerCase().includes("conditional request failed"));
}
export async function getSession(session_id) {
    const out = await ddb.send(new GetCommand({ TableName: SESSIONS_TABLE, Key: { session_id } }));
    return out.Item ?? null;
}
export async function createParticipantSessionAndLock(input) {
    const lock_id = `STUDY#${input.study_id}#PID#${input.prolific_pid}`;
    await ddb.send(new TransactWriteCommand({
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
                        study_id: input.study_id,
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
    }));
}
export async function refreshLease(session_id, expectedLeaseToken, nextLeaseIso, updatedIso) {
    await ddb.send(new UpdateCommand({
        TableName: SESSIONS_TABLE,
        Key: { session_id },
        UpdateExpression: "SET lease_expires_at_utc = :next, updated_at_utc = :updated",
        ConditionExpression: "lease_token = :lease",
        ExpressionAttributeValues: {
            ":next": nextLeaseIso,
            ":updated": updatedIso,
            ":lease": expectedLeaseToken
        }
    }));
}
export async function completeSession(session_id, expectedLeaseToken, updatedIso) {
    await ddb.send(new UpdateCommand({
        TableName: SESSIONS_TABLE,
        Key: { session_id },
        UpdateExpression: "SET #status = :complete, updated_at_utc = :updated",
        ConditionExpression: "lease_token = :lease",
        ExpressionAttributeNames: {
            "#status": "status"
        },
        ExpressionAttributeValues: {
            ":complete": "complete",
            ":updated": updatedIso,
            ":lease": expectedLeaseToken
        }
    }));
}
export async function saveCalibration(session_id, expectedLeaseToken, calibration_group, input_modality, ms_per_word, updatedIso) {
    await ddb.send(new UpdateCommand({
        TableName: SESSIONS_TABLE,
        Key: { session_id },
        UpdateExpression: "SET calibration_group = :group, input_modality = :modality, modality_version = :mver, ms_per_word = :ms, updated_at_utc = :updated",
        ConditionExpression: "lease_token = :lease",
        ExpressionAttributeValues: {
            ":group": calibration_group,
            ":modality": input_modality,
            ":mver": "v1",
            ":ms": ms_per_word,
            ":updated": updatedIso,
            ":lease": expectedLeaseToken
        }
    }));
}
export async function putEvent(event) {
    await ddb.send(new PutCommand({
        TableName: EVENTS_TABLE,
        Item: event,
        ConditionExpression: "attribute_not_exists(session_id) AND attribute_not_exists(event_key)"
    }));
}
export async function putHold(hold) {
    await ddb.send(new PutCommand({
        TableName: HOLDS_TABLE,
        Item: hold,
        ConditionExpression: "attribute_not_exists(session_id) AND attribute_not_exists(hold_id)"
    }));
}
export async function getHold(session_id, hold_id) {
    const out = await ddb.send(new GetCommand({
        TableName: HOLDS_TABLE,
        Key: { session_id, hold_id }
    }));
    return out.Item ?? null;
}
export async function putHoldRating(rating) {
    const rating_key = rating.hold_id;
    await ddb.send(new PutCommand({
        TableName: RATINGS_TABLE,
        Item: {
            rating_key,
            ...rating
        }
    }));
}
export async function isStimulusAssignedToSession(session_id, stimulus_id) {
    const out = await ddb.send(new QueryCommand({
        TableName: SESSION_STIMULI_TABLE,
        KeyConditionExpression: "session_id = :sid",
        ExpressionAttributeValues: { ":sid": session_id }
    }));
    const items = out.Items ?? [];
    return items.some((x) => x.stimulus_id === stimulus_id);
}
export async function markStimulusRunProgress(session_id, stimulus_id, run_id, done, nowIso) {
    const out = await ddb.send(new QueryCommand({
        TableName: SESSION_STIMULI_TABLE,
        KeyConditionExpression: "session_id = :sid",
        ExpressionAttributeValues: { ":sid": session_id }
    }));
    const items = out.Items ?? [];
    const match = items.find((x) => x.stimulus_id === stimulus_id);
    if (!match)
        return;
    if (done) {
        try {
            await ddb.send(new TransactWriteCommand({
                TransactItems: [
                    {
                        Update: {
                            TableName: SESSION_STIMULI_TABLE,
                            Key: { session_id, stimulus_order: match.stimulus_order },
                            UpdateExpression: "SET #status = :done, latest_run_id = :run, completed_at_utc = :ts, seen_events = :seen",
                            ConditionExpression: "#status <> :done",
                            ExpressionAttributeNames: { "#status": "status" },
                            ExpressionAttributeValues: {
                                ":done": "done",
                                ":run": run_id,
                                ":ts": nowIso,
                                ":seen": true
                            }
                        }
                    },
                    {
                        Update: {
                            TableName: ASSIGNMENT_COUNTERS_TABLE,
                            Key: { stimulus_id },
                            UpdateExpression: "SET assigned_count = if_not_exists(assigned_count, :zero) + :one",
                            ExpressionAttributeValues: {
                                ":zero": 0,
                                ":one": 1
                            }
                        }
                    }
                ]
            }));
        }
        catch (error) {
            if (!isConditionalFailure(error))
                throw error;
        }
        return;
    }
    try {
        await ddb.send(new UpdateCommand({
            TableName: SESSION_STIMULI_TABLE,
            Key: { session_id, stimulus_order: match.stimulus_order },
            UpdateExpression: "SET #status = :inprog, latest_run_id = :run, seen_events = :seen",
            ConditionExpression: "#status <> :done",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: {
                ":inprog": "in_progress",
                ":run": run_id,
                ":seen": true,
                ":done": "done"
            }
        }));
    }
    catch (error) {
        if (!isConditionalFailure(error))
            throw error;
    }
}
async function listSessionStimuli(session_id) {
    const out = await ddb.send(new QueryCommand({
        TableName: SESSION_STIMULI_TABLE,
        KeyConditionExpression: "session_id = :sid",
        ExpressionAttributeValues: { ":sid": session_id }
    }));
    const rows = (out.Items ?? []).filter((x) => Number.isFinite(x.stimulus_order));
    return rows.sort((a, b) => a.stimulus_order - b.stimulus_order);
}
async function markInterruptedIfNeeded(session_id, nowIso) {
    const assigned = await listSessionStimuli(session_id);
    const candidate = assigned
        .filter((x) => (x.status === "in_progress" || x.status === "assigned") && x.seen_events === true)
        .sort((a, b) => b.stimulus_order - a.stimulus_order)[0];
    if (!candidate)
        return;
    await ddb.send(new UpdateCommand({
        TableName: SESSION_STIMULI_TABLE,
        Key: { session_id, stimulus_order: candidate.stimulus_order },
        UpdateExpression: "SET #status = :interrupted, completed_at_utc = :ts",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
            ":interrupted": "interrupted",
            ":ts": nowIso
        }
    }));
}
async function listActiveStimuli(category) {
    const out = await ddb.send(new ScanCommand({
        TableName: STIMULUS_TABLE
    }));
    const all = out.Items ?? [];
    return all.filter((s) => {
        if (s.active === false)
            return false;
        if (category && s.category !== category)
            return false;
        return typeof s.text === "string" && s.text.length > 0;
    });
}
async function getStimulusById(stimulus_id) {
    const out = await ddb.send(new GetCommand({ TableName: STIMULUS_TABLE, Key: { stimulus_id } }));
    return out.Item ?? null;
}
async function getAssignedCount(stimulus_id) {
    const out = await ddb.send(new GetCommand({ TableName: ASSIGNMENT_COUNTERS_TABLE, Key: { stimulus_id } }));
    const row = out.Item;
    return Number(row?.assigned_count ?? 0);
}
export async function getOrAssignNextStimulus(session_id, category, nowIso) {
    const session = await getSession(session_id);
    if (!session)
        throw new Error("session not found");
    await markInterruptedIfNeeded(session_id, nowIso);
    const assigned = await listSessionStimuli(session_id);
    const pendingUnseen = assigned.find((x) => x.status === "assigned" && (x.seen_events ?? false) === false);
    if (pendingUnseen) {
        const st = await getStimulusById(pendingUnseen.stimulus_id);
        if (!st)
            throw new Error("assigned stimulus not found");
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
    if (!candidates.length)
        return { done: true };
    const maxOrder = assigned.reduce((m, x) => Math.max(m, Number(x.stimulus_order)), 0);
    const nextOrder = Number.isFinite(maxOrder) ? maxOrder + 1 : 1;
    let chosen;
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const counts = [];
        for (const s of candidates) {
            counts.push({ s, count: await getAssignedCount(s.stimulus_id) });
        }
        counts.sort((a, b) => a.count - b.count);
        const min = counts[0].count;
        const bucket = counts.filter((x) => x.count === min);
        const pick = bucket[Math.floor(Math.random() * bucket.length)];
        await ddb.send(new PutCommand({
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
        }));
        chosen = pick.s;
        break;
    }
    if (!chosen)
        throw new Error("assignment contention; retry");
    await ddb.send(new UpdateCommand({
        TableName: SESSIONS_TABLE,
        Key: { session_id },
        UpdateExpression: "SET current_index = :idx, updated_at_utc = :ts",
        ExpressionAttributeValues: { ":idx": nextOrder, ":ts": nowIso }
    }));
    return {
        done: false,
        stimulus_order: nextOrder,
        stimulus_id: chosen.stimulus_id,
        text: chosen.text,
        source_key: chosen.s3_key ?? chosen.stimulus_id
    };
}
async function getParticipant(participant_id) {
    const out = await ddb.send(new GetCommand({ TableName: PARTICIPANTS_TABLE, Key: { participant_id } }));
    return out.Item ?? null;
}
async function countEventsForSession(session_id) {
    const out = await ddb.send(new QueryCommand({
        TableName: EVENTS_TABLE,
        KeyConditionExpression: "session_id = :sid",
        ExpressionAttributeValues: { ":sid": session_id },
        Select: "COUNT"
    }));
    return Number(out.Count ?? 0);
}
async function listEventsForSession(session_id, limit) {
    const out = await ddb.send(new QueryCommand({
        TableName: EVENTS_TABLE,
        KeyConditionExpression: "session_id = :sid",
        ExpressionAttributeValues: { ":sid": session_id },
        Limit: limit
    }));
    return {
        items: out.Items ?? [],
        truncated: Boolean(out.LastEvaluatedKey)
    };
}
async function listHoldsForSession(session_id) {
    const out = await ddb.send(new QueryCommand({
        TableName: HOLDS_TABLE,
        KeyConditionExpression: "session_id = :sid",
        ExpressionAttributeValues: { ":sid": session_id }
    }));
    const items = out.Items ?? [];
    return items.sort((a, b) => a.hold_id.localeCompare(b.hold_id));
}
export async function adminListRecentSessions(limit) {
    const out = await ddb.send(new ScanCommand({ TableName: SESSIONS_TABLE }));
    const sessions = (out.Items ?? [])
        .sort((a, b) => b.created_at_utc.localeCompare(a.created_at_utc))
        .slice(0, limit);
    const rows = [];
    for (const session of sessions) {
        const [participant, assignments, eventsCount] = await Promise.all([
            getParticipant(session.participant_id),
            listSessionStimuli(session.session_id),
            countEventsForSession(session.session_id)
        ]);
        rows.push({
            session_id: session.session_id,
            participant_id: session.participant_id,
            prolific_pid: participant?.prolific_pid,
            status: session.status,
            calibration_group: session.calibration_group,
            ms_per_word: session.ms_per_word,
            created_at_utc: session.created_at_utc,
            updated_at_utc: session.updated_at_utc,
            assigned_count: assignments.length,
            done_count: assignments.filter((x) => x.status === "done").length,
            interrupted_count: assignments.filter((x) => x.status === "interrupted").length,
            in_progress_count: assignments.filter((x) => x.status === "in_progress").length,
            events_count: eventsCount
        });
    }
    return rows;
}
export async function adminGetSessionDetail(session_id, eventLimit) {
    const session = await getSession(session_id);
    if (!session)
        return null;
    const [participant, assignments, eventsOut, holds] = await Promise.all([
        getParticipant(session.participant_id),
        listSessionStimuli(session_id),
        listEventsForSession(session_id, eventLimit),
        listHoldsForSession(session_id)
    ]);
    const stimuliResolved = await Promise.all(assignments.map(async (a) => {
        const st = await getStimulusById(a.stimulus_id);
        return {
            stimulus_id: a.stimulus_id,
            stimulus_order: a.stimulus_order,
            status: a.status,
            latest_run_id: a.latest_run_id,
            text: st?.text ?? "",
            category: st?.category
        };
    }));
    return {
        session,
        participant: participant ?? undefined,
        assignments,
        stimuli: stimuliResolved,
        holds,
        events: eventsOut.items,
        events_truncated: eventsOut.truncated
    };
}
