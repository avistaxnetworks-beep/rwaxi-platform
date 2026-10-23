import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ZERO_ROOT,
  buildMerkleTree,
  getMerkleProof,
  merkleRoot,
  sha256Document,
  verifyMerkleProof,
} from "./merkle";

const docs = ["Certificado de tradición", "Estudio de títulos", "Modelo financiero", "Avalúo", "Licencia"].map(
  (d) => sha256Document(d),
);

test("sha256Document matches the known SHA-256 of 'abc'", () => {
  assert.equal(sha256Document("abc"), "0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("root is independent of upload order and duplicates", () => {
  assert.equal(merkleRoot(docs), merkleRoot([...docs].reverse()));
  assert.equal(merkleRoot(docs), merkleRoot([...docs, docs[0]!]));
});

test("root changes when any document changes", () => {
  const tampered = [...docs.slice(1), sha256Document("Certificado de tradición v2")];
  assert.notEqual(merkleRoot(docs), merkleRoot(tampered));
});

test("every document has a valid inclusion proof (odd leaf count)", () => {
  const tree = buildMerkleTree(docs);
  for (const d of docs) assert.ok(verifyMerkleProof(d, getMerkleProof(tree, d), tree.root));
  assert.equal(verifyMerkleProof(sha256Document("otro"), getMerkleProof(tree, docs[0]!), tree.root), false);
});

test("empty and single-document data rooms", () => {
  assert.equal(merkleRoot([]), ZERO_ROOT);
  assert.equal(merkleRoot([docs[0]!]), docs[0]);
});
