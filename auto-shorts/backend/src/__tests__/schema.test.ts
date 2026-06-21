import { describe, it, expect } from "vitest";
import Ajv, { type ValidateFunction } from "ajv";
import contracts from "../../../shared/schemas/contracts.schema.json";
import { videoTemplateBuilder } from "../agents";
import type { ShortPlan } from "../types";

// Compile the shared cross-language schema and pull out the VideoSpec validator.
const ajv = new Ajv({ strict: false });
ajv.addSchema(contracts);
const validateVideoSpec = ajv.getSchema(
  `${contracts.$id}#/$defs/VideoSpec`,
) as ValidateFunction;

const plan: ShortPlan = {
  id: "short_1",
  highlightId: "hl_1",
  title: "T",
  hook: "Hooky hook",
  theme: "insight",
  startSec: 10,
  endSec: 25,
  durationSec: 15,
  layout: "full_bleed",
  captionStyle: {
    font: "Inter",
    size: 64,
    color: "#FFFFFF",
    highlightColor: "#FACC15",
    position: "bottom",
  },
  cta: "Follow for more",
  platforms: ["tiktok"],
};

describe("VideoSpec conforms to the shared cross-language schema", () => {
  it("validates a videoTemplateBuilder output", () => {
    const spec = videoTemplateBuilder({ plan });
    const ok = validateVideoSpec(spec);
    if (!ok) {
      throw new Error(JSON.stringify(validateVideoSpec.errors, null, 2));
    }
    expect(ok).toBe(true);
  });

  it("rejects a spec missing required fields", () => {
    const spec = videoTemplateBuilder({ plan }) as unknown as Record<
      string,
      unknown
    >;
    delete spec.captions;
    expect(validateVideoSpec(spec)).toBe(false);
  });

  it("rejects an unknown aspect ratio", () => {
    const spec = videoTemplateBuilder({ plan }) as unknown as Record<
      string,
      unknown
    >;
    spec.aspectRatio = "16:9";
    expect(validateVideoSpec(spec)).toBe(false);
  });
});
