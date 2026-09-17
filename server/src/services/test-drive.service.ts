import type { CreateTestDriveRequest, TestDrive } from "@xiaomi-car/contracts";

export interface TestDriveStore {
  create(userId: string, input: CreateTestDriveRequest, now: Date): Promise<TestDrive>;
  listByUser(userId: string): Promise<TestDrive[]>;
  cancel(userId: string, id: string, now: Date): Promise<TestDrive>;
}

export type TestDriveErrorCode =
  | "TEST_DRIVE_DATE_INVALID"
  | "TEST_DRIVE_NOT_FOUND"
  | "TEST_DRIVE_TRANSITION_INVALID";

export class TestDriveError extends Error {
  constructor(public readonly code: TestDriveErrorCode) {
    super(code);
  }
}

export class InMemoryTestDriveStore implements TestDriveStore {
  readonly records: TestDrive[] = [];
  readonly history: Array<{ id: string; from?: string; to: string; at: Date }> = [];

  async create(
    userId: string,
    input: CreateTestDriveRequest,
    now: Date,
  ): Promise<TestDrive> {
    const record: TestDrive = {
      id: (this.records.length + 1).toString(),
      userId,
      carId: input.carId,
      dealerId: input.dealerId,
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      preferredDate: input.preferredDate,
      status: "submitted",
      ...(input.notes === undefined ? {} : { notes: input.notes }),
      createdAt: now,
    };
    this.records.push(record);
    this.history.push({ id: record.id, to: "submitted", at: now });
    return record;
  }

  async listByUser(userId: string): Promise<TestDrive[]> {
    return this.records.filter((record) => record.userId === userId);
  }

  async cancel(userId: string, id: string, now: Date): Promise<TestDrive> {
    const record = this.records.find(
      (candidate) => candidate.id === id && candidate.userId === userId,
    );
    if (!record) throw new TestDriveError("TEST_DRIVE_NOT_FOUND");
    if (!["submitted", "contacted"].includes(record.status)) {
      throw new TestDriveError("TEST_DRIVE_TRANSITION_INVALID");
    }
    const previous = record.status;
    record.status = "cancelled";
    this.history.push({ id, from: previous, to: "cancelled", at: now });
    return record;
  }
}

export class TestDriveService {
  constructor(
    private readonly store: TestDriveStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(userId: string, input: CreateTestDriveRequest): Promise<TestDrive> {
    const today = this.now().toISOString().slice(0, 10);
    if (input.preferredDate <= today) {
      throw new TestDriveError("TEST_DRIVE_DATE_INVALID");
    }
    return this.store.create(userId, input, this.now());
  }

  async listForUser(userId: string): Promise<TestDrive[]> {
    return this.store.listByUser(userId);
  }

  async cancel(userId: string, id: string): Promise<TestDrive> {
    return this.store.cancel(userId, id, this.now());
  }
}
