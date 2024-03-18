//@ts-nocheck
"use client";

import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { ZeroDevSmartWalletConnectors } from "@dynamic-labs/ethereum-aa";
import {
  DynamicContextProvider,
  DynamicWidget,
  // imported createWalletClientFromWallet
  createWalletClientFromWallet,
} from "@dynamic-labs/sdk-react-core";

import usdtAbi from "../public/usdtAbi.json";

import { http, createPublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";

import { LocalAccountSigner } from "@alchemy/aa-core";

import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";

import {
  signerToSessionKeyValidator,
  ParamOperator, oneAddress,
  serializeSessionKeyAccount
} from "@zerodev/session-key";
import { walletClientToSmartAccountSigner } from "permissionless";
import { createKernelAccount } from "@zerodev/sdk";

export default function Home() {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID,
        eventsCallbacks: {
          onAuthSuccess: async (args) => {
              const publicClient = createPublicClient({
                chain: polygon,
                transport: http(process.env.NEXT_PUBLIC_ZERODEV_BUNDLER_RPC),
              });

              const sessionPrivateKey = generatePrivateKey();
              const sessionKeySigner = privateKeyToAccount(sessionPrivateKey);

              const owner =
                LocalAccountSigner.privateKeyToAccountSigner(sessionPrivateKey);

                // Changes started
                const primaryWallet = args?.primaryWallet

                if (!primaryWallet) {
                  throw new Error("Primary wallet is required");
                }

                const walletClient = await createWalletClientFromWallet(primaryWallet)

              const smartAccountSigner = await walletClientToSmartAccountSigner(
                walletClient
              );
              // Changes ended


              const ecdsaValidator = await signerToEcdsaValidator(
                publicClient,
                {
                  signer: smartAccountSigner,
                }
              );

              const permissions = [
                {
                  target: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
                  valueLimit: 0n,
                  abi: usdtAbi,
                  functionName: "balanceOf",
                  args: [
                    {
                      operator: ParamOperator.EQUAL,
                      value: args?.primaryWallet?.address,
                    }, // User's address
                  ],
                },
                {
                  target: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
                  valueLimit: 0n,
                  abi: usdtAbi,
                  functionName: "transfer",
                  args: [{ operator: ParamOperator.GREATER_THAN, value: 0 }],
                },
              ];


              const sessionKeyValidator = await signerToSessionKeyValidator(
                publicClient,
                {
                  signer: sessionKeySigner,
                  validatorData: {
                    paymaster: oneAddress,
                    permissions: permissions,
                  },
                }
              );

              const sessionKeyAccount = await createKernelAccount(
                publicClient,
                {
                  plugins: {
                    sudo: ecdsaValidator,
                    regular: sessionKeyValidator,
                  },
                }
              );

              console.log("sessionKeyAccount", sessionKeyAccount)
              
              // adding the following to serialize the session key account
              const serializedSessionKey = await serializeSessionKeyAccount(sessionKeyAccount, sessionPrivateKey)

          },
        },
        walletConnectors: [
          EthereumWalletConnectors,
          ZeroDevSmartWalletConnectors,
        ],
      }}
    >
      <DynamicWidget />
    </DynamicContextProvider>
  );
}