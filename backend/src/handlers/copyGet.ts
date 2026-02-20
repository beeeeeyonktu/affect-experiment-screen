import { getSession } from "../lib/dynamo.js";
import { json, parseBody } from "../lib/http.js";
import { getCopyBundle, resolveCopyVariant } from "../lib/copy.js";
import type { CopyGetRequest } from "../lib/contracts.js";

export async function handler(event: { body?: string | null }) {
  try {
    const body = event.body ? parseBody<CopyGetRequest>(event.body) : {};
    let experiment_target = body.experiment_target;
    let input_modality = body.input_modality;

    if (body.session_id) {
      const session = await getSession(body.session_id);
      if (!session) return json(404, { error: "session not found" });
      experiment_target = session.experiment_target;
      input_modality = session.input_modality;
    }

    const { version, copy } = await getCopyBundle();
    const resolved = resolveCopyVariant({ copy, experiment_target, input_modality });
    return json(200, {
      version,
      experiment_target,
      input_modality,
      resolved,
      full: copy
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(400, { error: message });
  }
}
