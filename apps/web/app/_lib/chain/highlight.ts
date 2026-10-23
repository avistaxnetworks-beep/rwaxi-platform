// @ts-nocheck — ported verbatim from rwaxi-prototype-reference.tsx.html; type progressively.
export function highlightSol(e) {
  const a =
    /\b(pragma|solidity|import|from|contract|interface|is|function|external|public|internal|private|view|pure|returns|return|override|virtual|memory|calldata|storage|constant|immutable|event|error|emit|revert|require|if|struct|mapping|constructor|modifier|new|bool|address|string|bytes32|uint256|uint64|uint16|uint8|true|false)\b/g;
  return e
    .split(
      `
`,
    )
    .map((t) => {
      const o = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
        n = o.indexOf("//"),
        l = n >= 0 ? o.slice(0, n) : o,
        r = n >= 0 ? o.slice(n) : "";
      return (
        l
          .replace(/("[^"]*")/g, "$1")
          .replace(a, '<span class="sol-kw">$1</span>')
          .replace(/\u0001([^\u0002]*)\u0002/g, '<span class="sol-str">$1</span>') +
        (r ? `<span class="sol-cm">${r}</span>` : "")
      );
    });
}
