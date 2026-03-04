import assert from "assert";
import { ColyseusTestServer, boot } from "@colyseus/testing";
import appConfig from "../src/app.config.js";
import { MyRoomState } from "../src/rooms/schema/MyRoomState.js";

describe("MyRoom", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;

  before(async () => colyseus = await boot(appConfig));
  after(async () => colyseus.shutdown());
  beforeEach(async () => await colyseus.cleanup());

  it("player joins and is added to state", async () => {
    const room = await colyseus.createRoom<MyRoomState>("my_room", {});
    const client = await colyseus.connectTo(room, { name: "Alice", spriteKey: "archer" });
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId);
    assert.ok(player, "player should be in state");
    assert.strictEqual(player.name, "Alice");
    assert.strictEqual(player.spriteKey, "archer");
    assert.strictEqual(player.alive, true);
    assert.ok(player.hp > 0, "player should have HP");
  });

  it("player spawns at a valid position", async () => {
    const room = await colyseus.createRoom<MyRoomState>("my_room", {});
    const client = await colyseus.connectTo(room, { name: "Bob" });
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId);
    assert.ok(player.x > 0 && player.y > 0, "spawn position should be non-zero");
  });

  it("spriteKey defaults to archer if not provided", async () => {
    const room = await colyseus.createRoom<MyRoomState>("my_room", {});
    const client = await colyseus.connectTo(room, { name: "NoKey" });
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId);
    assert.strictEqual(player.spriteKey, "archer");
  });

  it("player name is capped at 16 characters", async () => {
    const room = await colyseus.createRoom<MyRoomState>("my_room", {});
    const client = await colyseus.connectTo(room, { name: "ABCDEFGHIJKLMNOPQRST" });
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId);
    assert.strictEqual(player.name.length, 16);
  });

  it("multiple players all appear in state", async () => {
    const room = await colyseus.createRoom<MyRoomState>("my_room", {});
    const c1 = await colyseus.connectTo(room, { name: "P1" });
    const c2 = await colyseus.connectTo(room, { name: "P2" });
    await room.waitForNextPatch();

    assert.strictEqual(room.state.players.size, 2);
    assert.ok(room.state.players.has(c1.sessionId));
    assert.ok(room.state.players.has(c2.sessionId));
  });

  it("player is removed from state on leave", async () => {
    const room = await colyseus.createRoom<MyRoomState>("my_room", {});
    const c1 = await colyseus.connectTo(room, { name: "P1" });
    await room.waitForNextPatch();

    assert.strictEqual(room.state.players.size, 1);
    await c1.leave();
    // Give the server time to process the leave (patch may already have fired)
    await new Promise(resolve => setTimeout(resolve, 200));

    assert.strictEqual(room.state.players.size, 0);
  });

  it("private room is marked private in onCreate", async () => {
    const privateRoom = await colyseus.createRoom<MyRoomState>("my_room", { isPrivate: true });
    await colyseus.connectTo(privateRoom, { name: "Host" });
    await privateRoom.waitForNextPatch();

    // setPrivate(true) sets _listing.private = true in Colyseus
    assert.strictEqual((privateRoom as any)._listing.private, true, "private room should have _listing.private = true");
  });

  it("gameOver starts as false", async () => {
    const room = await colyseus.createRoom<MyRoomState>("my_room", {});
    await room.waitForNextPatch();

    assert.strictEqual(room.state.gameOver, false);
  });

  it("host can trigger endGame", async () => {
    const room = await colyseus.createRoom<MyRoomState>("my_room", {});
    const host = await colyseus.connectTo(room, { name: "Host" });
    await room.waitForNextPatch();

    host.send("endGame");
    await room.waitForNextPatch();

    assert.strictEqual(room.state.gameOver, true);
  });

  it("non-host cannot trigger endGame", async () => {
    const room = await colyseus.createRoom<MyRoomState>("my_room", {});
    await colyseus.connectTo(room, { name: "Host" });
    const nonHost = await colyseus.connectTo(room, { name: "Guest" });
    await room.waitForNextPatch();

    nonHost.send("endGame");
    await room.waitForNextPatch();

    assert.strictEqual(room.state.gameOver, false);
  });
});
