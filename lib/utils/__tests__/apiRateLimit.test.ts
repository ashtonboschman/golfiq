import { checkRateLimit, getApiUsageStats, logApiCall } from "../apiRateLimit";
import { prisma } from "@/lib/db";

jest.mock("@/lib/db", () => ({
  prisma: {
    apiUsageLog: {
      count: jest.fn(),
      create: jest.fn(),
    },
  },
}));

const mockedPrisma = prisma as unknown as {
  apiUsageLog: {
    count: jest.Mock;
    create: jest.Mock;
  };
};

describe("apiRateLimit utils", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-02-04T10:15:00.000Z"));
    mockedPrisma.apiUsageLog.count.mockReset();
    mockedPrisma.apiUsageLog.create.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("allows proceeding when under the daily limit", async () => {
    mockedPrisma.apiUsageLog.count.mockResolvedValue(5);

    const result = await checkRateLimit("search", 10);

    expect(result).toEqual({ canProceed: true, callsUsed: 5, limit: 10 });
    expect(mockedPrisma.apiUsageLog.count).toHaveBeenCalledTimes(1);
  });

  it("blocks when the daily limit is reached", async () => {
    mockedPrisma.apiUsageLog.count.mockResolvedValue(10);

    const result = await checkRateLimit("search", 10);

    expect(result).toEqual({ canProceed: false, callsUsed: 10, limit: 10 });
  });

  it("uses the default daily limit when none provided", async () => {
    mockedPrisma.apiUsageLog.count.mockResolvedValue(199);

    const result = await checkRateLimit("search");

    expect(result.limit).toBe(200);
    expect(result.canProceed).toBe(true);
  });

  it("logs API calls with endpoint/user/ip", async () => {
    mockedPrisma.apiUsageLog.create.mockResolvedValue({});

    await logApiCall("search", BigInt(1), "127.0.0.1");

    expect(mockedPrisma.apiUsageLog.create).toHaveBeenCalledWith({
      data: { endpoint: "search", userId: BigInt(1), ipAddress: "127.0.0.1" },
    });
  });

  it("returns usage stats with remaining count", async () => {
    mockedPrisma.apiUsageLog.count.mockResolvedValue(42);

    const result = await getApiUsageStats("search", 100);

    expect(result).toEqual({ callsUsed: 42, limit: 100, remaining: 58 });
  });

  it("never returns negative remaining count", async () => {
    mockedPrisma.apiUsageLog.count.mockResolvedValue(250);

    const result = await getApiUsageStats("search", 200);

    expect(result.remaining).toBe(0);
  });
});
