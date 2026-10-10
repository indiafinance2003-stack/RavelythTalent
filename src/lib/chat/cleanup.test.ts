import { beforeEach, describe, expect, it } from "vitest";
import {
  chatBlocks,
  chatConversations,
  chatMessages,
  chatReports,
} from "@/lib/db/schema";
import { deleteUserChatData } from "./cleanup";

const deleted: unknown[] = [];
const tx = {
  delete(table: unknown) {
    deleted.push(table);
    return { where: () => Promise.resolve() };
  },
};

describe("user deletion chat cleanup", () => {
  beforeEach(() => {
    deleted.length = 0;
  });

  it("deletes messages, conversations, reports and blocks for the user", async () => {
    await deleteUserChatData(tx, "user-1");
    expect(deleted).toEqual([
      chatMessages,
      chatConversations,
      chatReports,
      chatBlocks,
    ]);
  });
});
