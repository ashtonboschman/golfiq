import { getLocalDateString } from "../../dateUtils";

describe("dateUtils", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns YYYY-MM-DD for local date", () => {
    jest.setSystemTime(new Date("2026-02-04T10:15:00.000Z"));
    expect(getLocalDateString()).toBe("2026-02-04");
  });
});
