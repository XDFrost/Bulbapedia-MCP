import { describe, expect, it } from "vitest";
import { parseMoveInfobox } from "../worker/parsers/move.ts";
import { fixture } from "./helpers.ts";

describe("parseMoveInfobox (Thunderbolt)", () => {
	const m = parseMoveInfobox(fixture("thunderbolt.section0.wiki"))!;
	it("parses core fields", () => {
		expect(m.name).toBe("Thunderbolt");
		expect(m.index).toBe(85);
		expect(m.type).toBe("Electric");
		expect(m.damage_category).toBe("Special");
		expect(m.pp).toBe(15);
		expect(m.max_pp).toBe(24);
		expect(m.accuracy).toBe(100);
		expect(m.generation).toBe(1);
	});
	it("separates tooltip notes from numeric power", () => {
		expect(m.power).toBe(90);
		expect(m.power_note).toBe("95 in Generations I-V");
	});
	it("parses flags and machines", () => {
		expect(m.makes_contact).toBe(false);
		expect(m.affected_by_protect).toBe(true);
		expect(m.affected_by_mirror_move).toBe(true);
		expect(m.machines["1"]).toBe("TM24");
		expect(m.machines["8"]).toBe("TR08");
	});
});
