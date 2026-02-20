import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { envOr } from "./env.js";
const s3 = new S3Client({});
const COPY_BUCKET = envOr("COPY_BUCKET", envOr("STIMULUS_BUCKET", "affect-exp-stimuli"));
const COPY_KEY = envOr("COPY_KEY", "copy.v1.json");
const COPY_VERSION = envOr("COPY_VERSION", "v1");
let cachedCopy = null;
let cachedAtMs = 0;
const COPY_CACHE_TTL_MS = 60_000;
async function streamToString(body) {
    if (!body)
        return "";
    if (typeof body === "string")
        return body;
    if (typeof body.transformToString === "function") {
        return body.transformToString();
    }
    const reader = body;
    const chunks = [];
    for await (const chunk of reader)
        chunks.push(chunk);
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
    }
    return new TextDecoder().decode(merged);
}
export async function getCopyBundle() {
    const now = Date.now();
    if (cachedCopy && now - cachedAtMs < COPY_CACHE_TTL_MS) {
        return { version: COPY_VERSION, copy: cachedCopy };
    }
    const out = await s3.send(new GetObjectCommand({
        Bucket: COPY_BUCKET,
        Key: COPY_KEY
    }));
    const text = await streamToString(out.Body);
    const parsed = JSON.parse(text);
    cachedCopy = parsed;
    cachedAtMs = now;
    return { version: COPY_VERSION, copy: parsed };
}
export function resolveCopyVariant(input) {
    const target = input.experiment_target === "character" ? "character" : "self";
    const modality = input.input_modality ?? "hold";
    const copy = input.copy;
    const common = copy.common ?? {};
    const conditionNode = target === "character"
        ? (copy.character_condition ?? {})
        : (copy.self_condition ?? {});
    const modalitiesNode = conditionNode.modalities ?? {};
    const modalityNode = modalitiesNode[modality] ?? {};
    const popupOptions = conditionNode.popup_options ?? {};
    const statusLabels = conditionNode.status_labels ?? {};
    const postShift = conditionNode.post_shift_questions ?? {};
    const validation = postShift.validation ?? {};
    const direction = postShift.direction ?? {};
    const endOfText = copy.end_of_text_questions ?? {};
    const mentalDemand = endOfText.mental_demand ?? {};
    const globalDefinition = Array.isArray(common.global_definition) ? common.global_definition : [];
    const modalityInstructions = Array.isArray(modalityNode.instructions) ? modalityNode.instructions : [];
    const instructions = [...globalDefinition, ...modalityInstructions];
    const taskInstruction = modalityNode.task_instruction ??
        modalityInstructions[0] ??
        "Follow the instructions for this session.";
    const validationOptions = Array.isArray(validation.options) ? validation.options : ["Yes", "No (false alarm)", "Not sure"];
    const directionOptions = Array.isArray(direction.options)
        ? direction.options
        : ["More positive", "More negative", "Mixed", "Unsure"];
    return {
        ...common,
        onboarding: instructions,
        task_instruction: taskInstruction,
        target_title: conditionNode.title ?? null,
        status_labels: {
            stable: statusLabels.stable ?? "Emotional state: stable",
            changing: statusLabels.changing ?? "Emotional state: changing"
        },
        popup_labels: {
            mistake: popupOptions.mistake ?? "Press was a mistake",
            uncertain: popupOptions.changing ?? "Emotional state starting to change",
            clear: popupOptions.settled ?? "Emotional state settling"
        },
        post_shift_questions: {
            validation: {
                question: validation.question ??
                    "At this moment, did your understanding of emotional state change?",
                options: validationOptions
            },
            direction: {
                question: direction.question ?? "In which direction did the emotional state shift?",
                options: directionOptions
            }
        },
        confidence_label: common.confidence_label ?? "How confident are you about this shift?",
        end_of_text_questions: {
            mental_demand: {
                question: mentalDemand.question ?? "How mentally demanding was this task?",
                scale: mentalDemand.scale ?? { min: 1, max: 5 }
            }
        }
    };
}
