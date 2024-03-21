//@ts-nocheck
"use client";

import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { ZeroDevSmartWalletConnectors } from "@dynamic-labs/ethereum-aa";
import {
  createWalletClientFromWallet,
  DynamicContextProvider,
  DynamicWidget,
} from "@dynamic-labs/sdk-react-core";

import usdtAbi from "../public/usdtAbi.json";

import { createPublicClient, http, WalletClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";

import { LocalAccountSigner } from "@alchemy/aa-core";

import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";

import { ethers } from "ethers";

import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
  KernelPluginManager,
} from "@zerodev/sdk";
import { KernelEncodeCallDataArgs } from "@zerodev/sdk/types";
import {
  UserOperation,
  walletClientToSmartAccountSigner,
} from "permissionless";
import { SmartAccountSigner } from "permissionless/accounts";

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

            if (!primaryWallet) {
              throw new Error("Primary wallet is required");
            }

            const walletClient = await createWalletClientFromWallet(
              primaryWallet
            );

            if (!walletClient) return;

            const smartAccountSigner = (await walletClientToSmartAccountSigner(
              walletClient as WalletClient
            )) as SmartAccountSigner;

            const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
              signer: smartAccountSigner as SmartAccountSigner,
            });

            console.log("ecdsaValidator", ecdsaValidator);

            const account = await createKernelAccount(publicClient, {
              deployedAccountAddress: primaryWallet?.address,
              plugins: {
                sudo: ecdsaValidator,
              },
            });


            const kernelClient = createKernelAccountClient({
              account: account,
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

            console.log("My account:", kernelClient);

            const iface = new ethers.Interface(usdtAbi); 


            // From intersend web-app

            // --------*********---------
            // const uoCallData = iface.encodeFunctionData('transfer',
            // [
            //   walletAddressInput?.toString(),
            // ethers.parseUnits(usdtTransferDetails?.amount?.toString(), 6),
            // ]);

            // --------*********---------



            // following uoCallData sends 0.1 USDT to 0x9C3C4ba068CD06Da93d31F2983298590907d3766 
            const uoCallData = iface.encodeFunctionData("transfer", [
              "0x9C3C4ba068CD06Da93d31F2983298590907d3766",
              ethers.parseUnits("0.1", 6),
            ]);

            const hash = await kernelClient?.sendUserOperation({
              userOperation: {
                callData: (await kernelClient?.account.encodeCallData({
                  to: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // this is USDT address
                  value: BigInt(0),
                  data: uoCallData,
                })),
              },
            });
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
