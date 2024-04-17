//@ts-nocheck
"use client";

import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { ZeroDevSmartWalletConnectors } from "@dynamic-labs/ethereum-aa";
import {
  DynamicContextProvider,
  DynamicWidget
} from "@dynamic-labs/sdk-react-core";

import usdtAbi from "../public/usdtAbi.json";

import { createPublicClient, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";


import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";

import { ethers } from "ethers";

import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient
} from "@zerodev/sdk";

import {
  signerToSessionKeyValidator,
  ParamOperator,
  serializeSessionKeyAccount,
  deserializeSessionKeyAccount,
  oneAddress,
} from "@zerodev/session-key"

import {
  UserOperation,
  walletClientToSmartAccountSigner,
} from "permissionless";

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

            const primaryWallet = args?.primaryWallet;

            console.log("primaryWallet", primaryWallet);

            if (!primaryWallet) {
              throw new Error("Primary wallet is required");
            }

            const sessionPrivateKey = generatePrivateKey();
            const sessionKeySigner = privateKeyToAccount(sessionPrivateKey);

            const eoaConnector =
              await primaryWallet?.connector?.getEOAConnector();
            const walletClient = await eoaConnector?.getWalletClient();

            if (!walletClient) return;

            const smartAccountSigner = await walletClientToSmartAccountSigner(
              walletClient
            );
            const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
              signer: smartAccountSigner,
            });

            const permissions = [
              {
                target: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
                valueLimit: BigInt(0),
                abi: usdtAbi,
                functionName: "balanceOf",
                args: [
                  {
                    operator: ParamOperator.EQUAL,
                    value: primaryWallet?.address,
                  },
                ],
              },
              {
                target: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
                valueLimit: BigInt(0),
                abi: usdtAbi,
                functionName: "transfer",
                args: [
                  { operator: ParamOperator.NOT_EQUAL, value: "1" },
                  { operator: ParamOperator.GREATER_THAN, value: 0 },
                ],
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

            const sessionKeyAccountKernel = await createKernelAccount(
              publicClient,
              {
                plugins: {
                  sudo: ecdsaValidator,
                  regular: sessionKeyValidator,
                },
              }
            );

            const serializedSessionKey = await serializeSessionKeyAccount(
              sessionKeyAccountKernel,
              sessionPrivateKey
            );

            const sessionKeyAccount = await deserializeSessionKeyAccount(
              publicClient,
              serializedSessionKey
            );

            const kernelClient = createKernelAccountClient({
              account: sessionKeyAccount,
              chain: polygon,
              transport: http(process.env.NEXT_PUBLIC_ZERODEV_BUNDLER_RPC),
              sponsorUserOperation: async ({
                userOperation,
              }): Promise<UserOperation> => {
                const paymasterClient = createZeroDevPaymasterClient({
                  chain: polygon,
                  transport: http(
                    process.env.NEXT_PUBLIC_ZERODEV_PAYMASTER_RPC
                  ),
                });
                return paymasterClient.sponsorUserOperation({
                  userOperation,
                });
              },
            });

            console.log("kernelClient", kernelClient);

            // // following uoCallData sends 0.1 USDT to 0x9C3C4ba068CD06Da93d31F2983298590907d3766
            // const iface = new ethers.Interface(usdtAbi);
            // const uoCallData = iface.encodeFunctionData("transfer", [
            //   "0x9C3C4ba068CD06Da93d31F2983298590907d3766",
            //   ethers.parseUnits("0.1", 6),
            // ]);

            // const hash = await kernelClient?.sendUserOperation({
            //   userOperation: {
            //     callData: kernelClient?.account.encodeCallData({
            //       to: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
            //       value: BigInt(0),
            //       data: uoCallData,
            //     }),
            //   },
            // });

            console.log("hash", hash);
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
