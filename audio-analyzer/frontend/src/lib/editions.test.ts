import { describe, it, expect } from "vitest";
import {
  EDITIONS,
  FEATURES,
  FEATURE_ORDER,
  hasFeature,
  requiredEdition,
  featuresFor,
  isEdition,
  type FeatureKey,
} from "./editions";

describe("editions feature matrix", () => {
  it("free ⊂ pro ⊂ studio (strict superset chain)", () => {
    const free = new Set(featuresFor("free"));
    const pro = new Set(featuresFor("pro"));
    const studio = new Set(featuresFor("studio"));
    for (const k of free) expect(pro.has(k)).toBe(true);
    for (const k of pro) expect(studio.has(k)).toBe(true);
    expect(pro.size).toBeGreaterThan(free.size);
    expect(studio.size).toBeGreaterThan(pro.size);
  });

  it("studio has every feature", () => {
    for (const key of FEATURE_ORDER) {
      expect(hasFeature("studio", key)).toBe(true);
    }
    expect(featuresFor("studio").length).toBe(FEATURE_ORDER.length);
  });

  it("free has the core, none of the pro/studio features", () => {
    expect(hasFeature("free", "rta")).toBe(true);
    expect(hasFeature("free", "spl")).toBe(true);
    expect(hasFeature("free", "sessions")).toBe(true);
    expect(hasFeature("free", "transfer")).toBe(false);
    expect(hasFeature("free", "spectrograph")).toBe(false);
    expect(hasFeature("free", "ir")).toBe(false);
    expect(hasFeature("free", "splLogging")).toBe(false);
  });

  it("pro unlocks the RT feature set but not the studio-only ones", () => {
    expect(hasFeature("pro", "transfer")).toBe(true);
    expect(hasFeature("pro", "spectrograph")).toBe(true);
    expect(hasFeature("pro", "signalGenerator")).toBe(true);
    expect(hasFeature("pro", "delayFinder")).toBe(true);
    expect(hasFeature("pro", "traces")).toBe(true);
    expect(hasFeature("pro", "ir")).toBe(false);
    expect(hasFeature("pro", "splLogging")).toBe(false);
  });

  it("requiredEdition matches the FEATURES minEdition", () => {
    for (const key of FEATURE_ORDER) {
      expect(requiredEdition(key)).toBe(FEATURES[key].minEdition);
    }
    expect(requiredEdition("ir")).toBe("studio");
    expect(requiredEdition("transfer")).toBe("pro");
    expect(requiredEdition("rta")).toBe("free");
  });

  it("FEATURES.editions is consistent with hasFeature", () => {
    for (const key of Object.keys(FEATURES) as FeatureKey[]) {
      for (const e of EDITIONS) {
        expect(FEATURES[key].editions.includes(e)).toBe(hasFeature(e, key));
      }
    }
  });

  it("isEdition narrows valid strings only", () => {
    expect(isEdition("free")).toBe(true);
    expect(isEdition("pro")).toBe(true);
    expect(isEdition("studio")).toBe(true);
    expect(isEdition("enterprise")).toBe(false);
    expect(isEdition(null)).toBe(false);
    expect(isEdition(2)).toBe(false);
  });

  it("FEATURE_ORDER lists every feature exactly once", () => {
    const keys = Object.keys(FEATURES) as FeatureKey[];
    expect(FEATURE_ORDER.slice().sort()).toEqual(keys.slice().sort());
    expect(new Set(FEATURE_ORDER).size).toBe(FEATURE_ORDER.length);
  });
});
