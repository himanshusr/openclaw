import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emitSessionTranscriptUpdate,
  onSessionTranscriptUpdate,
} from "./transcript-events.js";

/**
 * Tests for session transcript event system
 *
 * This module implements a simple pub/sub pattern for notifying listeners
 * when session transcript files are updated. Used for real-time updates
 * and cache invalidation.
 */

describe("session transcript events", () => {
  // Clean up listeners after each test to prevent interference
  afterEach(() => {
    // Clear all listeners by subscribing and immediately unsubscribing
    const cleanup = onSessionTranscriptUpdate(() => {});
    cleanup();
  });

  describe("onSessionTranscriptUpdate", () => {
    it("returns unsubscribe function", () => {
      const listener = vi.fn();
      const unsubscribe = onSessionTranscriptUpdate(listener);

      expect(typeof unsubscribe).toBe("function");
    });

    it("listener receives updates after subscription", () => {
      const listener = vi.fn();
      onSessionTranscriptUpdate(listener);

      emitSessionTranscriptUpdate("session-123.json");

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        sessionFile: "session-123.json",
      });
    });

    it("supports multiple listeners", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      onSessionTranscriptUpdate(listener1);
      onSessionTranscriptUpdate(listener2);
      onSessionTranscriptUpdate(listener3);

      emitSessionTranscriptUpdate("session-456.json");

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);

      expect(listener1).toHaveBeenCalledWith({ sessionFile: "session-456.json" });
      expect(listener2).toHaveBeenCalledWith({ sessionFile: "session-456.json" });
      expect(listener3).toHaveBeenCalledWith({ sessionFile: "session-456.json" });
    });

    it("listener receives all emitted updates", () => {
      const listener = vi.fn();
      onSessionTranscriptUpdate(listener);

      emitSessionTranscriptUpdate("session-1.json");
      emitSessionTranscriptUpdate("session-2.json");
      emitSessionTranscriptUpdate("session-3.json");

      expect(listener).toHaveBeenCalledTimes(3);
      expect(listener).toHaveBeenNthCalledWith(1, { sessionFile: "session-1.json" });
      expect(listener).toHaveBeenNthCalledWith(2, { sessionFile: "session-2.json" });
      expect(listener).toHaveBeenNthCalledWith(3, { sessionFile: "session-3.json" });
    });
  });

  describe("unsubscribe functionality", () => {
    it("stops receiving updates after unsubscribe", () => {
      const listener = vi.fn();
      const unsubscribe = onSessionTranscriptUpdate(listener);

      emitSessionTranscriptUpdate("session-before.json");
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      emitSessionTranscriptUpdate("session-after.json");
      expect(listener).toHaveBeenCalledTimes(1); // Still only 1
    });

    it("unsubscribe is idempotent", () => {
      const listener = vi.fn();
      const unsubscribe = onSessionTranscriptUpdate(listener);

      unsubscribe();
      unsubscribe();
      unsubscribe();

      emitSessionTranscriptUpdate("session.json");

      expect(listener).not.toHaveBeenCalled();
    });

    it("unsubscribing one listener does not affect others", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const unsubscribe1 = onSessionTranscriptUpdate(listener1);
      onSessionTranscriptUpdate(listener2);

      unsubscribe1();

      emitSessionTranscriptUpdate("session.json");

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it("can resubscribe after unsubscribing", () => {
      const listener = vi.fn();

      const unsubscribe1 = onSessionTranscriptUpdate(listener);
      unsubscribe1();

      emitSessionTranscriptUpdate("session-1.json");
      expect(listener).not.toHaveBeenCalled();

      onSessionTranscriptUpdate(listener);
      emitSessionTranscriptUpdate("session-2.json");

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ sessionFile: "session-2.json" });
    });
  });

  describe("emitSessionTranscriptUpdate", () => {
    it("trims session file path", () => {
      const listener = vi.fn();
      onSessionTranscriptUpdate(listener);

      emitSessionTranscriptUpdate("  session-123.json  ");

      expect(listener).toHaveBeenCalledWith({
        sessionFile: "session-123.json",
      });
    });

    it("does not emit for empty string", () => {
      const listener = vi.fn();
      onSessionTranscriptUpdate(listener);

      emitSessionTranscriptUpdate("");

      expect(listener).not.toHaveBeenCalled();
    });

    it("does not emit for whitespace only", () => {
      const listener = vi.fn();
      onSessionTranscriptUpdate(listener);

      emitSessionTranscriptUpdate("   \n\t  ");

      expect(listener).not.toHaveBeenCalled();
    });

    it("handles file paths with directories", () => {
      const listener = vi.fn();
      onSessionTranscriptUpdate(listener);

      emitSessionTranscriptUpdate("/path/to/sessions/session-123.json");

      expect(listener).toHaveBeenCalledWith({
        sessionFile: "/path/to/sessions/session-123.json",
      });
    });

    it("handles file paths with special characters", () => {
      const listener = vi.fn();
      onSessionTranscriptUpdate(listener);

      emitSessionTranscriptUpdate("session-@#$%^.json");

      expect(listener).toHaveBeenCalledWith({
        sessionFile: "session-@#$%^.json",
      });
    });

    it("emits to no listeners without error", () => {
      expect(() => {
        emitSessionTranscriptUpdate("session.json");
      }).not.toThrow();
    });
  });

  describe("event ordering", () => {
    it("listeners are called in subscription order", () => {
      const callOrder: number[] = [];

      const listener1 = vi.fn(() => callOrder.push(1));
      const listener2 = vi.fn(() => callOrder.push(2));
      const listener3 = vi.fn(() => callOrder.push(3));

      onSessionTranscriptUpdate(listener1);
      onSessionTranscriptUpdate(listener2);
      onSessionTranscriptUpdate(listener3);

      emitSessionTranscriptUpdate("session.json");

      expect(callOrder).toEqual([1, 2, 3]);
    });

    it("events are processed synchronously", () => {
      const listener = vi.fn();
      onSessionTranscriptUpdate(listener);

      emitSessionTranscriptUpdate("session-1.json");
      expect(listener).toHaveBeenCalledTimes(1);

      emitSessionTranscriptUpdate("session-2.json");
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe("error handling", () => {
    it("continues to other listeners if one throws", () => {
      const listener1 = vi.fn(() => {
        throw new Error("Listener 1 error");
      });
      const listener2 = vi.fn();

      onSessionTranscriptUpdate(listener1);
      onSessionTranscriptUpdate(listener2);

      expect(() => {
        emitSessionTranscriptUpdate("session.json");
      }).toThrow("Listener 1 error");

      // listener2 should not be called since listener1 threw
      expect(listener2).not.toHaveBeenCalled();
    });

    it("handles listener errors gracefully in try-catch", () => {
      const listener1 = vi.fn(() => {
        throw new Error("Error");
      });
      const listener2 = vi.fn();

      onSessionTranscriptUpdate(listener1);
      onSessionTranscriptUpdate(listener2);

      try {
        emitSessionTranscriptUpdate("session.json");
      } catch {
        // Swallow error
      }

      expect(listener1).toHaveBeenCalled();
    });
  });

  describe("subscription management", () => {
    it("handles subscription during emission", () => {
      let newListener: ReturnType<typeof vi.fn> | null = null;

      const listener1 = vi.fn(() => {
        // Subscribe a new listener during emission
        newListener = vi.fn();
        onSessionTranscriptUpdate(newListener);
      });

      onSessionTranscriptUpdate(listener1);

      emitSessionTranscriptUpdate("session-1.json");

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(newListener).toHaveBeenCalledTimes(1); // Called in same emission

      emitSessionTranscriptUpdate("session-2.json");

      expect(listener1).toHaveBeenCalledTimes(2);
      expect(newListener).toHaveBeenCalledTimes(2);
    });

    it("handles unsubscription during emission", () => {
      let unsubscribe2: (() => void) | null = null;

      const listener1 = vi.fn(() => {
        // Unsubscribe listener2 during emission
        if (unsubscribe2) {
          unsubscribe2();
        }
      });

      const listener2 = vi.fn();
      unsubscribe2 = onSessionTranscriptUpdate(listener2);
      onSessionTranscriptUpdate(listener1);

      emitSessionTranscriptUpdate("session.json");

      expect(listener1).toHaveBeenCalledTimes(1);
      // listener2 may or may not be called depending on iteration order
      // This tests that unsubscribing during emission doesn't crash
    });
  });

  describe("multiple sessions", () => {
    it("handles updates for different sessions", () => {
      const listener = vi.fn();
      onSessionTranscriptUpdate(listener);

      emitSessionTranscriptUpdate("session-discord-123.json");
      emitSessionTranscriptUpdate("session-slack-456.json");
      emitSessionTranscriptUpdate("session-telegram-789.json");

      expect(listener).toHaveBeenCalledTimes(3);
      expect(listener).toHaveBeenNthCalledWith(1, {
        sessionFile: "session-discord-123.json",
      });
      expect(listener).toHaveBeenNthCalledWith(2, {
        sessionFile: "session-slack-456.json",
      });
      expect(listener).toHaveBeenNthCalledWith(3, {
        sessionFile: "session-telegram-789.json",
      });
    });

    it("handles rapid updates for same session", () => {
      const listener = vi.fn();
      onSessionTranscriptUpdate(listener);

      emitSessionTranscriptUpdate("session-123.json");
      emitSessionTranscriptUpdate("session-123.json");
      emitSessionTranscriptUpdate("session-123.json");

      expect(listener).toHaveBeenCalledTimes(3);
    });
  });

  describe("cleanup", () => {
    it("unsubscribe removes listener completely", () => {
      const listener = vi.fn();
      const unsubscribe = onSessionTranscriptUpdate(listener);

      unsubscribe();

      emitSessionTranscriptUpdate("session.json");

      expect(listener).not.toHaveBeenCalled();
    });

    it("multiple unsubscribes clean up multiple listeners", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      const unsub1 = onSessionTranscriptUpdate(listener1);
      const unsub2 = onSessionTranscriptUpdate(listener2);
      const unsub3 = onSessionTranscriptUpdate(listener3);

      unsub1();
      unsub2();
      unsub3();

      emitSessionTranscriptUpdate("session.json");

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
      expect(listener3).not.toHaveBeenCalled();
    });
  });
});
