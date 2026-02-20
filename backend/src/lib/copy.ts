import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { envOr } from "./env.js";
import type { ExperimentTarget, InputModality } from "./contracts.js";

const s3 = new S3Client({});
const COPY_BUCKET = envOr("COPY_BUCKET", envOr("STIMULUS_BUCKET", "affect-exp-stimuli"));
const COPY_KEY = envOr("COPY_KEY", "copy.v1.json");
const COPY_VERSION = envOr("COPY_VERSION", "v1");

type JsonRecord = Record<string, unknown>;

let cachedCopy: JsonRecord | null = null;
let cachedAtMs = 0;
const COPY_CACHE_TTL_MS = 60_000;

async function streamToString(body: unknown): Promise<string> {
  if (!body) return "";
  if (typeof body === "string") return body;
  if (typeof (body as { transformToString?: unknown }).transformToString === "function") {
    return (body as { transformToString: () => Promise<string> }).transformToString();
  }
  const reader = body as AsyncIterable<Uint8Array>;
  const chunks: Uint8Array[] = [];
  for await (const chunk of reader) chunks.push(chunk);
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(merged);
}

export async function getCopyBundle(): Promise<{ version: string; copy: JsonRecord }> {
  const now = Date.now();
  if (cachedCopy && now - cachedAtMs < COPY_CACHE_TTL_MS) {
    return { version: COPY_VERSION, copy: cachedCopy };
  }
  const out = await s3.send(
    new GetObjectCommand({
      Bucket: COPY_BUCKET,
      Key: COPY_KEY
    })
  );
  const text = await streamToString(out.Body);
  const parsed = JSON.parse(text) as JsonRecord;
  cachedCopy = parsed;
  cachedAtMs = now;
  return { version: COPY_VERSION, copy: parsed };
}

export function resolveCopyVariant(input: {
  copy: JsonRecord;
  experiment_target?: ExperimentTarget;
  input_modality?: InputModality;
}): JsonRecord {
  const target = input.experiment_target === "character" ? "character" : "self";
  const modality = input.input_modality ?? "hold";
  const copy = input.copy;

  const common = (copy.common as JsonRecord | undefined) ?? {};
  const conditionNode =
    target === "character"
      ? ((copy.character_condition as JsonRecord | undefined) ?? {})
      : ((copy.self_condition as JsonRecord | undefined) ?? {});
  const modalitiesNode = (conditionNode.modalities as JsonRecord | undefined) ?? {};
  const modalityNode = (modalitiesNode[modality] as JsonRecord | undefined) ?? {};
  const popupOptions = (conditionNode.popup_options as JsonRecord | undefined) ?? {};
  const statusLabels = (conditionNode.status_labels as JsonRecord | undefined) ?? {};
  const postShift = (conditionNode.post_shift_questions as JsonRecord | undefined) ?? {};
  const validation = (postShift.validation as JsonRecord | undefined) ?? {};
  const direction = (postShift.direction as JsonRecord | undefined) ?? {};
  const endOfText = (copy.end_of_text_questions as JsonRecord | undefined) ?? {};
  const mentalDemand = (endOfText.mental_demand as JsonRecord | undefined) ?? {};

  const globalDefinition = Array.isArray(common.global_definition) ? common.global_definition : [];
  const modalityInstructions = Array.isArray(modalityNode.instructions) ? modalityNode.instructions : [];
  const instructions = [...globalDefinition, ...modalityInstructions];
  const taskInstruction =
    (modalityNode.task_instruction as string | undefined) ??
    (modalityInstructions[0] as string | undefined) ??
    "Follow the instructions for this session.";
  const validationOptions = Array.isArray(validation.options) ? validation.options : ["Yes", "No (false alarm)", "Not sure"];
  const directionOptions = Array.isArray(direction.options)
    ? direction.options
    : ["More positive", "More negative", "Mixed", "Unsure"];

  return {
    ...common,
    onboarding: instructions,
    task_instruction: taskInstruction,
    target_title: (conditionNode.title as string | undefined) ?? null,
    status_labels: {
      stable: (statusLabels.stable as string | undefined) ?? "Emotional state: stable",
      changing: (statusLabels.changing as string | undefined) ?? "Emotional state: changing"
    },
    popup_labels: {
      mistake: (popupOptions.mistake as string | undefined) ?? "Press was a mistake",
      uncertain: (popupOptions.changing as string | undefined) ?? "Emotional state starting to change",
      clear: (popupOptions.settled as string | undefined) ?? "Emotional state settling"
    },
    post_shift_questions: {
      validation: {
        question:
          (validation.question as string | undefined) ??
          "At this moment, did your understanding of emotional state change?",
        options: validationOptions
      },
      direction: {
        question: (direction.question as string | undefined) ?? "In which direction did the emotional state shift?",
        options: directionOptions
      }
    },
    confidence_label:
      (common.confidence_label as string | undefined) ?? "How confident are you about this shift?",
    end_of_text_questions: {
      mental_demand: {
        question: (mentalDemand.question as string | undefined) ?? "How mentally demanding was this task?",
        scale: (mentalDemand.scale as JsonRecord | undefined) ?? { min: 1, max: 5 }
      }
    }
  };
}
