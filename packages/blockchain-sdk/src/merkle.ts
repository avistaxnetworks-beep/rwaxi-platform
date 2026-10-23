/**
 * Data Room integrity: SHA-256 Merkle tree over document hashes.
 *
 * - Leaf   = SHA-256 of the raw document bytes (computed in the browser before upload).
 * - Leaves are de-duplicated and sorted ascending, so the root does not depend on upload order.
 * - Parent = SHA-256(min(a, b) || max(a, b)) — commutative pairs, so a proof needs no left/right flags.
 * - An odd node at the end of a layer is promoted unchanged.
 *
 * The root is anchored on-chain via RwaxiPropertyToken.updateDataRoomMerkleRoot(bytes32) and quoted
 * in the NDA / subscription documents ({{DATAROOM_MERKLE_ROOT}}).
 *
 * Note: the approved prototype used a flat digest, sha256(sorted hex hashes joined). That value is kept
 * as `prototypeDataRoomDigest` for migration checks only; production roots come from `merkleRoot`.
 */
import { concat, sha256, type Hex } from "viem";

export type Bytes32 = Hex;

export const ZERO_ROOT: Bytes32 = `0x${"0".repeat(64)}`;

const HEX32 = /^(0x)?[0-9a-fA-F]{64}$/;

/** Normalises a 32-byte hash (with or without 0x) to lowercase 0x-prefixed hex. */
export function toBytes32(hash: string): Bytes32 {
  if (!HEX32.test(hash)) throw new Error(`Not a 32-byte hex hash: ${hash}`);
  return (hash.startsWith("0x") ? hash : `0x${hash}`).toLowerCase() as Bytes32;
}

/** SHA-256 of a document (bytes or UTF-8 text) as bytes32. Works in browser, Edge and Node. */
export function sha256Document(data: Uint8Array | ArrayBuffer | string): Bytes32 {
  const bytes =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
  return sha256(bytes);
}

export function hashPair(a: Bytes32, b: Bytes32): Bytes32 {
  return sha256(a < b ? concat([a, b]) : concat([b, a]));
}

export interface MerkleTree {
  /** layers[0] = sorted unique leaves, last layer = [root]. */
  layers: Bytes32[][];
  root: Bytes32;
}

export function buildMerkleTree(leafHashes: readonly string[]): MerkleTree {
  const leaves = [...new Set(leafHashes.map(toBytes32))].sort();
  if (leaves.length === 0) return { layers: [[]], root: ZERO_ROOT };
  const layers: Bytes32[][] = [leaves];
  while (layers[layers.length - 1]!.length > 1) {
    const prev = layers[layers.length - 1]!;
    const next: Bytes32[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      const left = prev[i]!;
      const right = prev[i + 1];
      next.push(right === undefined ? left : hashPair(left, right));
    }
    layers.push(next);
  }
  return { layers, root: layers[layers.length - 1]![0]! };
}

export function merkleRoot(leafHashes: readonly string[]): Bytes32 {
  return buildMerkleTree(leafHashes).root;
}

/** Root for a Data Room given its documents' SHA-256 hashes. */
export function computeDataRoomRoot(docs: readonly { sha256: string }[]): Bytes32 {
  return merkleRoot(docs.map((d) => d.sha256));
}

/** Inclusion proof (sibling hashes, bottom-up) for one document hash. */
export function getMerkleProof(tree: MerkleTree, leafHash: string): Bytes32[] {
  const leaf = toBytes32(leafHash);
  let index = tree.layers[0]!.indexOf(leaf);
  if (index < 0) throw new Error(`Leaf not in tree: ${leaf}`);
  const proof: Bytes32[] = [];
  for (let level = 0; level < tree.layers.length - 1; level++) {
    const layer = tree.layers[level]!;
    const sibling = layer[index ^ 1];
    if (sibling !== undefined) proof.push(sibling);
    index = Math.floor(index / 2);
  }
  return proof;
}

export function verifyMerkleProof(leafHash: string, proof: readonly string[], root: string): boolean {
  const computed = proof.map(toBytes32).reduce<Bytes32>((acc, sib) => hashPair(acc, sib), toBytes32(leafHash));
  return computed === toBytes32(root);
}

/** Flat digest used by the prototype: sha256(sorted lowercase hex hashes, no 0x, concatenated). */
export function prototypeDataRoomDigest(leafHashes: readonly string[]): Bytes32 {
  const joined = leafHashes
    .map((h) => toBytes32(h).slice(2))
    .sort()
    .join("");
  return sha256Document(joined);
}
