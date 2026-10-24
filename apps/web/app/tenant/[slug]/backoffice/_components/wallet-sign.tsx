"use client";

import { useState } from "react";
import { Icon } from "@/app/_components/ui/icon";
import { useI18n } from "@/app/_i18n/provider";
import { shortHash } from "@/app/_lib/format";
import { confirmWalletTransaction, prepareWalletTransaction } from "../chain-actions";

/** The provider a browser wallet injects (MetaMask, Rabby, Frame…): EIP-1193 `request`. */
interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}
type Step = "idle" | "prepare" | "connect" | "chain" | "role" | "sign" | "verify";

const hexChain = (id: number) => `0x${id.toString(16)}`;
const codeOf = (e: unknown) =>
  e && typeof e === "object" && "code" in e ? Number((e as { code: unknown }).code) : null;
const detailOf = (e: unknown) =>
  (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e))
    .split("\n")[0]!
    .slice(0, 200);
const TRUE_WORD = /^0x0*1$/i;
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
// EIP-1193 / EIP-3326 error codes
const USER_REJECTED = 4001;
const UNRECOGNIZED_CHAIN = 4902;

/**
 * "Firmar con mi wallet" for one queued call (RPC mode). The server prepares the exact call (contract, calldata,
 * chainId, authorised account); the browser checks, through the wallet itself, that it is on that chain with that
 * account and that the account holds the contract role, asks the wallet to sign and send it, and hands the tx hash
 * back — the server confirms the row only after the node shows that very transaction succeeded. No private key
 * ever leaves the wallet.
 */
export function WalletSign({
  chainTxId,
  pendingHash = null,
  disabled,
  onDone,
}: {
  chainTxId: string;
  /** the hash this row is claimed by (sent, receipt not seen yet): offer to verify it instead of signing again */
  pendingHash?: string | null;
  disabled: boolean;
  onDone: (message: string) => void;
}) {
  const { tr } = useI18n();
  const [step, setStep] = useState<Step>("idle");
  const [sentHash, setSentHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** finished attempts (success or not): lets the page — and its tests — tell one attempt from the next */
  const [runs, setRuns] = useState(0);
  const busy = step !== "idle";

  const fail = (message: string) => {
    setError(message);
    setStep("idle");
  };

  // The server's answer refreshes the desk: a hash still awaiting its receipt comes back as `pendingHash`.
  const verify = async (txHash: string) => {
    setSentHash(txHash);
    setStep("verify");
    const result = await confirmWalletTransaction(chainTxId, txHash);
    setSentHash(null);
    if (!result.ok) return fail(result.error);
    setStep("idle");
    if (result.pending) setNotice(result.message);
    else onDone(result.message);
  };

  const sign = async () => {
    const eth = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
    if (!eth || typeof eth.request !== "function") {
      return fail(tr("No se detectó una wallet EIP-1193 en este navegador (MetaMask, Rabby, Frame…)."));
    }
    setStep("prepare");
    const prepared = await prepareWalletTransaction(chainTxId);
    if (!prepared.ok) return fail(prepared.error);
    const call = prepared.call;
    try {
      setStep("connect");
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as unknown;
      const account = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : null;
      if (!account)
        return fail(tr("Tu wallet no compartió ninguna cuenta: conéctala y vuelve a intentarlo."));
      if (account.toLowerCase() !== call.from.toLowerCase()) {
        return fail(
          tr(
            "Tu wallet tiene seleccionada la cuenta {account}; esta operación la firma {expected}. Cámbiala en tu wallet y vuelve a intentarlo.",
            {
              account: shortHash(account, 8, 6),
              expected: shortHash(call.from, 8, 6),
            },
          ),
        );
      }

      setStep("chain");
      const chainNow = async () => Number.parseInt(String(await eth.request({ method: "eth_chainId" })), 16);
      const wrongChain = (actual: number) =>
        tr("Tu wallet está en la red {actual}; cambia a {chain} (chainId {id}) para firmar.", {
          chain: call.chainName,
          id: call.chainId,
          actual,
        });
      const before = await chainNow();
      if (before !== call.chainId) {
        try {
          await eth.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: hexChain(call.chainId) }],
          });
        } catch (e) {
          return fail(
            codeOf(e) === UNRECOGNIZED_CHAIN
              ? tr("Tu wallet no tiene la red {chain} (chainId {id}): añádela y vuelve a intentarlo.", {
                  chain: call.chainName,
                  id: call.chainId,
                })
              : codeOf(e) === USER_REJECTED
                ? tr("Rechazaste el cambio de red: esta operación se firma en {chain} (chainId {id}).", {
                    chain: call.chainName,
                    id: call.chainId,
                  })
                : wrongChain(before),
          );
        }
        const after = await chainNow();
        if (after !== call.chainId) return fail(wrongChain(after));
      }

      // The role, read by the wallet's own node: the server's check is not taken on trust.
      setStep("role");
      const holds = await eth.request({
        method: "eth_call",
        params: [{ to: call.roleCall.to, data: call.roleCall.data }, "latest"],
      });
      if (!TRUE_WORD.test(String(holds))) {
        return fail(
          tr(
            "Según tu wallet, la cuenta {account} no tiene {role} en el contrato {contract}: no se pidió ninguna firma.",
            {
              account: shortHash(account, 8, 6),
              role: call.role,
              contract: shortHash(call.to, 8, 6),
            },
          ),
        );
      }

      setStep("sign");
      const sent = await eth.request({
        method: "eth_sendTransaction",
        params: [
          { from: account, to: call.to, data: call.data, value: "0x0", chainId: hexChain(call.chainId) },
        ],
      });
      if (typeof sent !== "string" || !TX_HASH.test(sent))
        return fail(tr("Tu wallet no devolvió un tx hash válido."));
      await verify(sent);
    } catch (e) {
      fail(
        codeOf(e) === USER_REJECTED
          ? tr("Rechazaste la firma en tu wallet: no se envió ninguna transacción.")
          : tr("Tu wallet respondió con un error: {detail}", { detail: detailOf(e) }),
      );
    }
  };

  const LABEL: Record<Step, string> = {
    idle: pendingHash ? tr("Verificar recibo") : tr("Firmar con mi wallet"),
    prepare: tr("Preparando la operación…"),
    connect: tr("Conectando tu wallet…"),
    chain: tr("Verificando la red…"),
    role: tr("Verificando el rol on-chain…"),
    sign: tr("Confirma la transacción en tu wallet…"),
    verify: tr("Verificando en la red…"),
  };
  const shownHash = sentHash ?? pendingHash;

  return (
    <div
      className="flex flex-col items-end gap-1 max-w-[340px]"
      data-wallet={chainTxId}
      data-wallet-state={busy ? step : pendingHash ? "pending" : "idle"}
      data-wallet-runs={runs}
    >
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => {
          if (busy || disabled) return;
          setError(null);
          setNotice(null);
          // Not a transition: every outcome (even an immediate one, like a missing wallet) renders at once, before
          // the attempt counter moves. The Server Actions' revalidation refreshes the desk either way.
          void (async () => {
            try {
              await (pendingHash ? verify(pendingHash) : sign());
            } finally {
              setRuns((n) => n + 1);
            }
          })();
        }}
        data-wallet-sign={pendingHash ? undefined : chainTxId}
        data-wallet-verify={pendingHash ? chainTxId : undefined}
        className="tc-btn px-2.5 py-1.5 text-[11.5px] font-semibold inline-flex items-center gap-1.5 focus-ring disabled:opacity-50"
      >
        <Icon
          name={busy ? "Loader2" : pendingHash ? "RefreshCw" : "Wallet"}
          size={13}
          className={busy ? "spin" : ""}
        />
        {LABEL[step]}
      </button>
      {shownHash && (
        <p className="font-mono text-[10.5px] text-muted text-end" data-wallet-hash={shownHash}>
          {`tx ${shortHash(shownHash, 10, 6)}`}
        </p>
      )}
      {notice && !error && (
        <p className="text-[11px] text-goldInk text-end" data-wallet-notice>
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[11px] text-[#B42318] text-end" data-wallet-error>
          {error}
        </p>
      )}
    </div>
  );
}
