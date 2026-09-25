import test from "node:test";
import assert from "node:assert/strict";
import { originalLinks, sourceCatalog, historicLeads } from "../lib/source-discovery.ts";

test("original statement discovery keeps only direct official source URLs", () => {
  const links = originalLinks(`
    <a href="/media/press-releases/leader-speaks">Original</a>
    <a href="https://attacker.example/media/press-releases/leader-speaks">Imitation</a>
    <a href="/media/press-releases">Index</a>
    <a href="/media/press-releases/leader-speaks?utm_source=email#paragraph">Duplicate</a>
    <a href="https://democraticleader.house.gov.evil.test/media/press-releases/leader-speaks">Fake host</a>
  `, "https://democraticleader.house.gov/media/press-releases", "democraticleader.house.gov", /^\/media\/press-releases\/.+/);
  assert.deepEqual(links, ["https://democraticleader.house.gov/media/press-releases/leader-speaks"]);
});

test("current source adapters keep original recordings separate from transcripts", () => {
  const video = sourceCatalog.find(x => x.id === "white-house-video");
  assert.ok(video);
  const links = originalLinks('<a href="/videos/president-trump-delivers-remarks-sep-22-2026/">Video</a><a href="/remarks/">Index</a>',
    video.index, video.host, video.path);
  assert.deepEqual(links, ["https://www.whitehouse.gov/videos/president-trump-delivers-remarks-sep-22-2026/"]);
  assert.match(video.medium, /needs-transcript/);
  assert.ok(historicLeads.some(x => x.medium === "debate/transcript" && x.lane === "Multi-speaker"));
});
