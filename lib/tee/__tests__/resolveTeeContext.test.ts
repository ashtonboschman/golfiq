import { getHolesPlayedForSegment, getValidTeeSegments, resolveTeeContext } from "../resolveTeeContext";

const baseTee18 = {
  numberOfHoles: 18,
  courseRating: 72,
  slopeRating: 113,
  bogeyRating: 98,
  parTotal: 72,
  nonPar3Holes: 14,
  frontCourseRating: 36,
  frontSlopeRating: 113,
  frontBogeyRating: 49,
  backCourseRating: 36,
  backSlopeRating: 113,
  backBogeyRating: 49,
  holes: Array.from({ length: 18 }, (_, i) => ({
    holeNumber: i + 1,
    par: i % 3 === 0 ? 3 : i % 3 === 1 ? 4 : 5,
  })),
};

const baseTee9 = {
  numberOfHoles: 9,
  courseRating: 36,
  slopeRating: 113,
  bogeyRating: 49,
  parTotal: 36,
  nonPar3Holes: 7,
  frontCourseRating: null,
  frontSlopeRating: null,
  frontBogeyRating: null,
  backCourseRating: null,
  backSlopeRating: null,
  backBogeyRating: null,
  holes: Array.from({ length: 9 }, (_, i) => ({
    holeNumber: i + 1,
    par: i % 3 === 0 ? 3 : i % 3 === 1 ? 4 : 5,
  })),
};

describe("resolveTeeContext", () => {
  it("resolves full 18-hole tee", () => {
    const ctx = resolveTeeContext(baseTee18, "full");

    expect(ctx.holes).toBe(18);
    expect(ctx.courseRating).toBe(72);
    expect(ctx.slopeRating).toBe(113);
    expect(ctx.parTotal).toBe(72);
    expect(ctx.nonPar3Holes).toBe(14);
    expect(ctx.holeRange).toHaveLength(18);
  });

  it("resolves front9 segment", () => {
    const ctx = resolveTeeContext(baseTee18, "front9");

    expect(ctx.holes).toBe(9);
    expect(ctx.courseRating).toBe(36);
    expect(ctx.slopeRating).toBe(113);
    expect(ctx.parTotal).toBe(36);
    expect(ctx.nonPar3Holes).toBe(6);
    expect(ctx.holeRange).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("resolves back9 segment", () => {
    const ctx = resolveTeeContext(baseTee18, "back9");

    expect(ctx.holes).toBe(9);
    expect(ctx.courseRating).toBe(36);
    expect(ctx.slopeRating).toBe(113);
    expect(ctx.parTotal).toBe(36);
    expect(ctx.nonPar3Holes).toBe(6);
    expect(ctx.holeRange).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });

  it("resolves double9 segment", () => {
    const ctx = resolveTeeContext(baseTee9, "double9");

    expect(ctx.holes).toBe(18);
    expect(ctx.courseRating).toBe(72);
    expect(ctx.slopeRating).toBe(113);
    expect(ctx.parTotal).toBe(72);
    expect(ctx.nonPar3Holes).toBe(14);
    expect(ctx.holeRange).toHaveLength(18);
  });

  it("throws for invalid tee segment", () => {
    expect(() => resolveTeeContext(baseTee18 as any, "invalid")).toThrow(
      "Invalid tee_segment"
    );
  });
});

describe("getValidTeeSegments", () => {
  it("returns full/front9/back9 for 18-hole tee", () => {
    const segments = getValidTeeSegments(baseTee18);
    const values = segments.map(s => s.value);

    expect(values).toEqual(["full", "front9", "back9"]);
  });

  it("returns full/double9 for 9-hole tee", () => {
    const segments = getValidTeeSegments(baseTee9);
    const values = segments.map(s => s.value);

    expect(values).toEqual(["full", "double9"]);
  });
});

describe("getHolesPlayedForSegment", () => {
  it("returns holes for segments", () => {
    expect(getHolesPlayedForSegment("front9")).toBe(9);
    expect(getHolesPlayedForSegment("back9")).toBe(9);
    expect(getHolesPlayedForSegment("double9")).toBe(18);
  });

  it("throws for full segment", () => {
    expect(() => getHolesPlayedForSegment("full")).toThrow(
      "Use tee.numberOfHoles for full segment"
    );
  });
});
