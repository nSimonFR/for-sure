import assert from "node:assert/strict";
import { test } from "node:test";
import { collectHistoryPages, PAGE_SIZE } from "./client.js";
import type { SumeriaTransaction } from "./types.js";

const tx = (id: string) => ({ id }) as SumeriaTransaction;

// Builds a fake server holding `total` rows, serving `size` at a time from `from`.
function fakeServer(total: number, pageSize = PAGE_SIZE) {
  const all = Array.from({ length: total }, (_, i) => tx(`t${i}`));
  const calls: Array<{ from: number; size: number }> = [];
  const fetchPage = async (from: number, size: number) => {
    calls.push({ from, size });
    return { total, items: all.slice(from, from + size) };
  };
  return { fetchPage, calls, pageSize };
}

// The regression this file exists for: the client posted {size: 999, from: 0}
// once and returned, so everything beyond the first page was invisible to Sure —
// and therefore uncorrectable forever, since the importer can only refresh ids
// the provider actually returns.
test("walks past the first page and returns every transaction", async () => {
  const { fetchPage, calls } = fakeServer(2160);
  const got = await collectHistoryPages(fetchPage);
  assert.equal(got.length, 2160);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((c) => c.from), [0, 999, 1998]);
});

test("a single short page costs exactly one request", async () => {
  const { fetchPage, calls } = fakeServer(19);
  assert.equal((await collectHistoryPages(fetchPage)).length, 19);
  assert.equal(calls.length, 1);
});

test("an exact multiple of the page size terminates on total", async () => {
  const { fetchPage, calls } = fakeServer(1998);
  assert.equal((await collectHistoryPages(fetchPage)).length, 1998);
  assert.equal(calls.length, 2);
});

test("an empty account returns nothing without looping", async () => {
  const { fetchPage, calls } = fakeServer(0);
  assert.deepEqual(await collectHistoryPages(fetchPage), []);
  assert.equal(calls.length, 1);
});

// The sort window shifts if a transaction lands mid-pagination, so the same row
// can come back on two pages.
test("ids repeated across pages are returned once", async () => {
  let call = 0;
  const fetchPage = async () => {
    call++;
    return call === 1
      ? { total: 4, items: [tx("a"), tx("b")] }
      : { total: 4, items: [tx("b"), tx("c")] };
  };
  const got = await collectHistoryPages(fetchPage, 2, 10);
  assert.deepEqual(got.map((t) => t.id), ["a", "b", "c"]);
});

// Without this guard a server that ignores `from` would be paged forever.
test("a server ignoring `from` is stopped, not looped", async () => {
  let calls = 0;
  const fetchPage = async () => {
    calls++;
    return { total: 10_000, items: [tx("same-1"), tx("same-2")] };
  };
  const got = await collectHistoryPages(fetchPage, 2, 50);
  assert.equal(got.length, 2);
  assert.equal(calls, 2); // one page, one that adds nothing, then stop
});

test("maxPages caps the walk even when the server keeps yielding", async () => {
  let n = 0;
  const fetchPage = async () => ({ total: 1e9, items: [tx(`u${n++}`), tx(`u${n++}`)] });
  const got = await collectHistoryPages(fetchPage, 2, 3);
  assert.equal(got.length, 6);
});

// `total` is advisory: paging must still terminate on a short page without it.
test("a response without `total` still terminates", async () => {
  let call = 0;
  const fetchPage = async () => {
    call++;
    return call === 1 ? { items: [tx("a"), tx("b")] } : { items: [tx("c")] };
  };
  const got = await collectHistoryPages(fetchPage, 2, 10);
  assert.deepEqual(got.map((t) => t.id), ["a", "b", "c"]);
});
