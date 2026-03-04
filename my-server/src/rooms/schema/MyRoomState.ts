import { Schema, MapSchema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") color: number = 0x3498db;
  @type("string") name: string = "";
  @type("number") hp: number = 100;
  @type("number") maxHp: number = 100;
  @type("boolean") alive: boolean = true;
  @type("number") kills: number = 0;
  @type("string") spriteKey: string = "archer";
}

export class MyRoomState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type("boolean") gameOver: boolean = false;
}
