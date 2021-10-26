import { BigNumber } from "ethers"
import { Block as EthersBlock } from "@ethersproject/abstract-provider"
import { Network as EthersNetwork } from "@ethersproject/networks"
import { Transaction as EthersTransaction } from "@ethersproject/transactions"

import {
  AnyEVMTransaction,
  FungibleAsset,
  SmartContractFungibleAsset,
  EVMNetwork,
  SignedEVMTransaction,
  AnyEVMBlock,
} from "../../types"
import { ETHEREUM } from "../../constants"

/**
 * Parse a block as returned by a polling provider.
 */
export function blockFromEthersBlock(gethResult: EthersBlock): AnyEVMBlock {
  return {
    hash: gethResult.hash,
    blockHeight: gethResult.number,
    parentHash: gethResult.parentHash,
    // FIXME Hold for ethers/v5.4.8 _difficulty BigNumber field; the current
    // FIXME difficutly field is a `number` and has overflowed since Ethereum
    // FIXME difficulty has exceeded MAX_SAFE_INTEGER. The current ethers
    // FIXME version devolves to `null` in that scenario, and does not reflect
    // FIXME in its type. The upcoming release will have a BigNumber
    // FIXME _difficulty field.
    difficulty: 0n,
    timestamp: gethResult.timestamp,
    baseFeePerGas: gethResult.baseFeePerGas?.toBigInt(),
    network: ETHEREUM,
  }
}

/**
 * Parse a block as returned by a websocket provider subscription.
 */
export function blockFromWebsocketBlock(
  incomingGethResult: unknown
): AnyEVMBlock {
  const gethResult = incomingGethResult as {
    hash: string
    number: string
    parentHash: string
    difficulty: string
    timestamp: string
    baseFeePerGas?: string
  }

  return {
    hash: gethResult.hash,
    blockHeight: BigNumber.from(gethResult.number).toNumber(),
    parentHash: gethResult.parentHash,
    difficulty: BigInt(gethResult.difficulty),
    timestamp: BigNumber.from(gethResult.timestamp).toNumber(),
    baseFeePerGas: gethResult.baseFeePerGas
      ? BigInt(gethResult.baseFeePerGas)
      : undefined,
    network: ETHEREUM,
  }
}

export function ethersTxFromSignedTx(
  tx: SignedEVMTransaction
): EthersTransaction {
  const baseTx = {
    nonce: Number(tx.nonce),
    maxFeePerGas: tx.maxFeePerGas ? BigNumber.from(tx.maxFeePerGas) : undefined,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas
      ? BigNumber.from(tx.maxPriorityFeePerGas)
      : undefined,
    to: tx.to,
    from: tx.from,
    data: tx.input || "",
    chainId: parseInt(tx.network.chainID, 10),
    value: BigNumber.from(tx.value),
    gasLimit: BigNumber.from(tx.gasLimit),
  }

  return {
    ...baseTx,
    r: tx.r,
    s: tx.s,
    v: tx.v,
  }
}

/**
 * Parse a transaction as returned by a websocket provider subscription.
 */
export function txFromWebsocketTx(
  websocketTx: unknown,
  asset: FungibleAsset,
  network: EVMNetwork
): AnyEVMTransaction {
  // These are the props we expect here.
  const tx = websocketTx as {
    hash: string
    to: string
    from: string
    gas: string
    gasPrice: string
    maxFeePerGas: string | undefined | null
    maxPriorityFeePerGas: string | undefined | null
    input: string
    r: string
    s: string
    v: string
    nonce: string
    value: string
    blockHash: string | undefined | null
    blockHeight: string | undefined | null
    blockNumber: number | undefined | null
    type: string | undefined | null
  }

  return {
    hash: tx.hash,
    to: tx.to,
    from: tx.from,
    gasLimit: BigInt(tx.gas),
    gasPrice: BigInt(tx.gasPrice),
    maxFeePerGas: tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : null,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas
      ? BigInt(tx.maxPriorityFeePerGas)
      : null,
    input: tx.input,
    r: tx.r || undefined,
    s: tx.s || undefined,
    v: BigNumber.from(tx.v).toNumber(),
    nonce: Number(tx.nonce),
    value: BigInt(tx.value),
    blockHash: tx.blockHash ?? null,
    blockHeight: tx.blockNumber ?? null,
    type:
      tx.type !== undefined
        ? (BigNumber.from(tx.type).toNumber() as AnyEVMTransaction["type"])
        : 0,
    asset,
    network,
  }
}

/**
 * Parse a transaction as returned by a polling provider.
 */
export function txFromEthersTx(
  tx: EthersTransaction & {
    from: string
    blockHash?: string
    blockNumber?: number
    type?: number | null
  },
  asset: FungibleAsset | SmartContractFungibleAsset,
  network: EVMNetwork
): AnyEVMTransaction {
  if (tx.hash === undefined) {
    throw Error("Malformed transaction")
  }
  if (tx.type !== 0 && tx.type !== 1 && tx.type !== 2) {
    throw Error(`Unknown transaction type ${tx.type}`)
  }

  let value = tx.value.toBigInt()

  // Derive value from transaction transfer data if not ETH
  if (asset.symbol !== "ETH") {
    value = BigInt(parseInt(tx.data.slice(-64), 16))
  }

  const newTx = {
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    nonce: parseInt(tx.nonce.toString(), 10),
    gasLimit: tx.gasLimit.toBigInt(),
    gasPrice: tx.gasPrice ? tx.gasPrice.toBigInt() : null,
    maxFeePerGas: tx.maxFeePerGas ? tx.maxFeePerGas.toBigInt() : null,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas
      ? tx.maxPriorityFeePerGas.toBigInt()
      : null,
    value,
    input: tx.data,
    type: tx.type,
    blockHash: tx.blockHash || null,
    blockHeight: tx.blockNumber || null,
    network,
    asset,
  } as const // narrow types for compatiblity with our internal ones

  if (tx.r && tx.s && tx.v) {
    const signedTx: SignedEVMTransaction = {
      ...newTx,
      r: tx.r,
      s: tx.s,
      v: tx.v,
    }
    return signedTx
  }
  return newTx
}

/**
 * Convert Tally's Network type to Ethers' Network type.
 */
export function networkToEthersNetwork(network: EVMNetwork): EthersNetwork {
  let networkName

  if (network.name === "Ethereum") {
    networkName = "homestead" // Ethers refers to mainnet as homestead
  } else {
    networkName = network.name.toLowerCase()
  }

  return {
    name: networkName,
    chainId: Number(network.chainID),
  }
}
