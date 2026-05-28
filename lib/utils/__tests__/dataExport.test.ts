import {
  canUserExport,
  recordDataExport,
  getUserExportHistory,
  getMonthlyExportStats,
} from "../dataExport";
import { prisma } from "@/lib/db";

jest.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    dataExport: {
      count: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

const mockedPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  dataExport: {
    count: jest.Mock;
    create: jest.Mock;
    findMany: jest.Mock;
  };
};

describe("dataExport utils", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-02-04T10:15:00.000Z"));
    mockedPrisma.user.findUnique.mockReset();
    mockedPrisma.dataExport.count.mockReset();
    mockedPrisma.dataExport.create.mockReset();
    mockedPrisma.dataExport.findMany.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns user not found when missing", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null);

    const result = await canUserExport(BigInt(1));

    expect(result).toEqual({ canExport: false, reason: "User not found" });
  });

  it("allows users to export when account exists", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ subscriptionTier: "premium" });

    const result = await canUserExport(BigInt(1));

    expect(result).toEqual({ canExport: true });
    expect(mockedPrisma.dataExport.count).not.toHaveBeenCalled();
  });

  it("records data exports", async () => {
    mockedPrisma.dataExport.create.mockResolvedValue({});

    await recordDataExport({ userId: BigInt(1), format: "csv", recordCount: 12 });

    expect(mockedPrisma.dataExport.create).toHaveBeenCalledWith({
      data: { userId: BigInt(1), format: "csv", recordCount: 12 },
    });
  });

  it("fetches export history with limit", async () => {
    mockedPrisma.dataExport.findMany.mockResolvedValue([{ id: 1 }]);

    const result = await getUserExportHistory(BigInt(1), 5);

    expect(mockedPrisma.dataExport.findMany).toHaveBeenCalledWith({
      where: { userId: BigInt(1) },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    expect(result).toEqual([{ id: 1 }]);
  });

  it("returns monthly export stats with mapped fields", async () => {
    const now = new Date("2026-02-04T10:15:00.000Z");
    mockedPrisma.dataExport.findMany.mockResolvedValue([
      { format: "csv", recordCount: 10, createdAt: now },
      { format: "json", recordCount: 5, createdAt: now },
    ]);

    const result = await getMonthlyExportStats(BigInt(1));

    expect(result.count).toBe(2);
    expect(result.exports).toEqual([
      { format: "csv", recordCount: 10, date: now },
      { format: "json", recordCount: 5, date: now },
    ]);
  });

  it("uses default history limit when none provided", async () => {
    mockedPrisma.dataExport.findMany.mockResolvedValue([]);

    await getUserExportHistory(BigInt(1));

    expect(mockedPrisma.dataExport.findMany).toHaveBeenCalledWith({
      where: { userId: BigInt(1) },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
  });
});
